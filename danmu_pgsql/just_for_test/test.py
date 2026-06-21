import asyncio
import os
import re
import random
import logging
import aiohttp
import orjson as json

# 1. 导入你项目中的核心组件
from src.db.db import AsyncPostgresHandler
from src.db.redis_client import init_redis, close_redis

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - [%(levelname)s] - %(message)s')
logger = logging.getLogger("FinalTest")

# --- 目标主播与配置 ---
TARGET_NAMES = ["卡特Carry", "老郭-"]
REDIS_URL = "redis://localhost:6379/0" # 保持与 main.py 一致

def get_ms_token(length=107):  
    chars = 'ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789='  
    return ''.join(random.choices(chars, k=length))

def extract_sec_user_id(cookie: str):
    """【完全复刻】monitor.py 的正则逻辑"""
    try:
        match = re.search(r'MS4wLjABAAAA[^%;]*', cookie)
        if match: return match.group(0)
    except Exception: pass
    return None

def _generate_params(sec_user_id: str, offset: int = 0):
    """【完全复刻】monitor.py 的参数逻辑：is_top 恒为 '1'，max_time 恒为 '0'"""
    return {
        'device_platform': 'webapp', 'aid': '6383', 'channel': 'channel_pc_web',
        'sec_user_id': sec_user_id or '', 'offset': str(offset), 'count': '20',
        'min_time': '0', 'max_time': '0', 'source_type': '4',
        'gps_access': '0', 'address_book_access': '0', 'is_top': '1',
        'pc_client_type': '1', 'pc_libra_divert': 'Windows', 'support_h265': '1',
        'support_dash': '1', 'webcast_sdk_version': '170400', 'webcast_version_code': '170400',
        'version_code': '170400', 'version_name': '17.4.0', 'cookie_enabled': 'true',
        'screen_width': '1920', 'screen_height': '1080', 'browser_language': 'zh-CN',
        'browser_platform': 'Win32', 'browser_name': 'Chrome', 'browser_version': '144.0.0.0',
        'browser_online': 'true', 'engine_name': 'Blink', 'engine_version': '144.0.0.0',
        'os_name': 'Windows', 'os_version': '10', 'cpu_core_num': '16',
        'device_memory': '8', 'platform': 'PC', 'downlink': '10',
        'effective_type': '4g', 'round_trip_time': '0', 'msToken': get_ms_token(), 'a_bogus': '1',
    }

async def run_test():
    # 2. 必须步骤：初始化 Redis 和 DB 连接池
    logger.info("🚀 正在初始化系统组件...")
    await init_redis(REDIS_URL)
    db = AsyncPostgresHandler()
    await db.init_pool()

    try:
        # 3. 加载有效 Cookie
        cookies = await db.get_all_cookies()
        if not cookies:
            logger.error("❌ 数据库 settings_cookies 表中没有可用 Cookie！")
            return
        
        current_cookie = cookies[0]
        sec_user_id = extract_sec_user_id(current_cookie)
        
        headers = {
            'authority': 'www.douyin.com',
            'accept': 'application/json, text/plain, */*',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            'cookie': current_cookie,
            'referer': 'https://www.douyin.com/'
        }

        async with aiohttp.ClientSession() as session:
            offset = 0
            page = 1
            last_page_first_id = None # 用于检测死循环

            # 4. 【完全复刻】get_all_live_users 的 while 循环翻页逻辑
            while True:
                params = _generate_params(sec_user_id, offset)
                logger.info(f"📄 正在请求第 {page} 页 (offset={offset})...")
                
                url = "https://www.douyin.com/aweme/v1/web/user/following/list/"
                async with session.get(url, params=params, headers=headers) as resp:
                    data = await resp.json()
                    followings = data.get('followings', [])
                    
                    if not followings:
                        logger.info("⏹️ 接口未返回 followings，结束扫描。")
                        break

                    # 🌟 死循环检测：如果 offset 变了但返回的第一位用户没变，说明 offset 已失效
                    current_first_id = followings[0].get('uid')
                    if last_page_first_id and current_first_id == last_page_first_id:
                        logger.warning("⚠️ 检测到数据内容未发生变化（死循环），API 可能忽略了 offset 参数！")
                    last_page_first_id = current_first_id

                    # 审计目标主播
                    for user in followings:
                        nickname = user.get('nickname', '')
                        if any(t in nickname for t in TARGET_NAMES):
                            # 模拟 extract_live_info 的核心逻辑
                            live_status = user.get('live_status', 0)
                            room_data = user.get('room_data')
                            logger.info(f"🎯 [找到目标] {nickname} | live_status: {live_status}")
                            
                            if live_status == 1:
                                if room_data:
                                    logger.info(f"   ✅ 状态正常，且包含 room_data，应可录制。")
                                else:
                                    logger.error(f"   ❌ 错误：虽然在线，但 room_data 为空！无法获取 web_rid。")
                            else:
                                logger.warning(f"   ⚠️ 状态为 {live_status}，根据代码逻辑 (if raw_status == 1) 将被忽略。")

                    # 🌟 【完全复刻】源代码翻页判断
                    has_more = data.get('has_more', False)
                    if not has_more:
                        logger.info("🏁 接口返回 has_more=False，扫描完成。")
                        break
                    
                    offset += 20
                    page += 1
                    await asyncio.sleep(2.0) # 保持与原代码一致的频率

    except Exception as e:
        logger.error(f"💥 运行异常: {e}")
    finally:
        # 5. 安全关闭，避免 Redis 报错
        logger.info("🧹 正在执行清理收尾...")
        await db.close()
        await close_redis()

if __name__ == "__main__":
    asyncio.run(run_test())