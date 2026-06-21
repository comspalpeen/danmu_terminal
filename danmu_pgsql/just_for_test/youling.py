# clean_wandering_users.py
import asyncio
import asyncpg
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("GlobalCleaner")

# 替换为你的真实数据库连接串
DSN = "" 

async def main():
    conn = await asyncpg.connect(DSN, command_timeout=None)
    # 动态安全防线：关闭当前会话的服务端超时限制
    await conn.execute("SET statement_timeout = 0;")
    
    print("\n🚀 开始全库扫描游离用户（即存在于 users 表，但无弹幕、无礼物、非陈泽粉丝的用户）")
    print("📦 针对 2核4G 数据库已启用【键值流式分页 + 内存交叉清洗】技术，绝不卡死数据库...\n")

    wandering_user_ids = []
    total_scanned = 0
    last_user_id = ""
    chunk_size = 5000

    while True:
        # 1. 使用基于主键 user_id 的 keyset 分页，速度极快（100% 命中 PRIMARY KEY 索引）
        rows = await conn.fetch("""
            SELECT user_id FROM users 
            WHERE user_id > $1 
            ORDER BY user_id 
            LIMIT $2
        """, last_user_id, chunk_size)
        
        if not rows:
            break
            
        chunk = [r['user_id'] for r in rows]
        last_user_id = chunk[-1]  # 记录当前批次最后一个 ID，供下一页使用
        total_scanned += len(chunk)

        # 2. 将这 5000 个用户送入具体表，执行高效率的“正向命中排查”
        active_chats = await conn.fetch(
            "SELECT DISTINCT user_id FROM live_chats WHERE user_id = ANY($1::varchar[])", chunk
        )
        active_gifts = await conn.fetch(
            "SELECT DISTINCT user_id FROM live_gifts WHERE user_id = ANY($1::varchar[])", chunk
        )
        active_cz = await conn.fetch(
            "SELECT DISTINCT user_id FROM cz_fans WHERE user_id = ANY($1::varchar[])", chunk
        )

        # 3. 在 Python 内存中利用集合（Set）进行极速求并集，算出本批次活跃的用户
        active_set = (
            {r['user_id'] for r in active_chats} | 
            {r['user_id'] for r in active_gifts} | 
            {r['user_id'] for r in active_cz}
        )

        # 4. 找出本批次中，完全不在活跃集合里的纯游离幽灵用户
        for uid in chunk:
            if uid not in active_set:
                wandering_user_ids.append(uid)

        # 每扫描 5 万人打印一次进度
        if total_scanned % 50000 == 0:
            logger.info(f"⏳ 已扫描 {total_scanned} 个用户画像... 当前累计发现游离用户 {len(wandering_user_ids)} 个")

    # ================= 5. 扫描结束，输出数据报告 =================
    print("\n" + "="*50)
    print("📊 全库游离用户数据清理报告")
    print("="*50)
    print(f"👥 全库总历史用户画像数 (users 表):  {total_scanned} 个")
    print(f"🗑️  确认纯游离待删用户数 (无任何痕迹): {len(wandering_user_ids)} 个")
    print(f"🛡️  全站活跃/粉丝保留用户数:           {total_scanned - len(wandering_user_ids)} 个")
    print("="*50 + "\n")

    if not wandering_user_ids:
        logger.info("🎉 太棒了！全库没有发现任何游离的幽灵数据，无需清理。")
        await conn.close()
        return

    # ================= 6. 人工确认阶段 =================
    choice = input(f"⚠️ 是否确认永久删除以上 {len(wandering_user_ids)} 个游离用户？(y/n): ")
    if choice.lower() != 'y':
        logger.info("🚫 已取消操作，未对数据库做任何更改。")
        await conn.close()
        return

    # ================= 7. 分批原子删除 =================
    logger.info(f"🗑️ 正在拉开单次原子事务，分批抹除游离用户...")
    try:
        async with conn.transaction():
            del_chunk_size = 5000
            for i in range(0, len(wandering_user_ids), del_chunk_size):
                del_chunk = wandering_user_ids[i:i + del_chunk_size]
                # 分批 Delete，防止单次产生过大 WAL 日志导致机器磁盘 IO 挤爆
                await conn.execute("DELETE FROM users WHERE user_id = ANY($1::varchar[])", del_chunk)
                
                if (i + del_chunk_size) % 20000 == 0 or (i + del_chunk_size) >= len(wandering_user_ids):
                    logger.info(f"✅ 已成功抹除 {min(i + del_chunk_size, len(wandering_user_ids))} 个游离用户...")

        logger.info("🎉 全库游离幽灵数据已彻底清理干净！")
        logger.info("💡 终极提示：大批量清理用户后，强烈建议你在 pgAdmin 或终端手动执行 `VACUUM ANALYZE users;` 从而将表物理瘦身，并让 PostgreSQL 重新收集索引统计信息。")
    except Exception as e:
        logger.error(f"❌ 删除过程中发生异常，整个事务已自动回滚，数据未受损：{e}")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())