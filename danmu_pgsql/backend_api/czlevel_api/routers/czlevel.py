from fastapi import APIRouter, HTTPException, Request
import logging
import asyncio
from backend_api.common.database import get_redis, get_db
from backend_api.common.utils import build_avatar_url
from backend_api.common.models import CzLevelBatchRequest

# 仅从微服务本地引入极简函数
from backend_api.czlevel_api.routers.services import (
    parse_query_target,
    fetch_users_batch_from_db,
    push_to_update_queue
)

logger = logging.getLogger("CzLevelAPI")
router = APIRouter(tags=["czlevel"])

@router.post("/api/czlevel/batch")
async def batch_check_cz_level(req: CzLevelBatchRequest, request: Request):
    raw_targets = getattr(req, "targets", []) or []
    targets = [str(t).strip() for t in raw_targets if str(t).strip()]

    if not targets: raise HTTPException(status_code=400, detail="查询参数不能为空")
    if len(targets) > 100: raise HTTPException(status_code=400, detail="批量查询不能超过 100 条")
        
    parsed_targets = {}
    sec_uids_to_query, display_ids_to_query = [], []
    
    for t in targets:
        target_sec_uid, target_display_id = parse_query_target(t)
        if target_sec_uid:
            parsed_targets[t] = {"type": "sec_uid", "value": target_sec_uid}
            sec_uids_to_query.append(target_sec_uid)
        else:
            parsed_targets[t] = {"type": "display_id", "value": t}
            display_ids_to_query.append(t)

    pool = get_db()
    redis = await get_redis()
    
    try: 
        db_records = await fetch_users_batch_from_db(pool, sec_uids_to_query, display_ids_to_query)
    except Exception as e:
        logger.error(f"❌ 批量查库异常: {e}")
        db_records = {}
        
    final_response = []
    
    for t in targets:
        item = parsed_targets[t]
        val_str = str(item["value"])
        record = db_records.get(val_str) or db_records.get(val_str.lower())
        source = "database_only" if record else "not_found"

        level = 0
        if record:
            raw_level = record['raw_cz_level']
            level = raw_level if raw_level is not None else 0
            final_response.append({
                "query":      t,
                "user_id":    str(record.get('user_id', '')),  # 👉 新增 user_id 字段
                "sec_uid":    record.get('sec_uid') or "",
                "display_id": record.get('display_id') or (val_str if item["type"] == "display_id" else ""),
                "nickname":   record.get('user_name') or "未知用户",
                "avatar":     build_avatar_url(record.get('avatar_url')),
                "level":      level,
                "source":     source,
                "passed":     level >= 12,
            })
        else:
            final_response.append({
                "query":      t,
                "user_id":    "",                              # 👉 新增 user_id 空字符串作为兜底
                "sec_uid":    "",
                "display_id": val_str if item["type"] == "display_id" else "",
                "nickname":   "查无此人",
                "avatar":     "",
                "level":      0,
                "source":     source,
                "passed":     False,
            })

        if level < 12:
            target_for_queue = record['sec_uid'] if (record and record.get('sec_uid')) else val_str
            asyncio.create_task(push_to_update_queue(redis, target_for_queue, level))

    return {"results": final_response}