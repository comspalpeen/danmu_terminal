import asyncio
import json
import random
import sys
import os
import logging
from dotenv import load_dotenv  # 👈 引入 python-dotenv

# 设置日志格式
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("CachePreheat")

# 将项目根目录加入环境变量
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

# 👈 显式指定读取项目根目录下的 .env 文件
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=env_path)

# 导入 database 模块（此时 .env 环境变量已经被装载入 os.environ 中）
from backend_api.common.database import (
    init_pg, close_pg, get_db,
    init_redis, close_redis, get_redis
)
INVALID_UIDS = {"111111", "0", "none", "null", ""}
async def run_update():
    logger.info("🚀 开始执行 23:00 高等级用户缓存预热与刷新...")
    
    # 初始化连接池（此时 PG_DSN 已经成功读取到 2077 端口）
    await init_pg()
    await init_redis()
    
    pool = get_db()
    redis = await get_redis()
    
    try:
        query = """
            SELECT u.user_id, u.sec_uid, u.display_id, u.user_name, u.avatar_url, f.cz_club_level AS raw_cz_level
            FROM cz_fans f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.cz_club_level >= 12
        """
        
        async with pool.acquire() as conn:
            records = await conn.fetch(query)
            
        total_count = len(records)
        logger.info(f"📊 成功查出 >=12 级用户共 {total_count} 条，准备分批写入 Redis...")
        
        if not records:
            logger.info("⚠️ 无符合条件的数据，任务结束。")
            return

        batch_size = 1000
        written_count = 0
        
        for i in range(0, total_count, batch_size):
            batch = records[i:i + batch_size]
            pipe = redis.pipeline()
            
            for r in batch:
                rec = dict(r)
                uid = str(rec.get('user_id', '')).strip()
                did = rec.get('display_id')
                
                if not uid or uid in INVALID_UIDS:
                    continue
                    
                val = json.dumps(rec)
                ttl = 86400 + random.randint(0, 7200)
                
                if did:
                    pipe.set(f"czlevel:did:{did.lower()}", val, ex=ttl)
                if uid:
                    pipe.set(f"czlevel:uid:{uid}", val, ex=ttl)
                                
            await pipe.execute()
            written_count += len(batch)
            await asyncio.sleep(0.05)
            
        logger.info(f"✅ 成功刷新 {written_count} 条用户缓存！全套任务执行完毕，即将退出。")

    finally:
        await close_pg()
        await close_redis()
        logger.info("👋 数据库和 Redis 连接已安全释放。")

if __name__ == "__main__":
    try:
        asyncio.run(run_update())
    except Exception as e:
        logger.error(f"❌ 缓存预热脚本执行异常: {e}")
        sys.exit(1)