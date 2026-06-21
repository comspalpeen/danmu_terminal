import logging
import re
import time

logger = logging.getLogger("CzLevelService")

def _to_text(value):
    if isinstance(value, bytes):
        return value.decode()
    return value

def _to_int(value, default: int) -> int:
    text = _to_text(value)
    if text in (None, ""):
        return default
    try:
        return int(text)
    except (TypeError, ValueError):
        return default

# 查询目标解析
def parse_query_target(query_str: str):
    sec_uid_match = re.search(r'(?:user/|sec_uid=)?(MS4wLjABAAAA[A-Za-z0-9_\-]+)', query_str)
    target_sec_uid = sec_uid_match.group(1) if sec_uid_match else None
    target_display_id = None if target_sec_uid else query_str
    return target_sec_uid, target_display_id

# 批量查库逻辑 (仅供 batch 接口调用)
async def fetch_users_batch_from_db(pool, sec_uids: list, display_ids: list) -> dict:
    db_records = {}
    if not sec_uids and not display_ids:
        return db_records
        
    async with pool.acquire() as conn:
        base_query = """
            SELECT u.user_id, u.sec_uid, u.display_id, u.user_name, u.avatar_url, f.cz_club_level AS raw_cz_level
            FROM users u LEFT JOIN cz_fans f ON u.user_id = f.user_id
        """
        
        queries = []
        params = []
        param_idx = 1
        
        if display_ids:
            queries.append(f"{base_query} WHERE u.display_id = ANY(${param_idx}::citext[])")
            params.append(display_ids)
            param_idx += 1
            
        if sec_uids:
            queries.append(f"{base_query} WHERE u.sec_uid = ANY(${param_idx}::text[])")
            params.append(sec_uids)
            param_idx += 1

        if not queries:
            return db_records

        query = "\nUNION ALL\n".join(queries)
        rows = await conn.fetch(query, *params)

        for r in rows:
            row_dict = dict(r)
            if r['user_id']:
                db_records[str(r['user_id'])] = row_dict
            if r['sec_uid']:
                db_records[r['sec_uid']] = row_dict
            if r['display_id']:
                db_records[r['display_id']] = row_dict
                db_records[r['display_id'].lower()] = row_dict
                
    return db_records

# 生产入队函数：保持轻量，供批量接口、单次查询或轮询脚本灵活调用
async def push_to_update_queue(redis, target: str, current_level: int):
    if not redis or not target: 
        return
    
    cooldown_seconds = 10800 
    lock_key = f"czlevel:cd_lock:{target}"
    
    try:
        is_locked = await redis.set(lock_key, "1", ex=cooldown_seconds, nx=True)
        if not is_locked:
            return  
    except Exception as e:
        logger.error(f"❌ 冷却锁判断异常 [{target}]: {e}")
        pass 
    
    level = current_level if current_level is not None else 0
    if level == 11 or level == 0:
        priority = 1  
    elif 8 <= level <= 10:
        priority = 2  
    else:
        priority = 3  
        
    score = (priority * 10000000000) + int(time.time())
    
    try:
        await redis.zadd("czlevel:update_queue", {target: score}, nx=True)
    except Exception as e:
        logger.error(f"❌ 入队异常 [{target}]: {e}")