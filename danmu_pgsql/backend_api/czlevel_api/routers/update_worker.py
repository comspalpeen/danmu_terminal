import os
import sys

# 1. 确保能正确找到跨微服务目录的模块
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, "../../../"))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import asyncio
import time
import logging

# 2. 数据库/Redis 连接依赖
from backend_api.common.database import (
    init_redis, 
    get_redis, 
    init_pg, 
    get_db
)

# ==========================================
# 🎯 核心修改点：修正拆分后的跨服务导入路径
# ==========================================
# 解析函数：从极简的 czlevel_api 侧引入
from backend_api.czlevel_api.routers.services import parse_query_target
# 联网核心：从 main_api 的共享业务层引入
from backend_api.main_api.routers.czlevel_services import execute_network_update
# 配置一下脚本的日志输出
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("AsyncWorker")

async def run_update_worker():
    logger.info("🚀 正在初始化异步轮询服务...")
    
    try:
        # 🚀 3. 核心修复：依次完成 Redis 和 PG 连接池的异步初始化
        await init_redis() 
        # 🔑 因为 database.py 里是 async def get_redis()，这里必须加 await！
        redis = await get_redis() 
        
        await init_pg()
        # 🔑 你的 get_db() 是同步函数，这里直接获取即可
        pool = get_db() 
        
    except Exception as e:
        logger.critical(f"❌ 独立进程数据库/Redis 初始化失败: {e}")
        return

    fail_penalties = [60, 120, 3600] 
    fail_count = 0
    
    logger.info("✅ Redis & PostgreSQL 连接池就绪，开始监听优先级队列...")
    
    while True:
        try:
            # 🚀 查完就扔：ZPOPMIN 满足要求
            tasks = await redis.zpopmin("czlevel:update_queue", count=1)
            
            if not tasks:
                await asyncio.sleep(5)  # 队列空时稍微等一下
                continue
                
            target_bytes, score = tasks[0]
            target = target_bytes.decode() if isinstance(target_bytes, bytes) else target_bytes
            
            # 🕒 3天过期判定 (259200秒)
            enqueue_timestamp = int(score) % 10000000000
            if int(time.time()) - enqueue_timestamp > 259200:
                logger.info(f"🗑️ 数据在队列中呆了超过 3 天，抛弃: {target}")
                continue
                
            logger.info(f"🔄 开始执行后台同步: {target}")
            
            # 解析标识
            target_sec_uid, target_display_id = parse_query_target(target)
            
            # 🚀 调用同级 services.py 封装好的全套逻辑
            success, _ = await execute_network_update(
                pool, redis, target_sec_uid, target_display_id
            )
            
            if success:
                fail_count = 0 
                await asyncio.sleep(30) # 顺利通过后维持低频防封间隔
            else:
                # 💥 失败惩罚阶梯 (60s -> 120s -> 3600s)
                penalty_index = min(fail_count, len(fail_penalties) - 1)
                sleep_time = fail_penalties[penalty_index]
                logger.warning(f"⚠️ 联网查询失败 [{target}]，触发阶梯防刷，休眠 {sleep_time} 秒...")
                fail_count += 1
                await asyncio.sleep(sleep_time)
            
        except Exception as e:
            logger.error(f"❌ 轮询处理异常: {e}")
            await asyncio.sleep(60) # 异常防护，避免由于外部崩溃导致死循环把日志刷爆

if __name__ == "__main__":
    asyncio.run(run_update_worker())