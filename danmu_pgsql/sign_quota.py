import asyncio
import time
import hmac
import hashlib
import base64
import aiohttp

# ================= 配置区域 =================
SUPABASE_URL = "https://ukmhzxpmxknorqqzcwrb.supabase.co/rest/v1/system_config?select=key,value&key=in.(registration_enabled,registration_quota,registration_used)"
API_KEY = "sb_publishable_xCrZLEe_85OqDESzFdGzTw_zI2ZVXTU"

# 飞书配置（请在此处硬编码你的信息）
FEISHU_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/0a941db2-f9ff-41d3-af25-305ccf26a37f"
FEISHU_SECRET = "Xr6KUiiOJ8Ri6E9tCjyPrc"  # 如果飞书机器人安全设置没勾选“签名校验”，留空即可
USER_OPEN_ID = "ou_7723fbb9a5eeef91572f78e3704fc3ff"   # 你的飞书 open_id，用于 @ 通知
# ============================================

# 策略阈值：可用额度大于多少时才认为是有意义的放额
MIN_AVAILABLE_THRESHOLD = 100 
# ============================================

def gen_sign(secret: str, timestamp: int) -> str:
    string_to_sign = f'{timestamp}\n{secret}'
    hmac_code = hmac.new(string_to_sign.encode('utf-8'), digestmod=hashlib.sha256).digest()
    return base64.b64encode(hmac_code).decode('utf-8')

async def send_feishu_notification(quota: int, used: int, available: int, enabled: str):
    timestamp = int(time.time())
    
    payload = {
        "msg_type": "post",
        "content": {
            "post": {
                "zh_cn": {
                    "title": "🎉 陈泽网 - 检测到可注册额度！",
                    "content": [
                        [
                            {"tag": "text", "text": "🔊 状态提醒："},
                            {"tag": "text", "text": f"系统当前注册功能为 【{'开启' if enabled == 'true' else '关闭'}】\n"}
                        ],
                        [
                            {"tag": "text", "text": "📊 额度详情：\n"},
                            {"tag": "text", "text": f"  • 🚀 当前可用名额: {available} (已开放)\n"},
                            {"tag": "text", "text": f"  • 📦 平台总名额: {quota}\n"},
                            {"tag": "text", "text": f"  • 📥 当前已使用: {used}\n"}
                        ],
                        [
                            {"tag": "text", "text": "⏰ 检测时间: "},
                            {"tag": "text", "text": f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}\n\n"}
                        ],
                        [
                            {"tag": "at", "user_id": USER_OPEN_ID},
                            {"tag": "text", "text": " 名额已刷新"}
                        ]
                    ]
                }
            }
        }
    }

    if FEISHU_SECRET:
        payload["timestamp"] = str(timestamp)
        payload["sign"] = gen_sign(FEISHU_SECRET, timestamp)

    headers = {"Content-Type": "application/json"}
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(FEISHU_WEBHOOK_URL, json=payload, headers=headers) as resp:
                result = await resp.json()
                if result.get("code") == 0:
                    print("[INFO] 飞书通知发送成功")
                else:
                    print(f"[ERROR] 飞书发送失败: {result}")
        except Exception as e:
            print(f"[ERROR] 推送飞书异常: {e}")

async def main():
    headers = {"apikey": API_KEY}
    
    # 核心持久化状态控制：
    # True 代表上一次检查时额度是充足的（不需要重复通知）
    # False 代表上一次检查时处于“缺额度”状态，或者刚刚启动脚本
    has_enough_quota = False 
    
    print("🚀 陈泽网普适性额度智能监控已启动...")

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(SUPABASE_URL, headers=headers, timeout=10) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        data_dict = {item["key"]: item["value"] for item in data}
                        
                        quota = int(data_dict.get("registration_quota", 0))
                        used = int(data_dict.get("registration_used", 0))
                        enabled_str = data_dict.get("registration_enabled", "false")
                        
                        # 计算当前可用差值
                        available = quota - used
                        
                        print(f"[{time.strftime('%H:%M:%S')}] 总额度: {quota} | 已用: {used} | 可用: {available}")
                        
                        # 判断逻辑
                        if available > MIN_AVAILABLE_THRESHOLD:
                            # 只有从“没有额度(False)”变成“有额度”的瞬间，才触发通知
                            if not has_enough_quota:
                                await send_feishu_notification(quota, used, available, enabled_str)
                                has_enough_quota = True  # 锁住状态，防止重复报警
                        else:
                            # 当可用额度消耗殆尽（低于阈值），重置状态，等待下一次扩容突变
                            has_enough_quota = False
                            
                    else:
                        print(f"[WARNING] 接口异常，状态码: {resp.status}")
            except Exception as e:
                print(f"[ERROR] 请求发生异常: {e}")
            
            await asyncio.sleep(30)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n监控已安全退出。")