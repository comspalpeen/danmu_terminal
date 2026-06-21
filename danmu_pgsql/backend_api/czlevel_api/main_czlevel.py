import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend_api.common.database import lifespan
from routers import czlevel
# 📦 创建独立的 FastAPI 微服务实例
app = FastAPI(
    title="CzLevel Microservice",
    description="陈泽粉丝团等级",
    version="1.0.0",
    lifespan=lifespan  
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
    uvicorn.run(
        "main_czlevel:app", 
        host="127.0.0.1", 
        port=7458, 
        reload=False,
        proxy_headers=True,         # 信任 Nginx 的代理头
        forwarded_allow_ips="*"     # 获取真实用户 IP 用于限流器
    )