from fastapi import APIRouter, HTTPException, Request
import logging
import asyncio
import random
from backend_api.common.database import get_redis, get_db
from backend_api.common.utils import build_avatar_url
from backend_api.common.models import CzLevelBatchRequest
import orjson as json
# 仅从微服务本地引入极简函数
from backend_api.czlevel_api.routers.services import (
    fetch_users_batch_from_db,
    enqueue_to_batch_buffer  # 👈 补充导入
)

logger = logging.getLogger("CzLevelAPI")
router = APIRouter(tags=["czlevel"])

# czlevel.py
@router.post("/api/czlevel/batch")
async def batch_check_cz_level(req: CzLevelBatchRequest, request: Request):
    # 1. 提取并去重请求参数
    targets = list({str(t).strip() for t in req.targets if str(t).strip()})
    user_ids = list({str(u).strip() for u in req.user_ids if str(u).strip()})

    if not targets and not user_ids:
        raise HTTPException(status_code=400, detail="查询参数 targets 和 user_ids 不能同时为空")
        
    if len(targets) + len(user_ids) > 100:
        raise HTTPException(status_code=400, detail="批量查询总数不能超过 100 条")

    pool = get_db()
    redis = await get_redis()
    
    query_items = [("display_id", t) for t in targets] + [("user_id", u) for u in user_ids]
    
    # 2. 构造 Redis 缓存 Key 并批量 MGET
    # display_id 统一转小写作为缓存 key，解决 citext 匹配问题
    redis_keys = []
    for q_type, q_val in query_items:
        if q_type == "display_id":
            redis_keys.append(f"czlevel:did:{q_val.lower()}")
        else:
            redis_keys.append(f"czlevel:uid:{q_val}")
            
    try:
        cached_values = await redis.mget(*redis_keys) if redis_keys else []
    except Exception as e:
        logger.error(f"❌ Redis MGET 异常: {e}")
        cached_values = [None] * len(redis_keys)

    # 3. 分离缓存命中与未命中的数据
    db_records = {}          # 最终聚合的数据集
    missing_targets = []     # 未命中缓存的 display_id
    missing_user_ids = []    # 未命中缓存的 user_id
    
    for (q_type, q_val), cache_val in zip(query_items, cached_values):
        if cache_val:
            # 命中缓存，解析 JSON 并明确标记来源为 cache
            record = json.loads(cache_val)
            record['_source'] = "cache"  # 👈 明确注入来源标识
            
            if record.get('display_id'):
                db_records[record['display_id']] = record
                db_records[record['display_id'].lower()] = record
            if record.get('user_id'):
                db_records[str(record['user_id'])] = record
        else:
            if q_type == "display_id":
                missing_targets.append(q_val)
            else:
                missing_user_ids.append(q_val)

    # 4. 针对未命中的缓存，走数据库查询
    if missing_targets or missing_user_ids:
        try:
            new_db_records = await fetch_users_batch_from_db(pool, display_ids=missing_targets, user_ids=missing_user_ids)
            
            # 为数据库查出来的记录标记来源为 database
            for r in new_db_records.values():
                r['_source'] = "database" # 👈 明确注入来源标识
                
            db_records.update(new_db_records)
            
            # 提取其中 level >= 12 的用户，异步回写到 Redis
            asyncio.create_task(cache_high_level_users(redis, new_db_records.values()))
        except Exception as e:
            logger.error(f"❌ 批量查库异常: {e}")

    # 5. 组装返回结果
    final_response = []
    for q_type, q_val in query_items:
        record = db_records.get(q_val)
        if not record and q_type == "display_id":
            record = db_records.get(q_val.lower())
            
        # 👈 直接读取 record 里精准的 _source 属性，不再依赖外部变量
        source = record.get('_source', 'not_found') if record else "not_found"
        
        level = record['raw_cz_level'] if (record and record.get('raw_cz_level') is not None) else 0
        
        if record:
            final_response.append({
                "query":      q_val,
                "user_id":    str(record.get('user_id', '')),  
                "sec_uid":    record.get('sec_uid') or "",
                "display_id": record.get('display_id') or ("" if q_type=="user_id" else q_val),
                "nickname":   record.get('user_name') or "未知用户",
                "avatar":     build_avatar_url(record.get('avatar_url')),
                "level":      level,
                "source":     source,  # 这里的 source 恢复精准判定！
                "passed":     level >= 12,
            })
        else:
            final_response.append({
                "query":      q_val,
                "user_id":    q_val if q_type == "user_id" else "",                              
                "sec_uid":    "",
                "display_id": q_val if q_type == "display_id" else "", 
                "nickname":   "查无此人",
                "avatar":     "",
                "level":      0,
                "source":     "not_found",
                "passed":     False,
            })

        # < 12 级的入更新队列
        if level < 12:
            target_for_queue = record['sec_uid'] if (record and record.get('sec_uid')) else q_val
            queue_type = "sec" if (record and record.get('sec_uid')) else ("did" if q_type == "display_id" else "uid")
            
            
            # 直接放入内存 Buffer 队列（纳秒级操作，高并发零开销）
            await enqueue_to_batch_buffer(target_for_queue, level, queue_type)

    return {"results": final_response}
async def cache_high_level_users(redis, records):
    if not records or not redis: return
    
    pipe = redis.pipeline()
    count = 0
    # 建立一个去重集合避免重复处理同一个 user
    processed_uids = set()
    
    for rec in records:
        uid = str(rec.get('user_id'))
        if uid in processed_uids:
            continue
            
        level = rec.get('raw_cz_level')
        if level is not None and level >= 12:
            processed_uids.add(uid)
            val = json.dumps(rec)
            # 基础过期时间 1 天 (86400秒)，加上 0~2小时的随机偏移，防止集中雪崩
            ttl = 86400 + random.randint(0, 7200)
            
            did = rec.get('display_id')
            if did:
                pipe.set(f"czlevel:did:{did.lower()}", val, ex=ttl)
            if uid:
                pipe.set(f"czlevel:uid:{uid}", val, ex=ttl)
            count += 1
            
    if count > 0:
        try:
            await pipe.execute()
        except Exception as e:
            logger.error(f"❌ 缓存回写异常: {e}")