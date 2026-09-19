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
        
        if not self.webhook_url:
            logger.warning("⚠️ 未配置 FEISHU_WEBHOOK_URL，飞书提醒已禁用")

    def _generate_signature(self, timestamp: str) -> str:
        if not self.secret:
            return ""
        string_to_sign = f'{timestamp}\n{self.secret}'
        hmac_code = hmac.new(string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
        return base64.b64encode(hmac_code).decode('utf-8')

    async def check_and_notify(self, uid: str, nickname: str, live_status: int, room_id: str):
        if not self.webhook_url or uid not in self.target_uids:
            return

        redis_client = get_redis()
        state_key = f"feishu:state:{uid}"
        lock_key = f"feishu:lock:{uid}"  # 新增：防抖锁 Key
        lock_ttl = 60  # 冷却时间：60秒（覆盖你提到的 26 秒横跳窗口）

        # 1. 新增：检查是否在防抖冷却期内
        try:
            if await redis_client.exists(lock_key):
                return  # 处于冷却期，忽略一切状态波动
        except Exception as e:
            logger.error(f"⚠️ 读取防抖锁失败: {e}")

        # 2. 从 Redis 读取上次状态
        try:
            cached_val = await redis_client.get(state_key)
            last_status = int(cached_val) if cached_val is not None else 0
        except Exception as e:
            logger.error(f"⚠️ 读取飞书状态缓存失败: {e}")
            last_status = 0

        # 3. 拦截重复通知
        if live_status == last_status:
            return

        # 4. 下播逻辑：发静默通知并清理 Redis 状态
        if live_status == 0:
            if last_status != 0:
                end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                if last_status == 1:
                    msg = f"🔕 {nickname} 直播结束 ({end_time_str})"
                elif last_status == 2:
                    msg = f"🔕 {nickname} 退出连麦 ({end_time_str})"
                else:
                    msg = f"🔕 {nickname} 直播已结束 ({end_time_str})"

                await self._send_simple_text(msg)

                try:
                    await redis_client.delete(state_key)
                    # ✅ 新增：下播后也加上防抖锁，防止刚下播马上手滑又开播引发的连发
                    await redis_client.setex(lock_key, lock_ttl, "1")
                    logger.info(f"🔕 [飞书] {nickname} 已下播，开启 {lock_ttl} 秒防抖冷却")
                except Exception: pass
            return

        # 5. 状态改变：先发通知，再更新 Redis
        success = await self._send_interactive_card(uid, nickname, live_status, room_id)
        
        if success:
            try:
                await redis_client.setex(state_key, 86400, str(live_status))
                # ✅ 新增：开播推送成功后，设置防抖锁
                await redis_client.setex(lock_key, lock_ttl, "1")
                logger.info(f"🔒 [飞书] 已为 {nickname} 开启 {lock_ttl} 秒通知防抖锁")
            except Exception as e:
                logger.error(f"⚠️ 写入飞书状态缓存失败: {e}")

    async def _send_interactive_card(self, uid: str, nickname: str, live_status: int, room_id: str) -> bool:
        """发送卡片，返回布尔值表示是否成功"""
        timestamp = str(int(time.time()))
        sign = self._generate_signature(timestamp)
        start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        app_deep_link = f"snssdk1128://webcast_room?room_id={room_id}"

        # 动态设置标题
        if live_status == 1:
            card_title = f"🟢 {nickname} 开播中"
            theme_color = "green"
            status_text = "正在直播中"
        elif live_status == 2:
            card_title = f"{nickname} 连麦中"
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
                    # 在此处移除了原有的 button action (使用浏览器打开)
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