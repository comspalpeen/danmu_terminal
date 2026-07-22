import logging
import time
import asyncio
logger = logging.getLogger("CzLevelService")
_push_buffer = asyncio.Queue()
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
async def enqueue_to_batch_buffer(target: str, current_level: int, q_type: str = ""):
    """仅将数据快速塞入本地内存队列，非阻塞，极高吞吐"""
    if not target:
        return
    await _push_buffer.put((target, current_level, q_type))
async def redis_batch_pusher_worker(get_redis_func, delay_seconds: float = 30.0, max_batch_size: int = 1000):
    logger.info("🚀 Redis 批量入队后台 Worker 已启动...")
    cooldown_seconds = 432000

    while True:
        try:
            items = []
            
            # 1. 阻塞等待第一条数据（队列为空时，永远挂起，不消耗任何 CPU，也不计时）
            first_item = await _push_buffer.get()
            items.append(first_item)

            # 2. 拿到第一条数据后，正式开启 30 秒“攒批”倒计时窗口
            start_time = time.time()
            while len(items) < max_batch_size:
                time_left = delay_seconds - (time.time() - start_time)
                if time_left <= 0:
                    break # 时间到，触发刷盘
                
                try:
                    # 3. 阻塞等待下一条数据，最多等待 time_left 秒
                    item = await asyncio.wait_for(_push_buffer.get(), timeout=time_left)
                    items.append(item)
                except asyncio.TimeoutError:
                    break # 超时触发刷盘
            
            # ======== 下方的 Redis 处理逻辑保持你的原样不变 ========
            redis = await get_redis_func()
            if not redis:
                logger.error("❌ Worker 获取 Redis 连接失败")
                continue

            # 2. 去重 & 准备 Pipeline 锁校验
            # 格式化 target，例如 "sec:xxx"
            formatted_items = {}
            for target, current_level, q_type in items:
                fmt_target = f"{q_type}:{target}" if q_type else target
                # 同一次 Batch 如果有重复，保留最新的 current_level
                formatted_items[fmt_target] = current_level

            # 3. 使用 Pipeline 批量获取/设置 SETNX 冷却锁
            pipe = redis.pipeline()
            fmt_targets = list(formatted_items.keys())
            
            for fmt_target in fmt_targets:
                lock_key = f"czlevel:cd_lock:{fmt_target}"
                pipe.set(lock_key, "1", ex=cooldown_seconds, nx=True)

            lock_results = await pipe.execute()

            # 4. 筛选出成功抢到锁（未处于 5 天 cooldown 冷却期）的用户，批量 ZADD
            zadd_mapping = {}
            now = int(time.time())

            for fmt_target, is_locked in zip(fmt_targets, lock_results):
                if is_locked:  # SETNX 成功才入队
                    level = formatted_items[fmt_target]
                    level = level if level is not None else 0

                    if level == 11 or level == 0:
                        priority = 1
                    elif 8 <= level <= 10:
                        priority = 2
                    else:
                        priority = 3

                    score = (priority * 10000000000) + now
                    zadd_mapping[fmt_target] = score

            # 5. 批量打包一次性发送给 Redis ZADD
            if zadd_mapping:
                await redis.zadd("czlevel:update_queue", zadd_mapping, nx=True)
                logger.info(f"✅ [Batch Worker] 成功推送 {len(zadd_mapping)} 条记录到 update_queue (忽略冷却中 {len(fmt_targets) - len(zadd_mapping)} 条)")

        except asyncio.CancelledError:
            logger.info("🛑 Redis Batch Worker 收到停止信号...")
            break
        except Exception as e:
            logger.error(f"❌ Batch Pusher Worker 运行异常: {e}", exc_info=True)
# 批量查库逻辑 (仅供 batch 接口调用)
async def fetch_users_batch_from_db(pool, display_ids: list = None, user_ids: list = None) -> dict:
    db_records = {}
    if not display_ids and not user_ids:
        return db_records
        
    async with pool.acquire() as conn:
        sub_queries = []
        args = []
        
        # 1. 如果传了 display_ids，独立生成走 display_id 索引的查询语句
        if display_ids:
            args.append(display_ids)
            sub_queries.append(f"""
                SELECT u.user_id, u.sec_uid, u.display_id, u.user_name, u.avatar_url, f.cz_club_level AS raw_cz_level
                FROM users u 
                LEFT JOIN cz_fans f ON u.user_id = f.user_id
                WHERE u.display_id = ANY(${len(args)}::citext[])
            """)
            
        # 2. 如果传了 user_ids，独立生成走 user_id 主键索引的查询语句
        if user_ids:
            args.append(user_ids)
            # 💡 提示：如果数据库里的 user_id 实际是 bigint，请将 ::varchar[] 改为 ::bigint[]
            sub_queries.append(f"""
                SELECT u.user_id, u.sec_uid, u.display_id, u.user_name, u.avatar_url, f.cz_club_level AS raw_cz_level
                FROM users u 
                LEFT JOIN cz_fans f ON u.user_id = f.user_id
                WHERE u.user_id = ANY(${len(args)}::varchar[])
            """)
        
        # 使用 UNION ALL 拼接查询，彻底避免 OR 条件带来的索引失效问题
        query = " UNION ALL ".join(sub_queries)
        
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