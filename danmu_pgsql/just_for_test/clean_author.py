# delete_streamer_data.py
import asyncio
import asyncpg
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Cleaner")

# 替换为你的真实数据库连接串
DSN = "postgresql://postgresql_admin:Woshinibaba7421@pgm-uf6z9o14bx45x9i5.pg.rds.aliyuncs.com:2077/dy_live_data" 

# 👇 改为目标主播的 user_id
TARGET_AUTHOR_USER_ID = "2949327753867716"  

async def main():
    conn = await asyncpg.connect(DSN, command_timeout=None)
    
    # 💡 核心改动 1：强行关闭 PostgreSQL 服务端的语句超时时间（当前 Session 有效）
    await conn.execute("SET statement_timeout = 0;")
    logger.info("🔧 已动态关闭数据库服务端的语句超时限制，防止被强杀。")
    
    logger.info(f"🔍 正在通过主播 [user_id: {TARGET_AUTHOR_USER_ID}] 查找关联的 room_id...")

    room_records = await conn.fetch("SELECT room_id FROM rooms WHERE user_id = $1", TARGET_AUTHOR_USER_ID)
    target_room_ids = [r['room_id'] for r in room_records]
    target_rooms_set = set(target_room_ids) # 转为集合，方便 Python 极速比对

    if not target_room_ids:
        logger.warning(f"⚠️ 未找到该主播的 rooms 记录，将仅尝试清理 authors 表。")
        authors_count = await conn.fetchval("SELECT count(*) FROM authors WHERE uid = $1", TARGET_AUTHOR_USER_ID)
        if authors_count > 0:
            choice = input(f"发现 {authors_count} 个主播画像(authors)，是否删除？(y/n): ")
            if choice.lower() == 'y':
                await conn.execute("DELETE FROM authors WHERE uid = $1", TARGET_AUTHOR_USER_ID)
                logger.info("✅ 主播画像已彻底清理。")
        await conn.close()
        return
    
    logger.info(f"✅ 找到关联房间数: {len(target_room_ids)}，正在提取潜在游离用户名单...")

    target_users_sql = """
        SELECT DISTINCT user_id FROM live_chats WHERE room_id = ANY($1::varchar[])
        UNION
        SELECT DISTINCT user_id FROM live_gifts WHERE room_id = ANY($1::varchar[])
    """
    target_users_records = await conn.fetch(target_users_sql, target_room_ids)
    target_user_ids = [r['user_id'] for r in target_users_records]
    
    logger.info(f"👥 共有 {len(target_user_ids)} 名用户曾在此主播房间活跃，开始分批排查游离状态...")

    safe_users_set = set()
    # 💡 核心改动 2：2核4G机器扛不住 5000，我们降级到 1000 人一批，小步快跑
    chunk_size = 1000 
    
    for i in range(0, len(target_user_ids), chunk_size):
        chunk = target_user_ids[i:i + chunk_size]
        logger.info(f"🔄 正在排查第 {i+1} 到 {min(i+chunk_size, len(target_user_ids))} 名用户...")
        
        # 💡 核心改动 3：放弃在 SQL 里做 NOT IN 的苦力活。
        # 让数据库只做它最擅长的正向查询，把对比的逻辑交给 Python 处理！
        
        # 检查1: 这些人发过的所有弹幕的房间号
        chats_records = await conn.fetch(
            "SELECT DISTINCT user_id, room_id FROM live_chats WHERE user_id = ANY($1::varchar[])",
            chunk
        )
        for r in chats_records:
            if r['room_id'] not in target_rooms_set:
                safe_users_set.add(r['user_id'])

        # 检查2: 这些人送过的所有礼物的房间号
        gifts_records = await conn.fetch(
            "SELECT DISTINCT user_id, room_id FROM live_gifts WHERE user_id = ANY($1::varchar[])",
            chunk
        )
        for r in gifts_records:
            if r['room_id'] not in target_rooms_set:
                safe_users_set.add(r['user_id'])

        # 检查3: 这些人是否是陈泽的粉丝
        safe_cz = await conn.fetch(
            "SELECT DISTINCT user_id FROM cz_fans WHERE user_id = ANY($1::varchar[])",
            chunk
        )
        for r in safe_cz:
            safe_users_set.add(r['user_id'])

    # 真正需要删除的游离用户 = 目标总用户 - 鉴定为安全的用户
    user_ids_to_delete = list(set(target_user_ids) - safe_users_set)
    user_delete_count = len(user_ids_to_delete)

    logger.info("✅ 游离用户排查完毕！正在统计其他数据表...")

    # 统计其他表的待删除数量
    chats_count = await conn.fetchval("SELECT count(*) FROM live_chats WHERE room_id = ANY($1::varchar[])", target_room_ids)
    gifts_count = await conn.fetchval("SELECT count(*) FROM live_gifts WHERE room_id = ANY($1::varchar[])", target_room_ids)
    pks_count = await conn.fetchval("SELECT count(*) FROM pk_history WHERE room_id = ANY($1::varchar[])", target_room_ids)
    rooms_count = len(target_room_ids)
    authors_count = await conn.fetchval("SELECT count(*) FROM authors WHERE uid = $1", TARGET_AUTHOR_USER_ID)

    print("\n" + "="*50)
    print(f"📊 待清理数据报告 (主播 user_id: {TARGET_AUTHOR_USER_ID})")
    print("="*50)
    print(f"👥 确认清理的纯游离用户数: {user_delete_count} 个")
    print(f"💬 关联弹幕记录数:         {chats_count} 条")
    print(f"🎁 关联礼物记录数:         {gifts_count} 条")
    print(f"⚔️  关联 PK 记录数:         {pks_count} 场")
    print(f"🏠 关联直播间记录数:       {rooms_count} 个")
    print(f"👤 主播画像 (authors):     {authors_count} 个")
    print("="*50 + "\n")

    total_records = user_delete_count + chats_count + gifts_count + pks_count + rooms_count + authors_count
    if total_records == 0:
        logger.info("🎉 数据库中没有找到该主播的任何相关记录，无需清理。")
        await conn.close()
        return

    choice = input("⚠️ 是否确认在【单次原子事务】中永久删除以上所有数据？(y/n): ")
    if choice.lower() != 'y':
        logger.info("🚫 已取消删除操作，数据未做任何更改。")
        await conn.close()
        return

    logger.info("🗑️ 正在执行原子删除，正在为您大批量抹除数据...")
    try:
        async with conn.transaction():
            if user_ids_to_delete:
                for i in range(0, len(user_ids_to_delete), 5000):
                    del_chunk = user_ids_to_delete[i:i+5000]
                    await conn.execute("DELETE FROM users WHERE user_id = ANY($1::varchar[])", del_chunk)
            
            await conn.execute("DELETE FROM live_chats WHERE room_id = ANY($1::varchar[])", target_room_ids)
            await conn.execute("DELETE FROM live_gifts WHERE room_id = ANY($1::varchar[])", target_room_ids)
            await conn.execute("DELETE FROM pk_history WHERE room_id = ANY($1::varchar[])", target_room_ids)
            
            await conn.execute("DELETE FROM rooms WHERE room_id = ANY($1::varchar[])", target_room_ids)
            await conn.execute("DELETE FROM authors WHERE uid = $1", TARGET_AUTHOR_USER_ID)

        logger.info("✅ 所有关联数据已彻底清理完毕！建议稍后在数据库中手动执行 VACUUM ANALYZE 回收磁盘空间。")
    except Exception as e:
        logger.error(f"❌ 删除过程中发生异常，事务已自动回滚，数据未受损: {e}")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())