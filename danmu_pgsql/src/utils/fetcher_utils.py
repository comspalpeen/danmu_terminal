# fetcher_utils.py
import codecs
import hashlib
import random
import string
import subprocess
import urllib.parse
from unittest.mock import patch
from contextlib import contextmanager
import threading
import os
import py_mini_racer 
if hasattr(py_mini_racer, 'MiniRacer'):
    MiniRacer = py_mini_racer.MiniRacer
import logging
import asyncio
import aiohttp
import re

from src.utils.ac_signature import get__ac_signature
from src.db.redis_client import get_redis

logger = logging.getLogger("Utils")

_thread_local = threading.local()
_GLOBAL_JS_CTX = None

# ==========================================
# 新增: ttwid 全局单例缓存与并发控制锁
# ==========================================
_LOCAL_TTWID_CACHE = None
_TTWID_LOCK = None
REDIS_KEY_TTWID = "douyin:global:ttwid"

def get_ttwid_lock():
    """延迟初始化锁，确保绑定到当前的异步事件循环"""
    global _TTWID_LOCK
    if _TTWID_LOCK is None:
        _TTWID_LOCK = asyncio.Lock()
    return _TTWID_LOCK

async def get_global_ttwid(force_refresh: bool = False) -> str:
    """
    全局获取/复用 ttwid
    优先顺序: 本地内存 -> Redis 缓存 -> 官方注册接口/首页提取
    """
    global _LOCAL_TTWID_CACHE
    
    # 1. 本地内存命中 (最快)
    if not force_refresh and _LOCAL_TTWID_CACHE:
        return _LOCAL_TTWID_CACHE

    redis = get_redis()
    
    # 2. Redis 命中 (支持多开脚本跨进程共享)
    if not force_refresh and redis:
        try:
            cached = await redis.get(REDIS_KEY_TTWID)
            if cached:
                val = cached.decode('utf-8') if isinstance(cached, bytes) else str(cached)
                _LOCAL_TTWID_CACHE = val
                return val
        except Exception as e:
            logger.debug(f"⚠️ Redis 读取 ttwid 失败: {e}")

    # 3. 加锁防并发击穿 (同时间只有 1 个任务去请求抖音，其余等待复用)
    lock = get_ttwid_lock()
    async with lock:
        # 拿到锁后二次检查，防止排队期间已被其他协程获取
        if not force_refresh and _LOCAL_TTWID_CACHE:
            return _LOCAL_TTWID_CACHE

        logger.info("🔄 [TTWID] 缓存失效，正在向抖音申请新的全局游客 ttwid...")
        new_ttwid = await _fetch_new_ttwid()
        
        if new_ttwid:
            _LOCAL_TTWID_CACHE = new_ttwid
            if redis:
                try:
                    # 缓存 14 天 (1209600 秒)
                    await redis.setex(REDIS_KEY_TTWID, 1209600, new_ttwid)
                except Exception as e:
                    logger.warning(f"⚠️ 写入 Redis ttwid 失败: {e}")
            return new_ttwid

        return _LOCAL_TTWID_CACHE or ""

async def _fetch_new_ttwid() -> str:
    """内部方法：直接请求 live.douyin.com 首页提取 ttwid"""
    url = "https://live.douyin.com/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    }
    
    try:
        timeout = aiohttp.ClientTimeout(total=6)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers) as resp:
                # 方式 1: 从原生的 cookie_jar 中安全提取
                for cookie in session.cookie_jar:
                    if cookie.key == 'ttwid':
                        logger.info(f"🔑 成功获取新 ttwid: {cookie.value[:15]}...")
                        return cookie.value
                
                # 方式 2: 兜底正则解析 Header
                set_cookie = resp.headers.get('Set-Cookie', '')
                match = re.search(r'ttwid=([^;]+)', set_cookie)
                if match:
                    val = match.group(1)
                    logger.info(f"🔑 [Header] 成功获取新 ttwid: {val[:15]}...")
                    return val
    except Exception as e:
        logger.error(f"❌ 请求抖音生成 ttwid 失败: {e}")

    return ""
# ==========================================

def get_js_context(abogus_file_path='js/a_bogus.js'):
    """获取当前线程专属的 V8 引擎上下文"""
    if not hasattr(_thread_local, 'ctx'):
        ctx = py_mini_racer.MiniRacer()
        if os.path.exists(abogus_file_path):
            with open(abogus_file_path, 'r', encoding='utf-8') as f:
                ctx.eval(f.read())
        _thread_local.ctx = ctx
    
    return _thread_local.ctx

def get_global_js_context(abogus_file_path='js/a_bogus.js'):
    """获取全局单例的 JS 环境，避免每次重复拉起 V8 引擎"""
    global _GLOBAL_JS_CTX
    if _GLOBAL_JS_CTX is None:
        _GLOBAL_JS_CTX = py_mini_racer.MiniRacer()
        if os.path.exists(abogus_file_path):
            with open(abogus_file_path, 'r', encoding='utf-8') as f:
                _GLOBAL_JS_CTX.eval(f.read())
        else:
            pass
    return _GLOBAL_JS_CTX

@contextmanager
def patched_popen_encoding(encoding='utf-8'):
    original_popen_init = subprocess.Popen.__init__
    def new_popen_init(self, *args, **kwargs):
        kwargs['encoding'] = encoding
        original_popen_init(self, *args, **kwargs)
    with patch.object(subprocess.Popen, '__init__', new_popen_init):
        yield

def generateSignature(wss, script_file='js/sign.js'):
    params = ("live_id,aid,version_code,webcast_sdk_version,"
              "room_id,sub_room_id,sub_channel_id,did_rule,"
              "user_unique_id,device_platform,device_type,ac,"
              "identity").split(',')
    wss_params = urllib.parse.urlparse(wss).query.split('&')
    wss_maps = {i.split('=')[0]: i.split("=")[-1] for i in wss_params}
    tpl_params = [f"{i}={wss_maps.get(i, '')}" for i in params]
    param = ','.join(tpl_params)
    
    md5 = hashlib.md5()
    md5.update(param.encode())
    md5_param = md5.hexdigest()
    
    with codecs.open(script_file, 'r', encoding='utf8') as f:
        script = f.read()
    
    ctx = MiniRacer()
    ctx.eval(script)
    try:
        signature = ctx.call("get_sign", md5_param)
        return signature
    except Exception as e:
        logger.error(f"签名生成失败: {e}")
        return ""

def generateMsToken(length=182):
    random_str = ''
    base_str = string.ascii_letters + string.digits + '-_'
    _len = len(base_str) - 1
    for _ in range(length):
        random_str += base_str[random.randint(0, _len)]
    return random_str

def get_safe_url(icon_obj):
    if not icon_obj:
        return ""
    try:
        if isinstance(icon_obj, dict):
            url_list = icon_obj.get('urlListList') or icon_obj.get('url_list_list') or icon_obj.get('url_list')
            if url_list and len(url_list) > 0:
                return url_list[0]
        else:
            if hasattr(icon_obj, "urlListList") and len(icon_obj.urlListList) > 0:
                return icon_obj.urlListList[0]
            elif hasattr(icon_obj, "url_list_list") and len(icon_obj.url_list_list) > 0:
                return icon_obj.url_list_list[0]
            elif hasattr(icon_obj, "url_list") and len(icon_obj.url_list) > 0:
                return icon_obj.url_list[0]
    except Exception:
        pass
    return ""

def get_ac_signature(host_part, nonce, user_agent):
    try:
        return get__ac_signature(host_part, nonce, user_agent)
    except Exception as e:
        logger.error(f"ac_signature 计算错误: {e}")
        return ""

def extract_filename(url: str) -> str:
    if not url:
        return ""
    if "douyin" not in url: 
        return url
    try:
        end_idx = len(url)
        tilde_idx = url.find('~')
        if tilde_idx != -1 and tilde_idx < end_idx:
            end_idx = tilde_idx
            
        q_idx = url.find('?')
        if q_idx != -1 and q_idx < end_idx:
            end_idx = q_idx

        slash_idx = url.rfind('/', 0, end_idx)
        if slash_idx != -1:
            return url[slash_idx + 1:end_idx]
            
        return url[:end_idx]
    except Exception:
        return ""
        
def extract_user_info(user, current_live_id=""):
    info = {
        "user_id": str(user.id),
        "user_name": user.nickName,
        "gender": user.gender,
        "sec_uid": user.secUid,
        "display_id": user.displayId,
        "webcast_uid": getattr(user, "webcastUid", ""),
        "avatar_url": get_safe_url(user.AvatarThumb),
        "pay_grade": 0,
        "pay_grade_icon": "",
        "fans_club_level": 0,
        "fans_club_icon": "",
        "fans_club_anchor_id": "", 
        "is_mystery": (getattr(user, "mystery_man", 0) == 2),
    }

    try:
        if user.HasField("PayGrade"):
            info["pay_grade"] = user.PayGrade.level
            info["pay_grade_icon"] = get_safe_url(user.PayGrade.newImIconWithLevel)
    except Exception:
        pass

    try:
        if user.HasField("FansClub") and user.FansClub.HasField("data"):
            if 4 in user.FansClub.data.badge.icons:
                info["fans_club_icon"] = get_safe_url(user.FansClub.data.badge.icons[4])
            info["fans_club_level"] = user.FansClub.data.level
            if hasattr(user.FansClub.data, "anchorId"):
                info["fans_club_anchor_id"] = str(user.FansClub.data.anchorId)
    except Exception:
        pass

    try:
        for badge in user.NewBadgeImageList:
            if badge.imageType == 1:
                info["pay_grade"] = badge.content.level
                info["pay_grade_icon"] = get_safe_url(badge)
            elif badge.imageType in (7, 51):
                if badge.content.level > 0:
                    info["fans_club_level"] = badge.content.level
                if not info["fans_club_icon"] or badge.imageType == 51:
                    info["fans_club_icon"] = get_safe_url(badge)
    except Exception:
        pass

    if str(current_live_id) == "615189692839":
        if info.get("fans_club_anchor_id") == "63871524957":
            info["cz_club_level"] = info.get("fans_club_level", 0)
        else:
            info["cz_club_level"] = 0
    else:
        info["cz_club_level"] = 0
        
    return info