import time
import orjson as json
from fastapi import APIRouter, Query

from backend_api.common.database import get_redis

router = APIRouter(prefix="/api/admin/metrics", tags=["admin_metrics"])


@router.get("/history")
async def get_metrics_history(minutes: int = Query(60, ge=1, le=10080)):
    redis = await get_redis()
    if not redis:
        return {"items": []}

    now = int(time.time())
    start_ts = now - minutes * 60
    keys = await redis.zrangebyscore("czlevel:metrics_timeline", start_ts, now)
    if not keys:
        return {"items": []}

    raw_values = await redis.mget(*keys) if keys else []
    items = []
    for key, raw in zip(keys, raw_values):
        if not raw:
            continue
        item = json.loads(raw)
        item["redis_key"] = key.decode() if isinstance(key, bytes) else key
        items.append(item)

    return {"items": items}


@router.get("/realtime")  # 👈 已修补：改为相对路径 "/realtime"
async def get_realtime_metrics():
    """获取所有 Worker 汇总后的全局实时并发数"""
    redis = await get_redis()
    active = 0
    peak = 0
    
    if redis:
        # 找到所有以 worker PID 结尾的实时状态 key
        keys = await redis.keys("czlevel:metrics:realtime:*")
        if keys:
            data_list = await redis.mget(*keys)
            for data in data_list:
                if data:
                    j = json.loads(data)
                    active += j.get("active", 0)
                    peak += j.get("peak", 0)
                    
    return {
        "code": 0,
        "data": {
            "active_requests": active,
            "peak_concurrency": peak
        }
    }