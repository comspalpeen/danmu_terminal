import re
import os
import logging
# 👇 修改引入：改用 curl_cffi 的 AsyncSession
from curl_cffi.requests import AsyncSession
from backend_api.common.database import get_redis
import random
logger = logging.getLogger("TtwidService")

async def get_ttwid(force_refresh=False) -> str:
    redis = await get_redis()
    cache_key = "douyin:ttwid"
    
    # 如果不是强制刷新，先查 Redis
    if not force_refresh:
        try:
            cached_ttwid = await redis.get(cache_key)
            if cached_ttwid:
                # 兼容处理 bytes 类型缓存
                return cached_ttwid.decode() if isinstance(cached_ttwid, bytes) else cached_ttwid
        except Exception as e:
            logger.error(f"[Redis Error] get ttwid: {e}")

    # 强制刷新或缓存不存在：去首页取
    logger.info("🔄 [Searcher] 正在获取新的 ttwid...")
    ttwid = ""
    
    try:
        # 👇 初始化 AsyncSession，并指定 impersonate 浏览器指纹类型（自动处理 UA 和 sec-ch-ua-platform）
        # 这里完全不需要再传入旧的、不匹配的固定的自定义 HEADERS
        async with AsyncSession(impersonate="chrome124") as session:
            resp = await session.get("https://live.douyin.com/", timeout=5)
            
            if resp.status_code == 200:
                # 👇 避坑：curl_cffi 的 session.cookies 可以直接通过 .get() O(1) 获取指定的 key
                ttwid = session.cookies.get("ttwid", "")
                
    except Exception as e:
        logger.error(f"[Network Error] fetch ttwid: {e}")

    if ttwid and redis:
        try:
            # 维持原有的 2 小时缓存有效期
            await redis.setex(cache_key, 10800, ttwid)
            logger.info(f"✅ [Searcher] 成功更新 ttwid 并写入 Redis: {ttwid[:10]}...")
        except Exception as e: 
            logger.error(f"[Redis Error] save ttwid failed: {e}")
    
    return ttwid


def build_avatar_url(filename: str) -> str:
    if not filename: return ""
    if filename.startswith("http"): return filename

    # ==========================================
    # 0. 修复历史遗留的“双后缀”脏数据
    # ==========================================
    if filename.endswith(".png.jpeg"):
        filename = filename.replace(".png.jpeg", ".png")

    # 获取去掉后缀的纯 ID 部分 (original_name)
    original_name = os.path.splitext(filename)[0]
    # 全小写版本，用于正则匹配
    name_part = original_name.lower()
    
    # 随机选择 CDN 节点
    cdn_prefix = random.choice(["p3", "p11", "p26"])

    # ==========================================
    # 1. 兼容被抖音代理的第三方头像 (QQ/微信)
    # ==========================================
    if original_name.startswith(("thirdqq.qlogo.cn", "thirdwx.qlogo.cn")):
        return f"https://{cdn_prefix}.douyinpic.com/img/aweme-avatar/{original_name}~c5_300x300.jpeg?from=3067671334"

    # ==========================================
    # 2. 兼容 xavatar (三段式纯数字长 ID)
    # ==========================================
    if bool(re.fullmatch(r'\d+-\d+-\d+', name_part)):
        return f"https://{cdn_prefix}.douyinpic.com/img/aweme-avatar/xavatar/{filename}~c5_1080x1080.jpeg?from=3067671334"

    # ==========================================
    # 3. 兼容 32 位哈希格式的“现代版”头像 (新案例：c4727...)
    # 特征：32位哈希 且 数据库中存了 .jpeg 后缀
    # ==========================================
    is_hash = bool(re.fullmatch(r'[a-f0-9]{32}', name_part))
    if is_hash and filename.lower().endswith(".jpeg"):
        return f"https://{cdn_prefix}.douyinpic.com/img/aweme-avatar/{original_name}~c5_1080x1080.jpeg?from=3067671334"

    # ==========================================
    # 4. 兼容 32 位哈希格式的“直播间”头像 (Webcast 专用)
    # 特征：32位哈希，通常无后缀或为 .png
    # ==========================================
    if is_hash:
        return f"https://p3-webcast.douyinpic.com/img/webcast/{name_part}.png~tplv-obj.image"

    # ==========================================
    # 5. 兜底彻底烂掉的极短脏数据 (如 "40", "132")
    # ==========================================
    if name_part.isdigit() and len(name_part) <= 3:
        return "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/mosaic-legacy_3795_3033762272.jpeg?from=3067671334"

    # ==========================================
    # 6. 处理神秘人、短哈希、常规头像 (aweme 路径)
    # ==========================================
    if "mystery" in name_part:
        return "https://p3-webcast.douyinpic.com/img/webcast/mystery_man_thumb_avatar.png~tplv-obj.image"

    final_filename = filename if "." in filename else f"{filename}.jpeg"

    # 15~25 位短哈希 (无 aweme-avatar 目录)
    if bool(re.fullmatch(r'[a-f0-9]{15,25}', name_part)):
        return f"https://{cdn_prefix}.douyinpic.com/aweme/100x100/{final_filename}?from=3067671334"

    # 常规用户头像 (带 aweme-avatar 目录)
    return f"https://{cdn_prefix}.douyinpic.com/aweme/1080x1080/aweme-avatar/{final_filename}?from=3067671334"


def build_grade_icon(filename: str) -> str:
    """拼接财富等级图标完整 URL"""
    if not filename: return ""
    if filename.startswith("http"): return filename
    return f"https://p6-webcast.douyinpic.com/img/webcast/{filename}~tplv-obj.image"

def build_fans_icon(filename: str) -> str:
    """拼接粉丝团等级图标完整 URL"""
    if not filename: return ""
    if filename.startswith("http"): return filename
    return f"https://p9-webcast.douyinpic.com/img/webcast/{filename}~tplv-obj.image"

def build_gift_icon(filename: str) -> str:
    """拼接礼物图标完整 URL"""
    if not filename: return ""
    if filename.startswith("http"): return filename
    return f"https://p11-webcast.douyinpic.com/img/webcast/{filename}~tplv-obj.png"