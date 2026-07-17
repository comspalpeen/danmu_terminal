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

from backend_api.main_api.routers.single_czlevel_services import (
    execute_network_update,
    fetch_user_record_from_db,
    get_dynamic_settings,         
    evaluate_business_shields,     
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

    fail_penalties = [30, 60, 3600] 
    fail_count = 0
    logger.info("已连接 Redis & PostgreSQL，开始轮询队列...")
    
    while True:
        try:
            tasks = await redis.zpopmin("czlevel:update_queue", count=1)
            if not tasks:
                await asyncio.sleep(5)
                continue
                
            target_bytes, score = tasks[0]
            raw_target = target_bytes.decode() if isinstance(target_bytes, bytes) else target_bytes
            
            # ====================================================================
            # 1. 严格按前缀解析目标（前置解析，确保变量可用）
            # ====================================================================
            target_sec_uid, target_display_id, target_user_id = "", "", ""
            
            if ":" in raw_target:
                q_type, q_val = raw_target.split(":", 1)
                if q_type == "uid":
                    target_user_id = q_val
                elif q_type == "did":
                    target_display_id = q_val
                elif q_type == "sec":
                    target_sec_uid = q_val
                else:
                    logger.warning(f"⚠️ 遇到未知前缀的任务，已丢弃: {raw_target}")
                    continue
            else:
                logger.warning(f"⚠️ 遇到无类型前缀的非法任务，已丢弃: {raw_target}")
                continue

            # 提取真实的值用于后续日志打印和查库
            target = q_val

            # ====================================================================
            # 2. 检查过期与日志打印（此时 target 变量已安全定义）
            # ====================================================================
            enqueue_timestamp = int(score) % 10000000000
            if int(time.time()) - enqueue_timestamp > 259200:
                logger.info(f"任务过期，已丢弃: {target}")
                continue
                
            try:
                p1 = await redis.zcount("czlevel:update_queue", 10000000000, 19999999999)
                p2 = await redis.zcount("czlevel:update_queue", 20000000000, 29999999999)
                p3 = await redis.zcount("czlevel:update_queue", 30000000000, 39999999999)
                total = p1 + p2 + p3
                logger.info(f"执行任务: {target} (类型: {q_type}) | 当前剩余: {total} 个 (P1: {p1}, P2: {p2}, P3: {p3})")
            except Exception:
                logger.info(f"执行任务: {target} (类型: {q_type})")

            # ====================================================================
            # 3. 核心业务与控制闸门
            # ====================================================================
            skip_network = False
            settings = await get_dynamic_settings(redis)
            
            # 🛡️ 针对纯 user_id 且全局开关关闭的特殊降级拦截
            if not target_sec_uid and target_user_id and not settings.get("enable_uid_network_fetch", True):
                logger.info(f"⏭️ 业务繁忙降级 (Worker 拦截)，丢弃仅含 user_id [{target_user_id}] 的异步任务")
                await asyncio.sleep(0.1)
                continue

            # 检查1: 查数据库 + 业务防刷盾综合评估
            try:
                user_record = await fetch_user_record_from_db(pool, target_sec_uid, target_display_id, target_user_id)
                if user_record:
                    shield_result = evaluate_business_shields(
                        user_record, target, target_sec_uid, target_display_id,
                        settings["enable_zero_level_shield"], settings["active_shield_days"]
                    )
                    if shield_result:
                        logger.info(f"⏭️ [{target}] 触发本地拦截 ({shield_result['source']})，跳过联网更新")
                        skip_network = True
            except Exception as e:
                logger.error(f"Worker 查库异常: {e}")

            # 检查2: 查 Redis 缓存
            if not skip_network and redis:
                try:
                    cached_val = None
                    if target_sec_uid:
                        cached_val = await redis.get(f"czlevel:cache:{target_sec_uid}")
                    if not cached_val and target_display_id:
                        cached_val = await redis.get(f"czlevel:cache:{target_display_id}")
                    if not cached_val and target_user_id:
                        cached_val = await redis.get(f"czlevel:cache:{target_user_id}")
                    if cached_val:
                        skip_network = True
                except Exception as e:
                    logger.error(f"Worker 查缓存异常: {e}")

            if skip_network:
                await asyncio.sleep(0.1)
                continue

            # ====================================================================
            # 4. 发起网络拉取
            # ====================================================================
            success, _ = await execute_network_update(
                pool, redis, target_sec_uid, target_display_id, target_user_id
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