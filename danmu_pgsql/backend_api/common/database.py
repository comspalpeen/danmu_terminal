import asyncpg
from redis.asyncio import Redis
from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend_api.common.config import PG_DSN, REDIS_URL

pool: asyncpg.Pool = None
redis_client: Redis = None

async def init_redis():
    global redis_client
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)

async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()

async def get_redis() -> Redis:
    return redis_client

async def init_pg():
    """初始化 PostgreSQL 连接池"""
    global pool
    
    pool = await asyncpg.create_pool(
            dsn=PG_DSN, 
            min_size=5,            
            max_size=15,
            command_timeout=10,    
            timeout=20,            
            max_inactive_connection_lifetime=280, 
    )

async def close_pg():
    global pool
    if pool:
        await pool.close()

def get_db() -> asyncpg.Pool:
    return pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()
    print("✅ [API] Redis 连接成功")
    
    await init_pg()
    print("✅ [API] PostgreSQL 连接池初始化成功")
    
    yield
    await close_redis()
    await close_pg()
    print("👋 [API] 数据库连接已安全关闭")
