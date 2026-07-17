from fastapi import APIRouter, HTTPException, Request
import logging
import asyncio
from backend_api.common.database import get_redis, get_db
from backend_api.common.utils import build_avatar_url
from backend_api.common.models import CzLevelBatchRequest

# 仅从微服务本地引入极简函数
from backend_api.czlevel_api.routers.services import (
    fetch_users_batch_from_db,
    push_to_update_queue
)

logger = logging.getLogger("CzLevelAPI")
router = APIRouter(tags=["czlevel"])

# czlevel.py
@router.post("/api/czlevel/batch")
async def batch_check_cz_level(req: CzLevelBatchRequest, request: Request):
    # 1. 干净地提取两个列表
    targets = [str(t).strip() for t in req.targets if str(t).strip()]
    user_ids = [str(u).strip() for u in req.user_ids if str(u).strip()]

    if not targets and not user_ids:
        raise HTTPException(status_code=400, detail="查询参数 targets 和 user_ids 不能同时为空")
        
    if len(targets) + len(user_ids) > 100:
        raise HTTPException(status_code=400, detail="批量查询总数不能超过 100 条")

    pool = get_db()
    redis = await get_redis()
    
    try: 
        # 将两组数据同时传给底层进行一次性查询
        db_records = await fetch_users_batch_from_db(pool, display_ids=targets, user_ids=user_ids)
    except Exception as e:
        logger.error(f"❌ 批量查库异常: {e}")
        db_records = {}
        
    final_response = []
    
    # 将两种查询合并为元组进行统一处理 (类型, 查询值)
    query_items = [("display_id", t) for t in targets] + [("user_id", u) for u in user_ids]
    
    for q_type, q_val in query_items:
        record = db_records.get(q_val)
        if not record and q_type == "display_id":
            record = db_records.get(q_val.lower())
            
        source = "database_only" if record else "not_found"
        level = 0
        
        if record:
            raw_level = record['raw_cz_level']
            level = raw_level if raw_level is not None else 0
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
                "source":     source,
                "passed":     False,
            })

        if level < 12:
            if record and record.get('sec_uid'):
                target_for_queue = record['sec_uid']
                queue_type = "sec"
            else:
                target_for_queue = q_val
                queue_type = "did" if q_type == "display_id" else "uid"
            
            asyncio.create_task(push_to_update_queue(redis, target_for_queue, level, queue_type))

    return {"results": final_response}