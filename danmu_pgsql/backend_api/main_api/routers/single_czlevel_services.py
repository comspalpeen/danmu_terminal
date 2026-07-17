import aiohttp
import logging
import orjson as json
from datetime import datetime
import re
from backend_api.common.utils import build_avatar_url, get_ttwid
from backend_api.czlevel_api.routers.services import _to_int
from curl_cffi.requests import AsyncSession
logger = logging.getLogger("MainAPI_CzLevelSharedService")

UPSERT_USERS_SQL = """
    INSERT INTO users (user_id, sec_uid, display_id, user_name, gender, pay_grade, avatar_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id) DO UPDATE SET
        sec_uid      = CASE WHEN EXCLUDED.sec_uid != '' THEN EXCLUDED.sec_uid ELSE users.sec_uid END,
        display_id   = CASE WHEN EXCLUDED.display_id != '' THEN EXCLUDED.display_id ELSE users.display_id END,
        user_name    = EXCLUDED.user_name,
        gender       = EXCLUDED.gender,
        pay_grade    = GREATEST(users.pay_grade, EXCLUDED.pay_grade),
        avatar_url   = EXCLUDED.avatar_url,
        updated_at   = CURRENT_TIMESTAMP;
"""

UPSERT_CZFANS_SQL = """
    INSERT INTO cz_fans (user_id, cz_club_level, last_active_time)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE SET
        cz_club_level    = GREATEST(cz_fans.cz_club_level, EXCLUDED.cz_club_level),
        last_active_time = CURRENT_TIMESTAMP;
"""

def parse_query_target(query_str: str):
    sec_uid_match = re.search(r'(?:user/|sec_uid=)?(MS4wLjABAAAA[A-Za-z0-9_\-]+)', query_str)
    target_sec_uid = sec_uid_match.group(1) if sec_uid_match else None
    target_display_id = None if target_sec_uid else query_str
    return target_sec_uid, target_display_id

def _to_bool(value, default: bool) -> bool:
    if value in (None, ""): return default
    if isinstance(value, bool): return value
    normalized = str(value).strip().lower()
    return normalized in {"1", "true", "yes", "on"}

# 1. 动态配置 (🛡️ 已修复：完整读取并解析熔断开关)
async def get_dynamic_settings(redis) -> dict:
    settings = {
        "single_api_switch": 1, 
        "enable_zero_level_shield": True, 
        "active_shield_days": 3,
        "enable_uid_network_fetch": True  # 默认允许
    }
    if not redis: return settings
    try:
        pipe = redis.pipeline()
        pipe.get("setting:single_api_switch")
        pipe.get("setting:enable_zero_level_shield")
        pipe.get("setting:active_shield_days")
        pipe.get("setting:czlevel_api_switch")
        pipe.get("setting:enable_uid_network_fetch") # 👈 修复：从 Redis 读取
        results = await pipe.execute()
        
        legacy_api_switch = _to_int(results[3], settings["single_api_switch"])
        settings["single_api_switch"] = _to_int(results[0], legacy_api_switch)
        settings["enable_zero_level_shield"] = _to_bool(results[1], settings["enable_zero_level_shield"])
        settings["active_shield_days"] = _to_int(results[2], settings["active_shield_days"])
        settings["enable_uid_network_fetch"] = _to_bool(results[4], settings["enable_uid_network_fetch"]) # 👈 修复：正确赋值
    except Exception as e:
        logger.error(f"❌ 读取动态配置异常: {e}")
    return settings

# 2. 单用户查库 (🛡️ 已修复：支持传真实 user_id 查库)
async def fetch_user_record_from_db(pool, target_sec_uid=None, target_display_id=None, target_user_id=None):
    async with pool.acquire() as conn:
        sql = """
            SELECT u.user_id, u.sec_uid, u.display_id, u.user_name, u.avatar_url,
                   f.cz_club_level AS raw_cz_level, f.last_active_time
            FROM users u LEFT JOIN cz_fans f ON u.user_id = f.user_id
        """
        if target_sec_uid: return await conn.fetchrow(f"{sql} WHERE u.sec_uid = $1 LIMIT 1", target_sec_uid)
        if target_display_id: return await conn.fetchrow(f"{sql} WHERE u.display_id = $1 LIMIT 1", target_display_id)
        if target_user_id: return await conn.fetchrow(f"{sql} WHERE u.user_id = $1 LIMIT 1", str(target_user_id))
    return None

# 3. 业务防刷盾
def evaluate_business_shields(user_record, query_str: str, target_sec_uid: str, target_display_id: str, enable_zero_shield: bool, active_shield_days: int):
    if not user_record or user_record.get('raw_cz_level') is None: return None
    raw_level = user_record['raw_cz_level']
    base_resp = {
        "sec_uid":    user_record['sec_uid'] or "",
        "display_id": user_record['display_id'] or target_display_id or query_str,
        "nickname":   user_record['user_name'] or "未知用户",
        "avatar":     build_avatar_url(user_record['avatar_url']),
        "level":      raw_level,
        "passed":     raw_level >= 12,
    }
    if raw_level >= 12: return {**base_resp, "source": "database"}
    if enable_zero_shield and raw_level == 0: return {**base_resp, "source": "database_zero_blocked"}
    last_active = user_record.get('last_active_time')
    if (active_shield_days > 0 and 0 < raw_level <= 10 and last_active and 
        (datetime.now() - last_active).days < active_shield_days):
        return {**base_resp, "source": "database_recent_blocked"}
    return None

async def update_display_id_in_db(pool, display_id: str, sec_uid: str):
    if not display_id: return
    try:
        async with pool.acquire() as conn:
            await conn.execute("UPDATE users SET display_id = $1, updated_at = CURRENT_TIMESTAMP WHERE sec_uid = $2 AND display_id != $1", display_id, sec_uid)
    except Exception as e:
        logger.error(f"❌ 更新 display_id 失败 [{sec_uid}]: {e}")

async def upsert_user_data(pool, latest_data: dict, target_display_id: str):
    if not latest_data.get('display_id') and target_display_id: 
        latest_data['display_id'] = target_display_id
    user_id = latest_data.get('user_id')
    cz_level = latest_data.get('cz_club_level', 0)
    if not user_id: return
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                user_exists = await conn.fetchval("SELECT 1 FROM cz_fans WHERE user_id = $1", user_id)
                if user_exists or cz_level >= 1:
                    await conn.execute(
                        UPSERT_USERS_SQL, 
                        user_id, latest_data.get('sec_uid', ''), latest_data.get('display_id', ''),
                        latest_data.get('user_name', '未知用户'), latest_data.get('gender', 0), 
                        latest_data.get('pay_grade', 0), latest_data.get('avatar_url', '')
                    )
                    await conn.execute(UPSERT_CZFANS_SQL, user_id, cz_level)
    except Exception as e:
        logger.error(f"❌ UPSERT 用户数据失败: {e}")

async def fetch_sec_uid(session: AsyncSession, display_id: str, redis=None) -> str:
    display_id = str(display_id).strip()
    cache_key = f"map:did2sec:{display_id}"
    
    if redis:
        try:
            cached_val = await redis.get(cache_key)
            if cached_val: 
                return cached_val.decode() if isinstance(cached_val, bytes) else cached_val
        except Exception as e:
            logger.error(f"读取 sec_uid 缓存异常: {e}")
        
    url = f"https://www.iesdouyin.com/web/api/v2/user/info/?unique_id={display_id}"
    
    try:
        resp = await session.get(url, timeout=5)
        
        if resp.status_code != 200:
            logger.warning(f"获取 sec_uid 接口响应异常 [{display_id}]: 状态码 {resp.status_code}")
            return ""

        data = resp.json()
        if data.get("status_code", 0) != 0:
            logger.info(f"获取 sec_uid 失败 [{display_id}]: {data.get('status_msg')}")
            return "USER_NOT_FOUND" 
            
        sec_uid = data.get("user_info", {}).get("sec_uid", "")
        
        if sec_uid and redis:
            try: 
                await redis.setex(cache_key, 604800, sec_uid)
            except Exception as e:
                logger.error(f"写入 sec_uid 缓存失败: {e}")
                
        return sec_uid
        
    except Exception as e:
        logger.error(f"网络请求获取 sec_uid 异常 [{display_id}]: {e}")
        
    return ""

async def fetch_live_profile(session: AsyncSession, sec_uid: str, user_id: str, ttwid: str) -> dict:
    # 🛡️ 核心修复点 B：以 sec_uid 为绝对最高优先级，确保互斥
    if sec_uid and str(sec_uid).strip():
        uid_param = f"&sec_target_uid={sec_uid.strip()}"
    elif user_id and str(user_id).strip():
        uid_param = f"&target_uid={user_id.strip()}"
    else:
        logger.warning("fetch_live_profile 未接收到有效的 sec_uid 或 user_id，放弃请求")
        return {}

    url = (f"https://live.douyin.com/webcast/user/profile/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN"
           f"{uid_param}&anchor_id=63871524957&sec_anchor_id=MS4wLjABAAAA58AFQVygQ3MfiCpOXp-RTUqdyHY-oVSJQHsyWhg4S78&current_room_id=7613431014626822954")
    
    try:
        # 移除随机 UA，让 curl_cffi 自动接管指纹
        resp = await session.get(url, headers={"Cookie": f"ttwid={ttwid};"}, timeout=5)
        
        if resp.status_code == 200:
            # 同步解析 json 
            profile = resp.json().get("data", {}).get("user_profile", {})
            if profile:
                b_info = profile.get("base_info", {})
                raw_uri = b_info.get("avatar_thumb", {}).get("uri", "") if isinstance(b_info.get("avatar_thumb", {}), dict) else ""
                avatar_uri = raw_uri.split("/")[-1] if "/" in raw_uri else raw_uri
                return {
                    "user_id": str(b_info.get("id", "")), 
                    "sec_uid": b_info.get("sec_uid", ""), 
                    "display_id": b_info.get("display_id", ""),
                    "user_name": b_info.get("nickname", "未知用户"), 
                    "gender": b_info.get("gender", 0), 
                    "avatar_url": avatar_uri,
                    "cz_club_level": profile.get("fans_club", {}).get("data", {}).get("level", 0),
                }
    except Exception as e:
        logger.error(f"❌ 获取 Profile 失败 [参数: {uid_param}]: {e}")
    return {}

async def cache_czlevel_result(redis, final_res: dict, latest_data: dict, target_sec_uid: str, target_display_id: str):
    if not redis or final_res["level"] >= 12: return
    cache_data = {**final_res, "source": "redis_cache"}
    expire = 604800 if final_res["level"] < 11 else 129600
    try:
        pipe = redis.pipeline()
        cache_payload = json.dumps(cache_data)
        valid_sec_uid = latest_data.get('sec_uid') or target_sec_uid
        if valid_sec_uid: pipe.setex(f"czlevel:cache:{valid_sec_uid}", expire, cache_payload)
        valid_display_id = latest_data.get('display_id') or target_display_id
        if valid_display_id: pipe.setex(f"czlevel:cache:{valid_display_id}", expire, cache_payload)
        await pipe.execute()
    except Exception as e:
        logger.error(f"❌ 写入 Redis 缓存失败: {e}")

# 🛡️ 已修复：终极网络查等级函数
async def execute_network_update(pool, redis, target_sec_uid: str, target_display_id: str, target_user_id: str = "") -> tuple[bool, dict]:
    # 使用 curl_cffi 的 AsyncSession
    async with AsyncSession(impersonate="chrome124") as session:
        settings = await get_dynamic_settings(redis)
        
        # ====================================================================
        # 🛡️ 核心修复点 A：纯数字 display_id 的安全转换与隔离
        # ====================================================================
        if not target_sec_uid and target_display_id:
            # 此时传入的可能是纯数字 display_id，优先通过低风险接口获取真实的 sec_uid
            converted_sec_uid = await fetch_sec_uid(session, target_display_id, redis)
            
            if converted_sec_uid == "USER_NOT_FOUND":
                final_res = {
                    "user_id": "", "sec_uid": "", "display_id": target_display_id,
                    "nickname": "查无此人", "avatar": "", "level": 0,
                    "source": "api_not_found", "passed": False,
                }
                await cache_czlevel_result(redis, final_res, {}, "", target_display_id)
                return True, final_res
                
            if converted_sec_uid:
                target_sec_uid = converted_sec_uid
                # 🎯【关键修复】：既然是通过 display_id 成功转换出来的常规查询，
                # 必须将内部的 target_user_id 强行清空，断绝其作为 user_id 被误传的可能！
                target_user_id = "" 
                
                # 同步更新数据库内可能存在的改名绑定关系
                await update_display_id_in_db(pool, target_display_id, target_sec_uid)

        # 降级熔断拦截：如果最终只有 user_id 且全局开关关闭，则直接熔断
        if not target_sec_uid and target_user_id and not settings["enable_uid_network_fetch"]:
            logger.info(f"⏭️ 业务繁忙触发降级，跳过仅含 user_id [{target_user_id}] 的网络复查")
            return True, {
                "user_id": target_user_id, "sec_uid": "", "display_id": target_display_id or "",
                "nickname": "暂不更新", "avatar": "", "level": 0,
                "source": "uid_fetch_disabled", "passed": False,
            }
            
        if not target_sec_uid and not target_user_id:
            return False, {}

        # ====================================================================
        # 闸门回查：满级拦截与本地盾牌（保持不变）
        # ====================================================================
        user_record = await fetch_user_record_from_db(pool, target_sec_uid=target_sec_uid)
        if user_record and user_record.get('raw_cz_level') is not None:
            if user_record['raw_cz_level'] >= 12:
                final_res = {
                    "user_id": str(user_record['user_id']), "sec_uid": target_sec_uid,
                    "display_id": target_display_id or user_record['display_id'],
                    "nickname": user_record['user_name'] or "未知用户",
                    "avatar": build_avatar_url(user_record['avatar_url']),
                    "level": user_record['raw_cz_level'],
                    "source": "database_display_id_updated" if target_display_id else "database",
                    "passed": True,
                }
                await cache_czlevel_result(redis, final_res, dict(user_record), target_sec_uid, target_display_id)
                return True, final_res

            query_str = target_display_id or target_sec_uid
            shield_result = evaluate_business_shields(
                user_record, query_str, target_sec_uid, target_display_id,
                settings["enable_zero_level_shield"], settings["active_shield_days"]
            )
            if shield_result and shield_result.get("source") in ["database_zero_blocked", "database_recent_blocked"]:
                await cache_czlevel_result(redis, shield_result, dict(user_record), target_sec_uid, target_display_id)
                return True, shield_result

        # ====================================================================
        # 发起实时直播间 Profile 请求
        # ====================================================================
        ttwid = await get_ttwid(force_refresh=False)
        latest_data = await fetch_live_profile(session, target_sec_uid, target_user_id, ttwid)
        
        if not latest_data:
            ttwid = await get_ttwid(force_refresh=True)
            latest_data = await fetch_live_profile(session, target_sec_uid, target_user_id, ttwid)

        if not latest_data:
            return False, {}

        final_level = latest_data.get('cz_club_level', 0)
        if latest_data.get('user_id'):
            await upsert_user_data(pool, latest_data, target_display_id)
        elif latest_data.get('display_id'):
            await update_display_id_in_db(pool, latest_data['display_id'], target_sec_uid)

        final_res = {
            "user_id": str(latest_data.get('user_id') or target_user_id),
            "sec_uid": latest_data.get('sec_uid') or target_sec_uid,
            "display_id": latest_data.get('display_id') or target_display_id,
            "nickname": latest_data.get('user_name', '未知用户'),
            "avatar": build_avatar_url(latest_data.get('avatar_url', '')),
            "level": final_level,
            "source": "api_updated",
            "passed": final_level >= 12,
        }

        await cache_czlevel_result(redis, final_res, latest_data, target_sec_uid, target_display_id)
        return True, final_res