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
from src.utils.ac_signature import get__ac_signature
import os
import py_mini_racer 
if hasattr(py_mini_racer, 'MiniRacer'):
    MiniRacer = py_mini_racer.MiniRacer
import logging

logger = logging.getLogger("Utils")

_thread_local = threading.local()

def get_js_context(abogus_file_path='js/a_bogus.js'):
    """获取当前线程专属的 V8 引擎上下文"""
    # 如果当前线程还没有引擎，就初始化一个
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
            # 如果文件不存在，给个提示但不让程序崩溃
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
    
    # 注意: MiniRacer 是同步的，如果并发极高可能会轻微阻塞 EventLoop
    # 但签名生成频率低，通常可以接受。
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
    """
    统一的 URL 提取函数，同时兼容 API 的 JSON 字典 和 WebSocket 的 Protobuf 对象
    """
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
    """
    包装原始的 ac_signature 调用
    """
    try:
        return get__ac_signature(host_part, nonce, user_agent)
    except Exception as e:
        logger.error(f"ac_signature 计算错误: {e}")
        return ""

def extract_filename(url: str) -> str:
    """
    提取 URL 中的纯文件名，用于给数据库瘦身。
    遇到第三方头像（如 QQ、微信）时直接保留完整 URL。
    (极速优化版：零 split 内存分配)
    """
    if not url:
        return ""
        
    # 极速防御：如果是第三方域名，直接返回（C底层查表，纳秒级）
    if "douyin" not in url: 
        return url

    try:
        # 1. 寻找有效文件名的结束位置 (遇到 ~ 或 ? 就截断)
        end_idx = len(url)
        
        tilde_idx = url.find('~')
        if tilde_idx != -1 and tilde_idx < end_idx:
            end_idx = tilde_idx
            
        q_idx = url.find('?')
        if q_idx != -1 and q_idx < end_idx:
            end_idx = q_idx

        # 2. 从有效的结束位置往前找，寻找最后一个 '/'
        slash_idx = url.rfind('/', 0, end_idx)

        # 3. 终极一刀切（全过程只有这里产生了一次字符串内存分配）
        if slash_idx != -1:
            return url[slash_idx + 1:end_idx]
            
        return url[:end_idx] # 兜底防错
    except Exception:
        return ""
        
def extract_user_info(user, current_live_id=""):
    info = {
        "user_id": str(user.id),
        "user_name": user.nickName,
        "gender": user.gender,
        "sec_uid": user.secUid,
        "display_id": user.displayId,
        "avatar_url": get_safe_url(user.AvatarThumb),
        "pay_grade": 0,
        "pay_grade_icon": "",
        "fans_club_level": 0,
        "fans_club_icon": "",
        "fans_club_anchor_id": "", 
        "is_mystery": (getattr(user, "mystery_man", 0) == 2), # ✅ 新增：透传神秘人标志
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
            
            # ✅ 新增：提取该粉丝牌所属的主播 ID
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

    # ✅ 核心修复：增加 anchor_id 严格校验，彻底杜绝串牌子导致的脏数据
    if str(current_live_id) == "615189692839":
        # 判断当前佩戴的牌子是否属于陈泽（UID: 63871524957）
        if info.get("fans_club_anchor_id") == "63871524957":
            info["cz_club_level"] = info.get("fans_club_level", 0)
        else:
            info["cz_club_level"] = 0
    else:
        info["cz_club_level"] = 0
        
    return info