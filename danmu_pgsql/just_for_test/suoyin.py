import psycopg2
import time

# 1. 填入你的 DSN 连接字符串
PG_DSN = ""

TARGET_INDEXES = [
    "public.idx_users_display_id",
    "public.idx_users_lower_user_name",
    "public.idx_users_sec_uid",
    "public.users_pkey"
]

def reindex_users_table():
    print("🚀 开始连接数据库，准备为 users 表索引瘦身...")
    try:
        conn = psycopg2.connect(PG_DSN)
        # 【关键】必须开启自动提交，REINDEX CONCURRENTLY 无法在事务块中运行
        conn.autocommit = True
        cursor = conn.cursor()
        
        # 优化会话参数
        print("⚙️  配置会话参数（禁用超时，调大内存至 2GB）...")
        cursor.execute("SET statement_timeout = 0;")
        cursor.execute("SET maintenance_work_mem = '2GB';")
        
        # 获取重建前的大小
        print("📊 正在统计瘦身前各个索引的大小...")
        cursor.execute("""
            SELECT relname, pg_size_pretty(pg_relation_size(indexrelid)) 
            FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid 
            WHERE indexrelid::regclass::text LIKE '%users%';
        """)
        before_sizes = {row[0]: row[1] for row in cursor.fetchall()}
        
        # 依次并发重建索引
        for idx in TARGET_INDEXES:
            short_name = idx.split('.')[-1]
            print(f"\n⏳ 正在并发重建索引: {short_name}（请耐心等待，不锁表且不会超时）...")
            start_time = time.time()
            
            try:
                # 使用 REINDEX INDEX CONCURRENTLY 核心语法
                cursor.execute(f"REINDEX INDEX CONCURRENTLY {idx};")
                duration = time.time() - start_time
                print(f"✅ {short_name} 重建成功！耗时: {duration:.2f} 秒")
            except Exception as idx_err:
                print(f"❌ 重建 {short_name} 失败，原因: {idx_err}")
                continue
        
        # 获取重建后的大小并对比
        print("\n🔍 正在统计瘦身后的索引状态...")
        cursor.execute("""
            SELECT relname, pg_size_pretty(pg_relation_size(indexrelid)), indisvalid 
            FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid 
            WHERE indexrelid::regclass::text LIKE '%users%';
        """)
        after_results = cursor.fetchall()
        
        print("\n📊 --- Users 表索引瘦身对比报告 ---")
        for row in after_results:
            idx_name = row[0]
            size_before = before_sizes.get(idx_name, "未知")
            size_after = row[1]
            status = "🟢 有效(True)" if row[2] else "🔴 失效(False)"
            print(f"索引名: {idx_name:<30} | 状态: {status} | 瘦身前: {size_before:<8} -> 瘦身后: {size_after}")
            
    except Exception as e:
        print(f"❌ 运行中发生全局错误: {e}")
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()
        print("\n🔒 数据库连接已安全关闭。")

if __name__ == "__main__":
    reindex_users_table()