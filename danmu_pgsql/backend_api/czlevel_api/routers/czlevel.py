from fastapi import APIRouter, HTTPException, Request
import logging
import asyncio
import random
import time
from backend_api.common.database import get_redis, get_db
from backend_api.common.utils import build_avatar_url
from backend_api.common.models import CzLevelBatchRequest
import orjson as json
from backend_api.czlevel_api.metrics import metrics
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
    metrics.request_start()
    start_time = time.perf_counter()
    redis_keys = []
    cached_values = []
    try:
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
        
        # 2. 构造 Redis 缓存 Key (仅限 display_id)
        display_id_queries = [q_val for q_type, q_val in query_items if q_type == "display_id"]
        for did in display_id_queries:
            redis_keys.append(f"czlevel:did:{did.lower()}")
                
        try:
            cached_values = await redis.mget(*redis_keys) if redis and redis_keys else []
        except Exception as e:
            logger.error(f"❌ Redis MGET 异常: {e}")
            cached_values = [None] * len(redis_keys)

        # 3. 分离缓存命中与未命中的数据
        db_records = {}          
        missing_targets = []     
        # 直接将所有的 user_id 当作未命中，强制走数据库查询
        missing_user_ids = [q_val for q_type, q_val in query_items if q_type == "user_id"] 
        
        # 仅针对 display_id 进行缓存结果解析
        for q_val, cache_val in zip(display_id_queries, cached_values):
            if cache_val:
                record = json.loads(cache_val)
                record['_source'] = "cache" 
                
                if record.get('display_id'):
                    db_records[record['display_id']] = record
                    db_records[record['display_id'].lower()] = record
                if record.get('user_id'):
                    db_records[str(record['user_id'])] = record
            else:
                missing_targets.append(q_val)

        # 4. 针对未命中的 display_id 缓存，以及全部的 user_id，走数据库查询
        if missing_targets or missing_user_ids:
            try:
                new_db_records = await fetch_users_batch_from_db(pool, display_ids=missing_targets, user_ids=missing_user_ids)
                
                for r in new_db_records.values():
                    r['_source'] = "database" 
                    
                db_records.update(new_db_records)
                
                # 提取其中 level >= 12 的用户，异步回写到 Redis (已在下方去除了 uid 缓存)
                asyncio.create_task(cache_high_level_users(redis, new_db_records.values()))
            except Exception as e:
                logger.error(f"❌ 批量查库异常: {e}")

        # 5. 组装返回结果 (保持原样)
        final_response = []
        for q_type, q_val in query_items:
            record = db_records.get(q_val)
            if not record and q_type == "display_id":
                record = db_records.get(q_val.lower())
                
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
                    "source":     source, 
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

            if level < 12:
                target_for_queue = record['sec_uid'] if (record and record.get('sec_uid')) else q_val
                queue_type = "sec" if (record and record.get('sec_uid')) else ("did" if q_type == "display_id" else "uid")
                await enqueue_to_batch_buffer(target_for_queue, level, queue_type)

        return {"results": final_response}
    finally:
        cost_ms = (time.perf_counter() - start_time) * 1000
        cache_hits = sum(1 for value in cached_values if value)
        total_keys = len(redis_keys)
        cache_misses = max(0, total_keys - cache_hits) if total_keys > 0 else 0
        metrics.request_finish(cost_ms, cache_hits, cache_misses)

async def cache_high_level_users(redis, records):
    if not records or not redis: return
    
    pipe = redis.pipeline()
    count = 0
    processed_uids = set()
    
    for rec in records:
        uid = str(rec.get('user_id'))
        if uid in processed_uids:
            continue
            
        level = rec.get('raw_cz_level')
        if level is not None and level >= 12:
            processed_uids.add(uid)
            val = json.dumps(rec)
            ttl = 86400 + random.randint(0, 7200)
            
            did = rec.get('display_id')
            # 仅保留 display_id 的缓存回写
            if did:
                pipe.set(f"czlevel:did:{did.lower()}", val, ex=ttl)
                count += 1
            
    if count > 0:
        try:
            await pipe.execute()
        except Exception as e:
            logger.error(f"❌ 缓存回写异常: {e}")