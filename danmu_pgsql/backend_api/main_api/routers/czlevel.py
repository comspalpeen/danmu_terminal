from fastapi import APIRouter, HTTPException, Query, Request
import logging
import orjson as json

from backend_api.common.database import get_redis, get_db
from backend_api.common.utils import build_avatar_url
from backend_api.czlevel_api.routers.services import parse_query_target

# 全部引入自 main_api 本地业务层
from backend_api.main_api.routers.czlevel_services import (
    get_dynamic_settings,
    fetch_user_record_from_db,
    evaluate_business_shields,
    execute_network_update
)

logger = logging.getLogger("MainAPI_CzLevel")
router = APIRouter(tags=["czlevel_single"])
@router.get("/api/czlevel/author")
async def get_cz_author_info():
    pool = get_db()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM authors WHERE sec_uid = 'MS4wLjABAAAA58AFQVygQ3MfiCpOXp-RTUqdyHY-oVSJQHsyWhg4S78' LIMIT 1")
            if not row: return {"error": "未找到陈泽的档案数据"}
            res = dict(row)
            res["avatar"] = build_avatar_url(res.get("avatar"))
            return res
    except Exception as e:
        raise HTTPException(status_code=500, detail="数据库查询异常")
@router.get("/api/czlevel")
async def check_cz_level(request: Request, display_id: str = Query(None), user_id: str = Query(None)):
    query_str = (display_id or "").strip()
    target_user_id = (user_id or "").strip()

    if not query_str and not target_user_id: 
        raise HTTPException(status_code=400, detail="查询参数不能为空")

    pool = get_db()
    redis = await get_redis()
    settings = await get_dynamic_settings(redis)
    api_switch = settings["single_api_switch"]

    target_sec_uid, target_display_id = parse_query_target(query_str) if query_str else (None, None)
    
    user_record = None
    try: 
        user_record = await fetch_user_record_from_db(
            pool, 
            target_sec_uid=target_sec_uid, 
            target_display_id=target_display_id,
            target_user_id=target_user_id
        )
    except Exception as e: 
        logger.error(f"❌ 查库异常: {e}")
        
    if user_record:
        if not target_user_id and user_record.get('user_id'): target_user_id = str(user_record['user_id'])
        if not target_sec_uid: target_sec_uid = user_record.get('sec_uid')
        if not target_display_id: target_display_id = user_record.get('display_id')

    shield_result = evaluate_business_shields(
        user_record, query_str or target_user_id, target_sec_uid, target_display_id,
        settings["enable_zero_level_shield"], settings["active_shield_days"]
    )
    if shield_result: 
        if isinstance(shield_result, dict):
            shield_result["user_id"] = target_user_id
        return shield_result

    if api_switch == 0:
        raw_level = user_record['raw_cz_level'] if user_record else None
        return {
            "user_id":    target_user_id,
            "sec_uid":    user_record['sec_uid'] if user_record else (target_sec_uid or ""),
            "display_id": target_display_id or query_str,
            "nickname":   user_record['user_name'] if user_record else "未知用户",
            "avatar":     build_avatar_url(user_record['avatar_url']) if user_record else "",
            "level":      raw_level if raw_level is not None else 0,
            "source":     "database_only",
            "passed":     (raw_level or 0) >= 12,
        }

    cache_target = target_user_id or target_sec_uid or target_display_id
    cache_key = f"czlevel:cache:{cache_target}"
    if redis:
        try:
            cached_val = await redis.get(cache_key)
            if cached_val: return json.loads(cached_val)
        except: pass

    success, final_res = await execute_network_update(
        pool, redis, target_sec_uid, target_display_id, target_user_id
    )

    if success and final_res:
        return final_res
        
    # 兜底返回 (如果网络获取彻底失败)
    return {
        "user_id": target_user_id, "sec_uid": target_sec_uid or "", "display_id": target_display_id or query_str,
        "nickname": user_record['user_name'] if user_record else "未知用户",
        "avatar": build_avatar_url(user_record['avatar_url']) if user_record else "",
        "level": user_record['raw_cz_level'] if user_record and user_record['raw_cz_level'] is not None else 0,
        "source": "convert_failed", "passed": False
    }