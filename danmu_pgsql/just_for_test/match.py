import asyncio
import asyncpg
import pandas as pd
import os

from config import PG_DSN

async def match_sec_uid(file_path):
    print(f"📂 正在加载数据表: {file_path}")
    
    # 强制指定第二行为真实表头
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path, header=1)
    else:
        df = pd.read_excel(file_path, header=1)

    df['sec_uid'] = ''
    
    print("🚀 正在连接数据库...")
    pool = await asyncpg.create_pool(dsn=PG_DSN, min_size=1, max_size=10)
    
    # --- 1. 正常匹配的语句 ---
    match_query = """
        SELECT u.sec_uid
        FROM users u
        JOIN cz_fans f ON u.user_id = f.user_id
        WHERE u.user_name = $1
          AND u.pay_grade = $2
          AND f.cz_club_level = $3;
    """
    
    match_count = 0
    skip_count = 0
    not_found_count = 0
    indices_to_drop = []

    async with pool.acquire() as conn:
        match_stmt = await conn.prepare(match_query)
        
        # --- 2. 精准抹杀的语句编译 (加入 $2 和 $3 对齐等级) ---
        kill_stmt = None
        kill_queries = [
            # 方案A: 依赖 users 和 cz_fans 进行严格对齐 (最保险)
            """
            SELECT 1 FROM users u 
            JOIN cz_fans f ON u.user_id = f.user_id 
            JOIN live_gifts lg ON u.user_id = lg.user_id 
            WHERE u.user_name = $1 AND u.pay_grade = $2 AND f.cz_club_level = $3 
              AND lg.room_id = '7646782041620056858' AND lg.gift_name LIKE '%飞机%' LIMIT 1
            """,
            # 方案B: 如果你的 live_gifts 表字段叫 rooms_ud
            """
            SELECT 1 FROM users u 
            JOIN cz_fans f ON u.user_id = f.user_id 
            JOIN live_gifts lg ON u.user_id = lg.user_id 
            WHERE u.user_name = $1 AND u.pay_grade = $2 AND f.cz_club_level = $3 
              AND lg.rooms_ud = '7646782041620056858' AND lg.gift_name LIKE '%飞机%' LIMIT 1
            """
        ]
        
        for q in kill_queries:
            try:
                kill_stmt = await conn.prepare(q)
                break  
            except Exception:
                continue
                
        if not kill_stmt:
            print("⚠️ 警告: 无法编译 live_gifts 查询，请检查数据库是否存在对应字段。")

        # --- 3. 开始遍历 Excel 数据 ---
        for index, row in df.iterrows():
            nickname = str(row.get('昵称', '')).strip()
            gift_name = str(row.get('礼物名称', '')).strip()

            # 常规过滤 (不匹配飞机，或者是神豪/神秘人直接跳过，留在表里但不查数据库)
            if '神秘人' in nickname or '嘉年华' in gift_name or '抖音1号' in gift_name or '飞机' not in gift_name:
                skip_count += 1
                continue

            # 👉 修改点：先把等级解析出来，再去判断要不要抹杀！
            pay_grade_raw = row.get('消费等级')
            club_level_raw = row.get('粉丝团等级')
            
            if pd.isna(pay_grade_raw) or pd.isna(club_level_raw):
                skip_count += 1
                continue
                
            try:
                pay_grade = int(float(pay_grade_raw))
                club_level = int(float(club_level_raw))
            except ValueError:
                skip_count += 1
                continue

            # 💥 数据库级精准判定：传入 姓名、消费等级、粉丝团等级。三项全对上才删！
            if kill_stmt:
                is_killed = await kill_stmt.fetchval(nickname, pay_grade, club_level)
                if is_killed:
                    print(f"🗑️ 精准抹杀: [{nickname}] (等级 {pay_grade}/{club_level}) 满足剔除条件，彻底删去此人记录！")
                    indices_to_drop.append(index)
                    continue
            
            # --- 常规 sec_uid 匹配逻辑 ---
            records = await match_stmt.fetch(nickname, pay_grade, club_level)
            
            if len(records) == 1:
                df.at[index, 'sec_uid'] = records[0]['sec_uid']
                match_count += 1
                print(f"✅ 匹配成功: [{nickname}] -> {records[0]['sec_uid']}")
            elif len(records) > 1:
                not_found_count += 1
                print(f"⚠️ 重名放弃: [{nickname}] (找到 {len(records)} 个完全同等级同名的人，留空处理)")
            else:
                not_found_count += 1
                print(f"❌ 未找到: [{nickname}]")
                
    await pool.close()
    
    # 🔪 核心动作：集中删除被精确标记了的数据
    if indices_to_drop:
        df.drop(index=indices_to_drop, inplace=True)
        print(f"💥 已从内存中彻底粉碎 {len(indices_to_drop)} 条非法记录！")
    
    # 导出结果文件
    output_file = "已匹配_sec_uid_" + os.path.basename(file_path)
    if output_file.endswith('.csv'):
        df.to_csv(output_file, index=False, encoding='utf-8-sig')
    else:
        df.to_excel(output_file, index=False)
        
    print("="*40)
    print(f"🎉 处理完成！")
    print(f"📊 成功写入 sec_uid: {match_count} 条")
    print(f"📊 匹配不到或极度重名留空: {not_found_count} 条")
    print(f"🗑️ 精准对齐后彻底删去: {len(indices_to_drop)} 条")
    print(f"💾 结果已保存至: {output_file}")

if __name__ == '__main__':
    file_name = "抖音礼物清单整理.xlsx"
    asyncio.run(match_sec_uid(file_name))