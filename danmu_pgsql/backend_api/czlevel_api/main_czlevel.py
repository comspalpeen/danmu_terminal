import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import asyncio
import logging
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 补充缺失的导入
from backend_api.common.database import get_redis, lifespan as db_lifespan
from backend_api.czlevel_api.routers.services import (
    redis_batch_pusher_worker,
    metrics_heartbeat_worker,      # 👈 新导入
    metrics_global_flush_worker    # 👈 新导入
)
from routers import czlevel

logger = logging.getLogger("CzLevelAPI")

@asynccontextmanager
async def lifespan_with_worker(app: FastAPI):
    async with db_lifespan(app):
        # 启动原有的批量入队 Worker
        pusher_task = asyncio.create_task(
            redis_batch_pusher_worker(get_redis, delay_seconds=3.0, max_batch_size=1000)
        )
        # 启动 5秒心跳同步 Worker
        heartbeat_task = asyncio.create_task(metrics_heartbeat_worker(get_redis))
        
        # 启动 60秒全局聚合 Worker
        global_flush_task = asyncio.create_task(metrics_global_flush_worker(get_redis))
        
        logger.info("🚀 所有后台 Worker 已全部启动")
        
        try:
            yield
        finally:
            pusher_task.cancel()
            heartbeat_task.cancel()
            global_flush_task.cancel()
            # 优雅等待所有任务退出
            await asyncio.gather(pusher_task, heartbeat_task, global_flush_task, return_exceptions=True)
# 📦 创建独立的 FastAPI 微服务实例
app = FastAPI(
    title="CzLevel Microservice",
    description="陈泽粉丝团等级",
    version="1.0.0",
    lifespan=lifespan_with_worker
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(czlevel.router)

if __name__ == "__main__":
    # 💡 针对 2C2G 服务器：开启 2 个 Worker 充分利用多核 CPU
    uvicorn.run(
        "main_czlevel:app", 
        host="127.0.0.0",            # 建议监听所有网卡，方便容器或代理接入
        port=7458, 
        workers=2, 
        loop="uvloop", 
        http="httptools",          # 👈 建议安装 httptools，解析速度更快
        reload=False,
        proxy_headers=True,        
        forwarded_allow_ips="*"    
    )
