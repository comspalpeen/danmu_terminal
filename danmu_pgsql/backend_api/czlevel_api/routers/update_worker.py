import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, "../../../"))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import asyncio
import time
import logging

from backend_api.common.database import (
    init_redis, 
    get_redis, 
    init_pg, 
    get_db
)


from backend_api.main_api.routers.czlevel_services import (
    execute_network_update,
    fetch_user_record_from_db,
    get_dynamic_settings,         # 新增
    evaluate_business_shields,     # 新增
    parse_query_target
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("AsyncWorker")

async def run_update_worker():
    logger.info("启动队列消费者 Worker...")
    
    try:
        await init_redis() 
        redis = await get_redis()
        
        await init_pg()
        pool = get_db()
        
    except Exception as e:
        logger.critical(f"初始化数据库/Redis 失败: {e}")
        return

    fail_penalties = [60, 120, 3600] 
    fail_count = 0
    
    logger.info("已连接 Redis & PostgreSQL，开始轮询队列...")
    
    while True:
        try:
            tasks = await redis.zpopmin("czlevel:update_queue", count=1)
            
            if not tasks:
                await asyncio.sleep(5)
                continue
                
            target_bytes, score = tasks[0]
            target = target_bytes.decode() if isinstance(target_bytes, bytes) else target_bytes
            
            enqueue_timestamp = int(score) % 10000000000
            if int(time.time()) - enqueue_timestamp > 259200:
                logger.info(f"任务过期，已丢弃: {target}")
                continue
                
            try:
                p1 = await redis.zcount("czlevel:update_queue", 10000000000, 19999999999)
                p2 = await redis.zcount("czlevel:update_queue", 20000000000, 29999999999)
                p3 = await redis.zcount("czlevel:update_queue", 30000000000, 39999999999)
                total = p1 + p2 + p3
                logger.info(f"执行任务: {target} | 当前剩余: {total} 个 (P1: {p1}, P2: {p2}, P3: {p3})")
            except Exception:
                logger.info(f"执行任务: {target}")

            # 1. 解析目标
            target_sec_uid, target_display_id = parse_query_target(target)
            
            # ==========================================
            # 🛡️ 核心优化：联网前的前置双重检查 (数据库 + 缓存)
            # ==========================================
            skip_network = False
            
            # 👇 每次循环获取最新的动态配置 (Redis 管道极速响应)
            settings = await get_dynamic_settings(redis)
            
            # 检查1: 查数据库 + 业务防刷盾综合评估
            try:
                user_record = await fetch_user_record_from_db(pool, target_sec_uid, target_display_id)
                if user_record:
                    # 直接复用单次查询的防刷盾逻辑！
                    shield_result = evaluate_business_shields(
                        user_record, target, target_sec_uid, target_display_id,
                        settings["enable_zero_level_shield"], settings["active_shield_days"]
                    )
                    
                    if shield_result:
                        # 无论是 database (>=12级)、database_zero_blocked (零级盾) 
                        # 还是 database_recent_blocked (活跃盾)，统统拦截跳过
                        logger.info(f"⏭️ [{target}] 触发本地拦截 ({shield_result['source']})，跳过联网更新")
                        skip_network = True
            except Exception as e:
                logger.error(f"Worker 查库异常: {e}")

            # 检查2: 查 Redis 缓存 (针对刚被单次接口查过，但在数据库还未达标的用户)
            if not skip_network and redis:
                try:
                    cached_val = None
                    if target_sec_uid:
                        cached_val = await redis.get(f"czlevel:cache:{target_sec_uid}")
                    if not cached_val and target_display_id:
                        cached_val = await redis.get(f"czlevel:cache:{target_display_id}")
                    
                    if cached_val:
                       # logger.info(f"⏭️ [{target}] 发现近期手动查询缓存，跳过联网更新")
                        skip_network = True
                except Exception as e:
                    logger.error(f"Worker 查缓存异常: {e}")

            if skip_network:
                await asyncio.sleep(0.1)
                continue
            # ==========================================

            # 2. 只有在数据库不达标，且缓存过期的情况下，才真正发起网络拉取
            success, _ = await execute_network_update(
                pool, redis, target_sec_uid, target_display_id
            )
            
            if success:
                fail_count = 0 
                await asyncio.sleep(30)
            else:
                penalty_index = min(fail_count, len(fail_penalties) - 1)
                sleep_time = fail_penalties[penalty_index]
                logger.warning(f"更新失败 [{target}]，触发惩罚休眠 {sleep_time} 秒...")
                fail_count += 1
                await asyncio.sleep(sleep_time)
        
        except Exception as e:
            logger.error(f"Worker 轮询发生异常: {e}")
            await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(run_update_worker())