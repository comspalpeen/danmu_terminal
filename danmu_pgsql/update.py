import asyncio
import aiohttp
import asyncpg
import logging
from src.utils.fetcher_utils import extract_filename # ✅ 直接复用你原有的极速提取工具

# ================= 配置区 =================
# 请填入你的数据库连接字符串
PG_DSN = "" 

# ==========================================

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("FixUsers")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

async def fetch_user_info(session: aiohttp.ClientSession, sec_uid: str):
    """请求抖音接口获取最新资料"""
    url = f"https://www.iesdouyin.com/web/api/v2/user/info/?sec_uid={sec_uid}"
    try:
        async with session.get(url, headers=HEADERS, timeout=10) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status_code") == 0 and "user_info" in data:
                    return data["user_info"]
    except Exception as e:
        logger.error(f"获取 sec_uid [{sec_uid}] 失败: {e}")
    return None

async def main():
    logger.info("正在连接数据库...")
    pool = await asyncpg.create_pool(dsn=PG_DSN)
    
    # 联合查询需要更新的老粉（等级 >= 12 且昵称包含特定前缀，且具有 sec_uid）
    query_sql = """
        SELECT u.user_id, u.sec_uid, u.user_name
        FROM users u
        JOIN cz_fans f ON u.user_id = f.user_id
        WHERE (f.cz_club_level >=8 and f.cz_club_level <11 ) 
          AND (u.user_name LIKE 'dou%' OR u.user_name LIKE '神秘人%')
          AND u.sec_uid IS NOT NULL
          AND u.sec_uid != '';
    """
    
    async with pool.acquire() as conn:
        records = await conn.fetch(query_sql)
        logger.info(f"🔍 查出符合条件需要更新的用户共 {len(records)} 名")

        if not records:
            logger.info("没有需要更新的用户，脚本退出。")
            await pool.close()
            return

        update_sql = """
            UPDATE users 
            SET user_name = $1, avatar_url = $2, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $3;
        """

        success_count = 0
        # 开启并发会话
        async with aiohttp.ClientSession() as session:
            for idx, record in enumerate(records):
                user_id = record['user_id']
                sec_uid = record['sec_uid']
                old_name = record['user_name']

                logger.info(f"[{idx+1}/{len(records)}] 正在处理 UID: {user_id[-4:]} (旧昵称: {old_name})")
                
                # 调接口
                user_info = await fetch_user_info(session, sec_uid)
                if user_info:
                    new_nickname = user_info.get("nickname", "")
                    
                    # ✅ 使用原项目的 extract_filename 进行裁切
                    avatar_url = ""
                    avatar_thumb = user_info.get("avatar_thumb", {})
                    if "url_list" in avatar_thumb and avatar_thumb["url_list"]:
                        avatar_url = extract_filename(avatar_thumb["url_list"][0]) 
                    
                    if new_nickname and avatar_url:
                        # 覆盖写库
                        await conn.execute(update_sql, new_nickname, avatar_url, user_id)
                        logger.info(f"  ✅ 成功洗白: [{old_name}] -> [{new_nickname}] ({avatar_url})")
                        success_count += 1
                    else:
                        logger.warning(f"  ⚠️ 获取到的数据不完整，跳过。")
                else:
                    logger.warning(f"  ❌ 接口请求失败或风控拦截。")
                
                # 留一点点间隔，防止频繁调接口被风控封锁 Cookie
                await asyncio.sleep(5)

        logger.info(f"🎉 脚本执行完毕！成功洗白 {success_count}/{len(records)} 名高等级核心粉丝数据。")
    
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())