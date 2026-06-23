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

def gen_sign(secret: str, timestamp: int) -> str:
    """飞书安全签名的生成逻辑"""
    string_to_sign = f'{timestamp}\n{secret}'
    hmac_code = hmac.new(string_to_sign.encode('utf-8'), digestmod=hashlib.sha256).digest()
    sign = base64.b64encode(hmac_code).decode('utf-8')
    return sign

async def send_feishu_notification(quota: str, used: str, enabled: str):
    """发送美化后的飞书富文本/Markdown通知"""
    timestamp = int(time.time())
    
    # 构造飞书消息体 (使用 post 类型以支持高级格式和 @ 功能)
    payload = {
        "msg_type": "post",
        "content": {
            "post": {
                "zh_cn": {
                    "title": "🚨 陈泽网 - 注册额度扩张通知",
                    "content": [
                        [
                            {"tag": "text", "text": "📋 状态监控："},
                            {"tag": "text", "text": f"当前注册功能已{'开启' if enabled == 'true' else '关闭'}\n"}
                        ],
                        [
                            {"tag": "text", "text": "📈 额度变动：\n"},
                            {"tag": "text", "text": f"  • 当前总额度: {quota}\n"},
                            {"tag": "text", "text": f"  • 已使用额度: {used}\n"}
                        ],
                        [
                            {"tag": "text", "text": "⏰ 检测时间: "},
                            {"tag": "text", "text": f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}\n\n"}
                        ],
                        [
                            {"tag": "at", "user_id": USER_OPEN_ID},
                            {"tag": "text", "text": " 请及时前往注册。"}
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
            print(f"[ERROR] 推送飞书时发生异常: {e}")

async def main():
    headers = {
        "apikey": API_KEY
    }
    
    # 标记是否已经通知过，避免额度大于6000时每30秒狂轰滥炸
    has_notified = False
    
    print("🚀 陈泽网额度监控服务已启动...")

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(SUPABASE_URL, headers=headers, timeout=10) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        
                        # 解析字段
                        data_dict = {item["key"]: item["value"] for item in data}
                        quota_str = data_dict.get("registration_quota", "0")
                        used_str = data_dict.get("registration_used", "0")
                        enabled_str = data_dict.get("registration_enabled", "false")
                        
                        current_quota = int(quota_str)
                        
                        print(f"[{time.strftime('%H:%M:%S')}] 当前额度: {current_quota} | 已用: {used_str}")
                        
                        # 判断触发条件：额度大于 6000
                        if current_quota > 6000:
                            if not has_notified:
                                await send_feishu_notification(quota_str, used_str, enabled_str)
                                has_notified = True  # 状态置为已通知
                        else:
                            # 如果额度回落或重置，可以恢复通知状态
                            has_notified = False
                            
                    else:
                        print(f"[WARNING] 接口响应异常，状态码: {resp.status}")
            except Exception as e:
                print(f"[ERROR] 监控请求发生异常: {e}")
            
            # 每 30 秒轮询一次
            await asyncio.sleep(30)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n监控已安全退出。")