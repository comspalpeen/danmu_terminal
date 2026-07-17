import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routers import check, favorites, reports, tieba, rooms, authors, search, admin, tools, tools_high_level, single_czlevel
from backend_api.common.database import lifespan as db_lifespan
from src.db.redis_client import init_redis, close_redis
@asynccontextmanager
async def global_lifespan(app: FastAPI):
    print("🚀 正在初始化全局 Redis...")
    await init_redis() 
    async with db_lifespan(app):
        yield 
    print("👋 正在关闭全局 Redis...")
    await close_redis()
app = FastAPI(lifespan=global_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(check.router)
app.include_router(favorites.router)
app.include_router(reports.router)
app.include_router(tieba.router)
app.include_router(rooms.router)
app.include_router(authors.router)
app.include_router(search.router)
app.include_router(admin.router)
app.include_router(tools.router)
app.include_router(tools_high_level.router)
app.include_router(single_czlevel.router)
if __name__ == "__main__":
    uvicorn.run(
        "main_api:app", 
        host="127.0.0.1", 
        port=38324, 
        reload=False,
        proxy_headers=True,         # 关键点 1：开启代理头解析
        forwarded_allow_ips="*"     # 关键点 2：信任来自 Nginx 的 IP 透传
    )