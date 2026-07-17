import logging
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

# 批量查库逻辑 (仅供 batch 接口调用)
async def fetch_users_batch_from_db(pool, display_ids: list = None, user_ids: list = None) -> dict:
    db_records = {}
    if not display_ids and not user_ids:
        return db_records
        
    async with pool.acquire() as conn:
        conditions = []
        args = []
        
        # 动态组装查询条件
        if display_ids:
            args.append(display_ids)
            conditions.append(f"u.display_id = ANY(${len(args)}::citext[])")
            
        if user_ids:
            args.append(user_ids)
            # 假设你的 user_id 在数据库中是 varchar 或 text 类型
            conditions.append(f"u.user_id = ANY(${len(args)}::varchar[])") 
            
        where_clause = " OR ".join(conditions)
        
        query = f"""
            SELECT u.user_id, u.sec_uid, u.display_id, u.user_name, u.avatar_url, f.cz_club_level AS raw_cz_level
            FROM users u LEFT JOIN cz_fans f ON u.user_id = f.user_id
            WHERE {where_clause}
        """
        
        rows = await conn.fetch(query, *args)

        for r in rows:
            row_dict = dict(r)
            # 建立双向映射，方便上层无论用什么条件都能 O(1) 命中
            if r['display_id']:
                db_records[r['display_id']] = row_dict
                db_records[r['display_id'].lower()] = row_dict
            if r['user_id']:
                db_records[str(r['user_id'])] = row_dict
                
    return db_records

# 生产入队函数：原封不动保留
async def push_to_update_queue(redis, target: str, current_level: int, q_type: str = ""):
    if not redis or not target: 
        return
    
    # 组合带类型的 target，例如 "uid:12345" 或 "did:67890"
    # 如果没传 q_type，保持原样（兼容单次查询或其他未改造的入口）
    formatted_target = f"{q_type}:{target}" if q_type else target
    
    cooldown_seconds = 432000
    # 锁和队列中的 member 都使用这个带前缀的值
    lock_key = f"czlevel:cd_lock:{formatted_target}" 
    
    try:
        is_locked = await redis.set(lock_key, "1", ex=cooldown_seconds, nx=True)
        if not is_locked:
            return  
    except Exception as e:
        logger.error(f"❌ 冷却锁判断异常 [{formatted_target}]: {e}")
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
        # 入队时使用 formatted_target
        await redis.zadd("czlevel:update_queue", {formatted_target: score}, nx=True)
    except Exception as e:
        logger.error(f"❌ 入队异常 [{formatted_target}]: {e}")