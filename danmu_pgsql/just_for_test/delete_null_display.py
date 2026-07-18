# delete_inactive_users_v2.py
import asyncio
import asyncpg
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("DeadUserCleaner")

# 替换为你的真实数据库连接串
DSN = "" 

async def main():
    conn = await asyncpg.connect(DSN, command_timeout=None)
    
    # 关闭当前 Session 的服务端语句超时限制
    await conn.execute("SET statement_timeout = 0;")
    logger.info("🔧 已动态关闭数据库服务端的语句超时限制。")
    
    logger.info("🔍 正在扫描 display_id 为 NULL 的长期未活跃用户...")
    
    # 提取所有候选游离用户的 user_id
    records = await conn.fetch("SELECT user_id FROM users WHERE display_id IS NULL")
    candidate_ids = [r['user_id'] for r in records]
    total_candidates = len(candidate_ids)
    
    if total_candidates == 0:
        logger.info("🎉 未发现 display_id 为 NULL 的用户，无需清理。")
        await conn.close()
        return

    logger.info(f"👥 数据库中共有 {total_candidates} 名候选用户。")
    choice = input(f"⚠️ 是否开始清理（将同时删除 cz_club_level < 10 的低等级粉丝）？(y/n): ")
    if choice.lower() != 'y':
        logger.info("🚫 已取消操作，数据未做任何更改。")
        await conn.close()
        return

    chunk_size = 2000 
    deleted_count = 0
    skipped_count = 0

    logger.info("🗑️ 开始分批清理，包含缓冲休眠以降低 I/O 压力...")

    for i in range(0, total_candidates, chunk_size):
        chunk = candidate_ids[i:i + chunk_size]
        
        # 💡 核心改动：不仅要在 cz_fans 表中，而且等级必须 >= 10 才能被判定为安全
        cz_fans_records = await conn.fetch(
            """
            SELECT DISTINCT user_id 
            FROM cz_fans 
            WHERE user_id = ANY($1::varchar[]) 
            AND cz_club_level > 10
            """,
            chunk
        )
        
        # 转为集合，提取出等级达标的核心粉丝
        safe_users = {r['user_id'] for r in cz_fans_records}
        
        # 候选名单减去核心粉丝名单 = 需要删除的用户（包含完全游离的 + 等级 < 10 的）
        users_to_delete = list(set(chunk) - safe_users)
        skipped_count += len(safe_users)

        if not users_to_delete:
            logger.info(f"⏩ 批次 {i+1}-{min(i+chunk_size, total_candidates)} 全是高等级粉丝(>=10)，已跳过。")
            continue

        try:
            async with conn.transaction():
                # 级联删除关联的弹幕和礼物记录
                await conn.execute("DELETE FROM live_chats WHERE user_id = ANY($1::varchar[])", users_to_delete)
                await conn.execute("DELETE FROM live_gifts WHERE user_id = ANY($1::varchar[])", users_to_delete)
                
                # 删除粉丝表中的低等级记录（如果他们在 cz_fans 中的话）
                await conn.execute("DELETE FROM cz_fans WHERE user_id = ANY($1::varchar[])", users_to_delete)
                
                # 最后删除主表用户
                await conn.execute("DELETE FROM users WHERE user_id = ANY($1::varchar[])", users_to_delete)
                
            deleted_count += len(users_to_delete)
            logger.info(f"✅ 进度: {min(i+chunk_size, total_candidates)}/{total_candidates} | 删除了 {len(users_to_delete)} 名游离/低等级用户 (保留了 {len(safe_users)} 名核心粉丝)")
            
            # 缓冲休眠
            await asyncio.sleep(0.3) 
            
        except Exception as e:
            logger.error(f"❌ 批次 {i} - {i+chunk_size} 删除失败: {e}")

    print("\n" + "="*50)
    print("📊 批量深度清理任务完成！报告如下：")
    print("="*50)
    print(f"👥 成功彻底删除的用户数 (含低等级粉丝): {deleted_count} 个")
    print(f"🛡️ 因粉丝等级 >= 10 而保留的核心用户: {skipped_count} 个")
    print("="*50 + "\n")
    logger.info("💡 建议稍后在 PostgreSQL 中手动执行 `VACUUM ANALYZE users;` 以及相关联表来回收磁盘空间。")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())