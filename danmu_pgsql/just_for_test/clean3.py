import asyncio
import os
import sys
import asyncpg
from dotenv import load_dotenv

# 加载根目录的 .env 文件
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

async def main():
    # 从环境变量获取数据库连接 DSN
    dsn = os.environ.get("PG_DSN")
    if not dsn:
        print("❌ 错误: 无法从 .env 文件中获取 PG_DSN，请检查配置！")
        return

    print("🚀 正在连接数据库...")
    conn = None
    try:
        conn = await asyncpg.connect(dsn)
        
        # 定义基础查询条件 (CTE 提取，确保统计和删除的逻辑绝对一致)
        ghost_condition_sql = """
            display_id IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM live_chats c 
                WHERE c.user_id = users.user_id 
                  AND c.created_at < '2026-03-07 10:00:00'
            )
            AND NOT EXISTS (
                SELECT 1 FROM live_gifts g 
                WHERE g.user_id = users.user_id 
                  AND g.created_at < '2026-03-07 10:00:00'
            )
            AND NOT EXISTS (
                SELECT 1 FROM cz_fans f 
                WHERE f.user_id = users.user_id 
                  AND f.last_active_time < '2026-03-07 10:00:00'
            )
        """

        # 1. 统计数量
        count_sql = f"SELECT COUNT(1) FROM users WHERE {ghost_condition_sql};"
        
        print("⏳ 正在扫描幽灵数据，这可能需要一点时间，请稍候...")
        
        # 临时提升工作内存以加速复杂的 NOT EXISTS 查询
        await conn.execute("SET work_mem = '256MB';")
        
        # 👇👇👇 【新增这一行】临时关闭当前会话的语句超时限制 (0 表示不限制) 
        await conn.execute("SET statement_timeout = 0;")
        
        count = await conn.fetchval(count_sql)
        print(f"\n✅ 扫描完成！共发现 【 {count} 】 条幽灵用户数据。")

        # 如果没有数据，直接退出
        if count == 0:
            print("🎉 没有需要清理的幽灵数据，程序退出。")
            return

        # 2. 询问用户是否删除
        # 注意：在 asyncio 循环中使用原生 input 会短暂阻塞事件循环，
        # 但因为这是单任务 CLI 脚本，直接使用 input 是完全安全且合理的。
        user_input = input(f"❓ 是否确认删除这 {count} 条数据？(y/n): ").strip().lower()

        if user_input == 'y':
            print("🗑️ 正在执行删除操作，请勿关闭程序...")
            delete_sql = f"DELETE FROM users WHERE {ghost_condition_sql};"
            
            # execute 会返回形如 "DELETE 1234" 的命令标签
            result = await conn.execute(delete_sql) 
            deleted_count = result.split(" ")[-1] if " " in result else "未知数量"
            
            print(f"🎉 删除成功！共清理了 {deleted_count} 条数据。")
        else:
            print("🛑 操作已取消，未删除任何数据。")

    except Exception as e:
        print(f"❌ 运行过程中出现错误: {e}")
    finally:
        if conn:
            await conn.close()
            print("👋 数据库连接已关闭。")

if __name__ == "__main__":
    # 兼容 Windows 系统的 asyncio 策略
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 用户强制中断程序。")