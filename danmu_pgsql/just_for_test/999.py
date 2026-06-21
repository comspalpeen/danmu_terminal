import os
import sys
import asyncio
import asyncpg
from collections import OrderedDict
from datetime import datetime
from html import escape
from typing import Dict, List, Tuple
from dotenv import load_dotenv

# ==========================================
# ⚙️ 配置区域（运行前请修改这里）
# ==========================================
ROOM_IDS = [
    "7632718655595268902",  # 替换为实际的 room_id 1
    "7632941563743587108",  # 替换为实际的 room_id 2
    "7633001835293641499",  # 替换为实际的 room_id 3
    "7633089499337132854"   # 替换为实际的 room_id 4
]

# 全局时间限制（确保格式为 YYYY-MM-DD HH:MM:SS）
START_TIME_STR = "2026-04-26 00:00:00"
END_TIME_STR = "2026-04-27 00:00:00"

# 钻石消费门槛
MIN_TOTAL_DIAMOND = 998

# 导出文件名
OUTPUT_FILENAME = "merged_spender_threshold_999.html"
# ==========================================

# 从根目录加载 .env 文件以获取 PG_DSN
load_dotenv('.env')
PG_DSN = os.environ.get("PG_DSN")

def _profile_url(sec_uid: str) -> str:
    return f"https://www.douyin.com/user/{sec_uid}" if sec_uid else ""

def _format_gift_counts_by_price(gift_counts: Dict[str, int], gift_prices: Dict[str, int]) -> List[str]:
    """
    按礼物单价从高到低排序，如果单价相同则按数量从高到低，最后按名称排序。
    """
    sorted_names = sorted(
        gift_counts.keys(),
        key=lambda name: (-gift_prices.get(name, 0), -gift_counts[name], name),
    )
    return [f"{name} × {gift_counts[name]}" for name in sorted_names]

def build_spender_rows(rows: List[Dict], min_total_diamond: int) -> List[Dict]:
    grouped: Dict[Tuple[str, str, str], Dict] = OrderedDict()

    for row in rows:
        key = (
            row.get("user_id") or "",
            row.get("sec_uid") or "",
            row.get("display_id") or "",
            row.get("user_name") or "",
        )
        if key not in grouped:
            grouped[key] = {
                "user_name": row.get("user_name") or "神秘人",
                "display_id": row.get("display_id") or "",
                "sec_uid": row.get("sec_uid") or "",
                "profile_url": _profile_url(row.get("sec_uid") or ""),
                "total_diamond_count": 0,
                "gift_counts": {},
                "gift_prices": {},  
                "first_time": row.get("send_time"),
            }

        item = grouped[key]
        item["total_diamond_count"] += int(row.get("total_diamond_count") or 0)
        gift_name = row.get("gift_name") or ""
        if gift_name:
            current_count = max(0, int(row.get("combo_count") or 0)) * max(0, int(row.get("group_count") or 0))
            item["gift_counts"][gift_name] = item["gift_counts"].get(gift_name, 0) + current_count
            item["gift_prices"][gift_name] = int(row.get("diamond_count") or 0)

    # 过滤满足门槛的数据
    filtered_items = [
        item for item in grouped.values() if item["total_diamond_count"] >= min_total_diamond
    ]
    # 按总消费降序排序
    sorted_items = sorted(
        filtered_items,
        key=lambda item: (-item["total_diamond_count"], item["user_name"]),
    )

    result = []
    for index, item in enumerate(sorted_items, start=1):
        result.append({
            "rank": index,
            "user_name": item["user_name"],
            "display_id": item["display_id"],
            "sec_uid": item["sec_uid"],
            "profile_url": item["profile_url"],
            "total_diamond_count": item["total_diamond_count"],
            "gift_list": _format_gift_counts_by_price(item["gift_counts"], item["gift_prices"])
        })
    return result

def render_html(anchor_name: str, summary_lines: List[str], headers: List[str], body_rows: List[List[str]], empty_text: str) -> str:
    summary_html = "".join(
        f'<span class="chip">{escape(line)}</span>' for line in summary_lines if line
    )

    if body_rows:
        header_html = "".join(f"<th>{escape(header)}</th>" for header in headers)
        row_html = ""
        for row in body_rows:
            row_html += "<tr>" + "".join(
                f'<td><div class="cell">{cell}</div></td>' for cell in row
            ) + "</tr>"
        table_html = f"""
        <div class="table-shell">
          <table>
            <thead>
              <tr>{header_html}</tr>
            </thead>
            <tbody>{row_html}</tbody>
          </table>
        </div>
        """
    else:
        table_html = f'<div class="empty">{escape(empty_text)}</div>'

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escape(anchor_name)} - 礼物报表</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #eef3f8;
      --panel: rgba(255, 255, 255, 0.9);
      --ink: #18222d;
      --muted: #687587;
      --line: #d6dde7;
      --accent: #123955;
      --accent-soft: #e8eef6;
      --shadow: 0 24px 60px rgba(18, 33, 50, 0.12);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top, rgba(18, 57, 85, 0.12), transparent 28%),
        linear-gradient(180deg, #f7fafc 0%, var(--bg) 100%);
      padding: 24px 14px 40px;
    }}
    .page {{ max-width: 860px; margin: 0 auto; }}
    .shell {{
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
      backdrop-filter: blur(18px);
    }}
    .hero {{
      padding: 28px 24px 20px;
      background: linear-gradient(135deg, rgba(18, 57, 85, 0.98), rgba(28, 83, 118, 0.88));
      color: #f7fbff;
    }}
    .eyebrow {{ font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.72; margin-bottom: 12px; }}
    h1 {{ font-size: 26px; line-height: 1.2; margin: 0 0 8px; }}
    .sub {{ margin: 0; color: rgba(247, 251, 255, 0.82); font-size: 14px; line-height: 1.7; }}
    .content {{ padding: 22px 18px 24px; }}
    .summary {{ display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }}
    .chip {{
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid rgba(18, 57, 85, 0.08);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 13px;
    }}
    .table-shell {{ border: 1px solid var(--line); border-radius: 20px; overflow: hidden; background: white; }}
    table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
    th:nth-child(1), td:nth-child(1) {{ width: 10%; text-align: center; }} 
    th:nth-child(2), td:nth-child(2) {{ width: 22%; }} 
    th:nth-child(3), td:nth-child(3) {{ width: 12%; text-align: center; }} 
    th:nth-child(4), td:nth-child(4) {{ width: 34%; }} 
    th:nth-child(5), td:nth-child(5) {{ width: 22%; }}
    th, td {{ padding: 8px 4px; font-size: 12px; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; word-break: break-word; line-height: 1.5; }}
    th {{ background: #f7f9fc; color: var(--accent); font-weight: bold; }}
    tbody tr:nth-child(even) {{ background: rgba(248, 250, 252, 0.8); }}
    tbody tr:last-child td {{ border-bottom: none; }}
    .cell {{ white-space: pre-wrap; word-break: break-word; }}
    .link {{
      display: inline-block; color: var(--accent); text-decoration: none; font-weight: 600;
      border: 1px solid var(--accent); padding: 2px 10px; border-radius: 20px;
      background: var(--accent-soft); font-size: 11px; white-space: nowrap; transition: all 0.2s ease;
    }}
    .link:hover {{ background: var(--accent); color: #ffffff; box-shadow: 0 2px 8px rgba(18, 57, 85, 0.2); }}
    .muted {{ color: var(--muted); }}
    .empty {{ border: 1px dashed var(--line); background: rgba(255, 255, 255, 0.72); border-radius: 20px; padding: 48px 18px; text-align: center; color: var(--muted); font-size: 14px; }}
    @media (min-width: 920px) {{
      body {{ padding: 48px 18px 64px; }}
      .page {{ max-width: 980px; }}
      .shell {{ padding: 14px; background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(244,247,251,0.94)); }}
      .hero, .content {{ border-radius: 22px; }}
      .hero {{ margin-bottom: 14px; }}
      th, td {{ padding: 14px 12px; font-size: 13px; }}
    }}
  </style>
</head>
<body>
  <div class="page">
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">Merged Export</div>
        <h1>{escape(anchor_name)}</h1>
        <p class="sub">多场次联合阈值筛选 (门槛: {MIN_TOTAL_DIAMOND} 钻石)<br />{escape(START_TIME_STR)} 至 {escape(END_TIME_STR)}</p>
      </section>
      <section class="content">
        <div class="summary">{summary_html}</div>
        {table_html}
      </section>
    </div>
  </div>
</body>
</html>"""

async def main():
    if not PG_DSN:
        print("❌ 错误：在 .env 文件中找不到 PG_DSN。请确保在项目根目录运行！")
        return

    start_time = datetime.fromisoformat(START_TIME_STR)
    end_time = datetime.fromisoformat(END_TIME_STR)

    print(f"🚀 正在连接数据库...")
    try:
        conn = await asyncpg.connect(PG_DSN)
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return

    try:
        # 查询这几个场次的主播名字 (取第一个匹配到的)
        room_row = await conn.fetchrow("SELECT nickname FROM rooms WHERE room_id = ANY($1::varchar[]) LIMIT 1", ROOM_IDS)
        anchor_name = room_row['nickname'] if room_row else "多场次合并名单"

        print(f"🔎 正在查询 {len(ROOM_IDS)} 个场次的礼物数据...")
        sql = """
            SELECT
                g.user_id,
                COALESCE(u.user_name, g.user_name) AS user_name,
                COALESCE(u.display_id, '') AS display_id,
                COALESCE(u.sec_uid, '') AS sec_uid,
                COALESCE(g.gift_name, '') AS gift_name,
                COALESCE(g.diamond_count, 0) AS diamond_count,
                COALESCE(g.combo_count, 1) AS combo_count,
                COALESCE(g.group_count, 1) AS group_count,
                COALESCE(g.total_diamond_count, 0) AS total_diamond_count,
                g.send_time
            FROM live_gifts g
            LEFT JOIN users u ON g.user_id = u.user_id
            WHERE g.room_id = ANY($1::varchar[])
              AND g.send_time IS NOT NULL
              AND g.send_time >= $2
              AND g.send_time <= $3
            ORDER BY g.send_time ASC, g.id ASC
        """
        rows = await conn.fetch(sql, ROOM_IDS, start_time, end_time)
        print(f"✅ 查询完毕，共获取到 {len(rows)} 条礼物记录。正在聚合...")

        preview_rows = build_spender_rows([dict(r) for r in rows], MIN_TOTAL_DIAMOND)
        
        # 将整理好的数据转换为 HTML 行格式
        body_rows = []
        for row in preview_rows:
            profile = f'<a class="link" href="{escape(row["profile_url"])}" target="_blank">主页</a>' if row["profile_url"] else '<span class="muted">无</span>'
            gifts_html = "<br>".join(escape(g) for g in row["gift_list"]) if row["gift_list"] else "-"
            body_rows.append([
                str(row["rank"]),
                escape(row["user_name"]),
                profile,
                gifts_html,
                str(row["total_diamond_count"]),
            ])

        print(f"📊 满足 >= {MIN_TOTAL_DIAMOND} 钻石的用户共有 {len(preview_rows)} 人。正在生成 HTML...")

        # 生成 HTML
        html = render_html(
            anchor_name=anchor_name,
            summary_lines=[
                "导出类型：合并场次消费名单",
                f"查询场次：{len(ROOM_IDS)} 场",
                f"消费阈值：{MIN_TOTAL_DIAMOND} 钻石",
                f"结果数量：{len(preview_rows)} 人",
            ],
            headers=["序号", "昵称", "主页", "礼物详情 (单价降序)", "总钻石"],
            body_rows=body_rows,
            empty_text=f"该时间段内的指定场次中，没有累积达到 {MIN_TOTAL_DIAMOND} 钻石的用户。",
        )

        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
            f.write(html)
        
        print(f"🎉 导出成功！文件已保存至根目录: {OUTPUT_FILENAME}")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())