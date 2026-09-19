# fetcher.py
import gzip
import logging
import asyncio
import aiohttp
import urllib.parse
import orjson as json
import random
from datetime import datetime
from protobuf import douyin_pb2  # 官方库
import os
from src.utils.fetcher_utils import (
    generateSignature, 
    generateMsToken, 
    get_safe_url, 
    get_ac_signature, 
    get_js_context,
    get_global_ttwid
)

from src.core.message_handler import MessageHandler

logger = logging.getLogger("fetcher")

class AsyncDouyinLiveWebFetcher:
    
    def __init__(self, live_id, db, gift_processor, start_follower_count=0, abogus_file='js/a_bogus.js', initial_state=None, session=None, assigned_cookie=None):

        self.live_id = live_id
        self.start_follower_count = start_follower_count
        self.abogus_file = abogus_file
        self.db = db
        self.gift_processor = gift_processor
        self.handler = None 
        self.initial_state = initial_state       
        
        self.session = None 
        self.ws = None      
        
        self.__ttwid = None
        self.current_room_id = None
        
        self.live_url = "https://live.douyin.com/"
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        self.headers = {'User-Agent': self.user_agent}
        
        self.running = False
        self.session = session 
        self._own_session = False 
        self.assigned_cookie = assigned_cookie
        if self.session is None:
            connector = aiohttp.TCPConnector(limit=100, use_dns_cache=True, ttl_dns_cache=300)
            self.session = aiohttp.ClientSession(headers=self.headers, connector=connector)
            self._own_session = True

    async def get_ttwid(self, force_refresh: bool = False):
        """直接复用全局单例/Redis中的 ttwid"""
        if self.__ttwid and not force_refresh:
            return self.__ttwid
        
        self.__ttwid = await get_global_ttwid(force_refresh=force_refresh)
        return self.__ttwid

    def get_ac_nonce(self):
        chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return ''.join(random.choice(chars) for _ in range(21))
    
    async def get_a_bogus(self, url_params: dict):
        url = urllib.parse.urlencode(url_params)
        
        def _calc():
            ctx = get_js_context(self.abogus_file)
            return ctx.call("get_ab", url, self.user_agent)
            
        return await asyncio.to_thread(_calc)

    async def start(self):
        logger.info(f"🚀 启动抓取: {self.live_id}")
        self.running = True
        
        try:
            if not self.initial_state or not self.initial_state.get('room_id'):
                logger.error(f"❌ [{self.live_id}] 缺少 initial_state 或 room_id，无法启动录制")
                return

            self.current_room_id = str(self.initial_state['room_id'])

            room_info = {
                'web_rid': self.live_id,
                'room_id': self.current_room_id,
                'title': self.initial_state.get('title') or f"{self.initial_state.get('nickname', '主播')}正在直播",
                'user_id': str(self.initial_state.get('uid', '')),
                'sec_uid': self.initial_state.get('sec_uid', ''),
                'nickname': self.initial_state.get('nickname', '未知用户'),
                'cover_url': self.initial_state.get('cover_url') or self.initial_state.get('avatar_url', ''),
                'avatar_url': self.initial_state.get('avatar_url', ''),
                'user_count': self.initial_state.get('user_count', 0),
                'like_count': 0,
                'room_status': 2, 
                'live_status': 1,
                'start_follower_count': self.start_follower_count
            }

            logger.info(f"🟢 [LiveMan] 直播中 | 🏠 {room_info['nickname']}: {room_info['title']}")
            
            if self.db:
                await self.db.save_room_info(room_info)

            self.handler = MessageHandler(
                live_id=self.live_id,
                room_id=self.current_room_id,
                db=self.db,
                gift_processor=self.gift_processor,
                anchor_id=str(self.initial_state.get('uid', ''))
            )

           # 首次连接，并获取是否曾经成功连上过的状态
            connected_once = await self._connectWebSocket()
            
            # 【核心逻辑】：如果曾经成功连接过，但循环退出了，且 running 仍为 True
            # 说明不是由 MessageHandler 判定正常下播，而是遇到了异常网络闪断
            if connected_once and self.running:
                logger.warning(f"⚡ [{self.live_id}] WebSocket 意外断开，触发一次瞬间重试...")
                await asyncio.sleep(0.5)
                await self._connectWebSocket()
            
        except Exception as e:
            logger.error(f"❌ 录制任务异常退出: {e}")
        finally:
            await self.stop()

    async def stop(self):
        self.running = False
        if self.ws: await self.ws.close()
        
        if self._own_session and self.session:
            await self.session.close()

    async def _sendHeartbeat(self, ws):
        while self.running and not ws.closed:
            try:
                heartbeat = douyin_pb2.PushFrame()
                heartbeat.payloadType = 'hb'
                await ws.send_bytes(heartbeat.SerializeToString()) 
                await asyncio.sleep(20)
            except asyncio.CancelledError:  
                break
            except Exception as e: 
                logger.debug(f"⚠️ [LiveMan] 心跳异常: {e}")
                break

    async def _handle_binary_message(self, data, ws):
        try:
            package = douyin_pb2.PushFrame()
            package.ParseFromString(data)
            
            response = douyin_pb2.Response()
            response.ParseFromString(gzip.decompress(package.payload))
            
            if response.needAck:  
                ack = douyin_pb2.PushFrame()
                ack.logId = package.logId  
                ack.payloadType = 'ack'    
                ack.payload = response.internalExt.encode('utf-8')  
                await ws.send_bytes(ack.SerializeToString())
            
            for msg in response.messagesList:  
                if self.handler:
                    is_ended = await self.handler.handle(msg.method, msg.payload)
                    if is_ended:
                        self.running = False  # 正常下播标志位，确保不会触发瞬间重试
                        await ws.close()
                        break
        except Exception: 
            pass

    async def _connectWebSocket(self) -> bool:
        """
        连接 WebSocket。
        使用直播伴侣(webcast_mate)参数，提高连接稳定性。
        返回 bool：如果在任何一种策略下成功进入了消息接收流，返回 True；全部策略彻底失败返回 False。
        """
        # 伴侣端设备特征参数
        device_id = "124697379617291"
        iid = "2169793716959872"
        # 使用 datetime 获取当前毫秒级时间戳
        timestamp = str(int(datetime.now().timestamp() * 1000))
        
        # 伴侣端专用的 User-Agent
        mate_user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) webcast_mate/12.9.3 Chrome/136.0.7103.59 "
            "Electron/36.4.0-rs.18.release.webcast.81 TTElectron/36.4.0-rs.18.release.webcast.81 Safari/537.36"
        )
    
        # 构建伴侣端 ws 链接 (已移除所有 blackMsgList)
        wss = (
            "wss://webcast100-ws-web-lq.amemv.com/webcast/im/push/v2/?"
            "live_id=1"
            "&aid=2079"
            f"&room_id={self.current_room_id}"
            "&device_platform=windows"
            "&device_type=windows"
            f"&cursor=t-{timestamp}_r-1_d-1_u-1_h-1"
            f"&internal_ext=internal_src%3Adim%7Cwss_push_room_id%3A{self.current_room_id}%7Cwss_push_did%3A{device_id}%7Cfirst_req_ms%3A{timestamp}%7Cfetch_time%3A{timestamp}%7Cseq%3A1%7Cwss_info%3A0-{timestamp}-0-0"
            "&support_wrds=1"
            "&resp_content_type=protobuf"
            "&version_code=180800"
            "&webcast_sdk_version=1.0.15"
            "&identity=audience"
            "&last_rtt=558"
            f"&device_id={device_id}"
            "&ac=wifi"
            f"&iid={iid}"
            "&whitelist[0]=WebcastLinkMessage"
            "&whitelist[1]=WebcastLinkMicMethod"
            "&workerBlackMsgMode=2"
            "&perfDecodeThresholdMs=50"
            "&perfSetMsgRttThresholdMs=300"
            "&update_version_code=1.0.15"
            "&compress=gzip"
        )
    
        signature = generateSignature(wss)
        if signature:
            wss += f"&signature={signature}"
        
        strategies = []
        if self.assigned_cookie:
            mode_name = "Assigned Cookie"
            if self.assigned_cookie == os.getenv("PRIVATE_RESERVE_COOKIE"):
                mode_name = "Private Reserve Cookie"
                
            strategies.append({
                "name": mode_name,
                "headers": {
                    "Cookie": self.assigned_cookie,
                    "User-Agent": mate_user_agent,
                    "Origin": "file://"
                },
                "max_retries": 3  
            })
        else:
            logger.warning(f"⚠️ [{self.live_id}] 未获得真实 Cookie 额度，触发无登录态降级")

        # 降级兜底项
        strategies.append({
            "name": "Fallback(TTWID)",
            "is_fallback": True,
            "max_retries": 1  
        })

        try:
            for strategy in strategies:
                mode_name = strategy['name']
                max_retries = strategy.get('max_retries', 1)

                if strategy.get('is_fallback'):
                    ttwid = await self.get_ttwid()
                    headers = {
                        "Cookie": f"ttwid={ttwid}",
                        "User-Agent": mate_user_agent,
                        "Origin": "file://"
                    }
                else:
                    headers = strategy['headers']

                for attempt in range(max_retries):
                    try:
                        # 已移除 ssl=False，恢复默认的安全策略
                        async with self.session.ws_connect(wss, headers=headers, timeout=15) as ws:
                            self.ws = ws
                            retry_msg = f" (第{attempt+1}次尝试)" if attempt > 0 else ""
                            logger.info(f"✅ WebSocket 连接成功 [{mode_name}]{retry_msg}")
                            
                            asyncio.create_task(self._update_real_title_once())
                            hb_task = asyncio.create_task(self._sendHeartbeat(ws))
                            
                            try:
                                async for msg in ws:
                                    if msg.type == aiohttp.WSMsgType.BINARY:
                                        await self._handle_binary_message(msg.data, ws)
                                    elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                        logger.warning(f"⚠️ WebSocket 连接被动关闭 [{mode_name}]")
                                        break
                            except Exception as e:
                                logger.error(f"❌ 消息读取循环异常 [{mode_name}]: {e}")
                            
                            if hb_task:
                                hb_task.cancel()
                                try:
                                    await hb_task
                                except:
                                    pass
                            
                            return True 

                    except Exception as e:
                        if attempt < max_retries - 1:
                            logger.warning(f"⚠️ 策略 [{mode_name}] 连接失败，准备第 {attempt + 2} 次重试... 原因: {e}")
                            await asyncio.sleep(1) 
                        else:
                            logger.warning(f"❌ 策略 [{mode_name}] {max_retries} 次连接均失败，降级下一个策略... 最终原因: {e}")
                        continue 

            logger.error(f"❌ 所有 WebSocket 连接策略均失败: {self.live_id}")
            return False
            
        finally:
            if self.ws and not self.ws.closed:
                await self.ws.close()
    async def _update_real_title_once(self):
        try:
            url = "https://live.douyin.com/webcast/room/info_by_scene/"
            params = {
                'aid': '6383', 'app_name': 'douyin_web', 'live_id': '1',
                'device_platform': 'web', 'scene': 'aweme_video_feed_pc',
                'os_name': 'Windows', 'os_version': 'web', 'room_id': self.current_room_id
            }
            async with self.session.get(url, params=params, timeout=10) as resp:
                text = await resp.text()
                json_data = json.loads(text)
                title = json_data.get('data', {}).get('title')
                
                if title and self.db and hasattr(self.db, 'pool') and self.db.pool:
                    sql = "UPDATE rooms SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE room_id = $2;"
                    async with self.db.pool.acquire() as conn:
                        await conn.execute(sql, title, self.current_room_id)
                    nickname = self.initial_state.get('nickname', '未知用户')
                    logger.info(f"✅ [标题更新] {nickname}: {title}")
        except Exception as e:
            logger.error(f"❌ 获取真实标题异常: {e}")