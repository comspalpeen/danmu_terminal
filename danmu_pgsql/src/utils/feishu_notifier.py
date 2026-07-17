# src/utils/feishu_notifier.py
import os
import time
import hmac
import hashlib
import base64
import logging
import aiohttp
import orjson as json
from datetime import datetime

# 引入你的全局 Redis 客户端
from src.db.redis_client import get_redis

logger = logging.getLogger("Feishu")

class FeishuNotifier:
    def __init__(self):
        self.webhook_url = os.getenv("FEISHU_WEBHOOK_URL")
        self.secret = os.getenv("FEISHU_SECRET")
        self.open_id = os.getenv("FEISHU_NOTIFY_OPEN_ID")
        
        raw_uids = os.getenv("NOTIFY_UIDS", "")
        self.target_uids = set(uid.strip() for uid in raw_uids.split(",") if uid.strip())
        
        # [移除] self.notified_state = {} (内存字典彻底退役)
        
        if not self.webhook_url:
            logger.warning("⚠️ 未配置 FEISHU_WEBHOOK_URL，飞书提醒已禁用")

    def _generate_signature(self, timestamp: str) -> str:
        if not self.secret:
            return ""
        string_to_sign = f'{timestamp}\n{self.secret}'
        hmac_code = hmac.new(string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
        return base64.b64encode(hmac_code).decode('utf-8')

    async def check_and_notify(self, uid: str, nickname: str, live_status: int, room_id: str, web_rid: str = ""):
        if not self.webhook_url or uid not in self.target_uids:
            return

        redis_client = get_redis()
        state_key = f"feishu:state:{uid}"

        # 1. 从 Redis 读取上次状态
        try:
            cached_val = await redis_client.get(state_key)
            last_status = int(cached_val) if cached_val is not None else 0
        except Exception as e:
            logger.error(f"⚠️ 读取飞书状态缓存失败: {e}")
            last_status = 0

        # 2. 下播逻辑：发静默通知并清理 Redis 状态
        if live_status == 0 :
            if last_status != 0:
                # 获取当前精准时间
                end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                # 根据上一次的状态，决定静默通知的文案，并拼上时间
                if last_status == 1:
                    msg = f"🔕 {nickname} 直播结束 ({end_time_str})"
                elif last_status == 2:
                    msg = f"🔕 {nickname} 退出连麦 ({end_time_str})"
                else:
                    msg = f"🔕 {nickname} 直播已结束 ({end_time_str})"

                # 发送静默纯文本通知
                await self._send_simple_text(msg)

                try:
                    await redis_client.delete(state_key)
                    logger.info(f"🔕 [飞书] {nickname} 已下播，Redis 通知状态已重置")
                except Exception: pass
            return

        # 3. 拦截重复通知
        if live_status == last_status:
            return

        # 4. 状态改变：先发通知，再更新 Redis
        success = await self._send_interactive_card(uid, nickname, live_status, room_id, web_rid)
        
        if success:
            try:
                await redis_client.setex(state_key, 86400, str(live_status))
            except Exception as e:
                logger.error(f"⚠️ 写入飞书状态缓存失败: {e}")

    async def _send_interactive_card(self, uid: str, nickname: str, live_status: int, room_id: str, web_rid: str) -> bool:
        """发送卡片，返回布尔值表示是否成功"""
        timestamp = str(int(time.time()))
        sign = self._generate_signature(timestamp)
        start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        app_deep_link = f"snssdk1128://webcast_room?room_id={room_id}"
        web_link = f"https://live.douyin.com/{web_rid}" if web_rid else "https://live.douyin.com/"

        if live_status == 1:
            card_title = "🟢 抖音开播提醒"
            theme_color = "green"
            status_text = "正在直播中"
        elif live_status == 2:
            card_title = "⚔️ 连麦提醒"
            theme_color = "blue"
            status_text = "正在连麦中"
        else:
            return False

        payload = {
            "timestamp": timestamp,
            "sign": sign,
            "msg_type": "interactive",
            "card": {
                "config": {"wide_screen_mode": True, "enable_forward": True},
                "header": {"title": {"tag": "plain_text", "content": card_title}, "template": theme_color},
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": f"**主播**：{nickname}\n**UID**：{uid}\n**状态**：{status_text}\n**时间**：{start_time_str}\n\n 🔗 [点击进入直播间]({app_deep_link})"
                        }
                    },
                    {
                        "tag": "action",
                        "actions": [
                            {"tag": "button", "text": {"tag": "plain_text", "content": "使用浏览器打开"}, "type": "default", "url": web_link}
                        ]
                    },
                    {"tag": "hr"},
                    {
                        "tag": "div",
                        "text": {"tag": "lark_md", "content": f"<at id=\"{self.open_id}\"></at> 开饭啦！"}
                    }
                ]
            }
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.webhook_url, json=payload, timeout=10) as resp:
                    resp_data = await resp.json()
                    if resp_data.get("code") == 0:
                        logger.info(f"✅ [飞书] 成功发送通知: {nickname} (Status: {live_status})")
                        return True
                    else:
                        logger.error(f"❌ [飞书] 发送失败: {resp_data}")
                        return False
        except Exception as e:
            logger.error(f"❌ [飞书] 请求异常: {e}")
            return False
            
    async def _send_simple_text(self, text: str) -> bool:
        """发送极简纯文本消息（用于下播静默通知，无 @）"""
        timestamp = str(int(time.time()))
        sign = self._generate_signature(timestamp)
        
        payload = {
            "timestamp": timestamp,
            "sign": sign,
            "msg_type": "text",
            "content": {
                "text": text
            }
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.webhook_url, json=payload, timeout=10) as resp:
                    resp_data = await resp.json()
                    if resp_data.get("code") == 0:
                        return True
                    else:
                        logger.error(f"❌ [飞书] 静默通知发送失败: {resp_data}")
                        return False
        except Exception as e:
            logger.error(f"❌ [飞书] 静默通知请求异常: {e}")
            return False