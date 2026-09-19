# monitor.py
import orjson as json
import random
import re
import os
import logging
import asyncio
import aiohttp
from typing import List, Dict, Optional
from datetime import datetime
from src.db.db import AsyncPostgresHandler
from src.utils.feishu_notifier import FeishuNotifier
from src.db.redis_client import get_redis
logger = logging.getLogger("Monitor")

def get_ms_token(length=107):  
    chars = 'ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789='  
    return ''.join(random.choices(chars, k=length))

class AsyncDouyinLiveMonitor:
    def __init__(self, cookies: List[str], db: AsyncPostgresHandler, session=None):
        if not cookies:
            raise ValueError("必须提供至少一个Cookie")
        self.cookies = cookies
        self.current_cookie_index = 0
        self.base_url = "https://www.douyin.com"
        self.current_cookie = None
        self.current_sec_user_id = None
        self.db = db
        self.feishu = FeishuNotifier()
        self.headers = {
            'authority': 'www.douyin.com',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'cache-control': 'no-cache',
            'referer': 'https://www.douyin.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        self._load_current_cookie()
        self.session = session
        # [已删除] self._scene_cache 内存缓存，全面拥抱 Redis

    async def init_session(self):
        """引入 TCPConnector 开启 DNS 缓存"""
        if not self.session:
            connector = aiohttp.TCPConnector(
                limit=100, 
                use_dns_cache=True, 
                ttl_dns_cache=300
            )
            timeout = aiohttp.ClientTimeout(total=10)
            self.session = aiohttp.ClientSession(
                timeout=timeout, 
                connector=connector
            )

    async def close(self):
        pass

    async def _reload_cookies(self):
        """从数据库热加载 Cookie"""
        if not self.db: return
        try:
            new_cookies = await self.db.get_all_cookies()
            if new_cookies:
                self.cookies = new_cookies
                if self.current_cookie_index >= len(self.cookies):
                    self.current_cookie_index = 0
                logger.info(f"🔄 [Monitor] Cookie 池已热重载，当前可用: {len(self.cookies)} 个")
            else:
                logger.warning("⚠️ [Monitor] 数据库中没有可用 Cookie！")
        except Exception as e:
            logger.error(f"❌ 热加载 Cookie 失败: {e}")

    def _load_current_cookie(self):
        self.current_cookie = self.cookies[self.current_cookie_index]
        self.headers['cookie'] = self.current_cookie
        self.current_sec_user_id = self._extract_sec_user_id(self.current_cookie)
        short_cookie = self.current_cookie[:20] + "..."
        logger.info(f"🔄 [Monitor] 已加载第 {self.current_cookie_index + 1} 个Cookie: {short_cookie}")

    def rotate_cookie(self) -> bool:
        logger.warning("⚠️ [Monitor] 当前 Cookie 可能失效，正在切换...")
        next_index = (self.current_cookie_index + 1) % len(self.cookies)
        self.current_cookie_index = next_index
        self._load_current_cookie()
        return True

    def _extract_sec_user_id(self, cookie: str) -> Optional[str]:
        try:
            match = re.search(r'MS4wLjABAAAA[^%;]*', cookie)
            if match: return match.group(0)
        except Exception: pass
        return None

    def _generate_params(self, offset: int = 0, count: int = 20) -> Dict:
        return {
            'device_platform': 'ipad',
            'aid': '1128',
            'channel': 'App Store',
            'sec_user_id': self.current_sec_user_id or '',
            'offset': str(offset),
            'count': str(count),
            'min_time': '0',
            'max_time': '0',
            'source_type': '4',
            'gps_access': '0',
            'address_book_access': '0',
            'is_top': '1',
            'pc_client_type': '1',
            'pc_libra_divert': 'Windows',
            'support_h265': '1',
            'support_dash': '1',
            'webcast_sdk_version': '170400',
            'webcast_version_code': '170400',
            'version_code': '39.2.0',
            'cookie_enabled': 'true',
            'screen_width': '1920',
            'screen_height': '1080',
            'browser_language': 'zh-CN',
            'browser_platform': 'Win32',
            'browser_name': 'Chrome',
            'browser_version': '124.0.0.0',
            'browser_online': 'true',
            'engine_name': 'Blink',
            'engine_version': '124.0.0.0',
            'os_name': 'Windows',
            'os_version': '10',
            'cpu_core_num': '16',
            'device_memory': '8',
            'platform': 'PC',
            'downlink': '10',
            'effective_type': '4g',
            'round_trip_time': '0',
        }

    async def get_following_list(self, offset: int = 0, count: int = 20, retry: int = 0) -> Optional[Dict]:
        if retry > len(self.cookies) + 2:
            logger.error("❌ [Monitor] 所有 Cookie 均失效且重载无效，暂停 60秒...")
            await asyncio.sleep(60)
            await self._reload_cookies()
            return None

        if not self.session: await self.init_session()

        try:
            url = f"{self.base_url}/aweme/v1/web/user/following/list/"
            params = self._generate_params(offset, count)
            
            async with self.session.get(url, params=params, headers=self.headers) as response:
                if response.status in [401, 403]:
                    logger.warning(f"🚫 [失效] Cookie 已过期 (Status: {response.status}): {self.current_cookie[:20]}...")
                    if self.db:
                        await self.db.delete_cookie(self.current_cookie)
                    if self.current_cookie in self.cookies:
                        self.cookies.remove(self.current_cookie)

                    await self._reload_cookies()
                    if not self.cookies:
                        logger.error("❌ Cookie 池已空！请去后台添加！")
                        return None

                    self._load_current_cookie() 
                    return await self.get_following_list(offset, count, retry + 1)
                
                try:
                    text_data = await response.text()
                    json_data = json.loads(text_data)
                    
                    if 'status_code' in json_data and json_data['status_code'] != 0:
                        logger.warning(f"⚠️ API 业务错误: {json_data.get('status_msg')}")
                        self.rotate_cookie()
                        return await self.get_following_list(offset, count, retry + 1)
                    
                    return json_data
                except json.JSONDecodeError:
                    logger.warning("⚠️ JSON 解析失败")
                    self.rotate_cookie()
                    return await self.get_following_list(offset, count, retry + 1)
                    
        except Exception as e:
            logger.error(f"❌ [Monitor] 请求异常: {e}")
            self.rotate_cookie()
            return await self.get_following_list(offset, count, retry + 1)

    async def fetch_room_info_by_scene(self, room_id: str) -> Dict | None:
        """
        请求 scene_info 获取移动端缺失的 web_rid 
        """
        if not room_id or not self.session:
            return None
        try:
            url = "https://live.douyin.com/webcast/room/info_by_scene/"
            params = {
                'aid': '6383',
                'app_name': 'douyin_web',
                'live_id': '1',
                'device_platform': 'web',
                'scene': 'aweme_video_feed_pc',
                'os_name': 'Windows',
                'os_version': 'web',
                'room_id': str(room_id)
            }
            async with self.session.get(url, params=params, timeout=10) as resp:
                text = await resp.text()
                json_data = json.loads(text)
                data = json_data.get('data')
                if not data: 
                    return None
                
                owner = data.get('owner', {})
                web_rid = owner.get('web_rid')
                title = data.get('title', '')
                
                return {
                    'web_rid': str(web_rid) if web_rid else None,
                    'title': title
                }
        except Exception as e:
            logger.error(f"❌ [Monitor] 获取 scene_info 异常 (room_id: {room_id}): {e}")
            return None

    async def _async_fetch_scene_info(self, room_id: str, uid: str, nickname: str):
        """【新增】后台无阻塞获取真实标题与 web_rid，更新 Redis 与数据库"""
        scene_info = await self.fetch_room_info_by_scene(room_id)
        if not scene_info:
            return

        target_web_rid = scene_info.get('web_rid')
        real_title = scene_info.get('title')

        # 1. 写入 Redis 长期映射
        if target_web_rid:
            try:
                
                redis_client = get_redis()
                if redis_client:
                    await redis_client.setex(f"douyin:uid_to_web_rid:{uid}", 7776000, target_web_rid)
            except Exception as e:
                pass

        # 2. 静默更新数据库中的真实标题 (覆盖掉刚启动时的占位符)
        if real_title and self.db and hasattr(self.db, 'pool') and self.db.pool:
            try:
                sql = "UPDATE rooms SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE room_id = $2;"
                async with self.db.pool.acquire() as conn:
                    await conn.execute(sql, real_title, room_id)
                logger.info(f"✅ [标题更新] {nickname}: {real_title}")
            except Exception as e:
                logger.error(f"❌ 更新标题异常: {e}")


    async def stream_all_live_users(self):
        """
        【重构】扫描关注列表，改为异步生成器，实现查到即返回（不等翻页）
        """
        offset = 0
        await self.init_session()
        redis_client = get_redis()
        
        while True:
            data = await self.get_following_list(offset, 20)
            if not data or 'followings' not in data:
                break
            
            for user in data['followings']:
                uid = str(user.get('uid', ''))
                nickname = user.get('nickname', '未知')
                raw_status = user.get('live_status', 0)
                
                target_room_id = ""
                target_web_rid = ""

                if raw_status in [1, 2]:
                    raw_room_data = user.get('room_data')
                    if raw_room_data:
                        try:
                            room_data_dict = json.loads(raw_room_data)
                            target_room_id = str(room_data_dict.get('id_str') or room_data_dict.get('room_id_str', ''))
                            target_web_rid = room_data_dict.get('owner', {}).get('web_rid', '')
                        except Exception: pass
                    
                    if not target_room_id:
                        target_room_id = str(user.get('room_id_str', ''))
                    if not target_web_rid:
                        target_web_rid = user.get('web_rid', '')

                    # =========================================================
                    # 【核心】Redis 极速缓存查询与无阻塞后台补齐
                    # =========================================================
                                        # =========================================================
                    # 【核心】Redis 极速缓存查询与无阻塞后台补全
                    # =========================================================
                    if not target_web_rid and target_room_id:
                        if redis_client:
                            redis_key = f"douyin:uid_to_web_rid:{uid}"
                            cached_web_rid = await redis_client.get(redis_key)
                            if cached_web_rid:
                                target_web_rid = cached_web_rid.decode('utf-8') if isinstance(cached_web_rid, bytes) else cached_web_rid

                        # 变更：只在真正拿不到 web_rid 时才去请求 API，切断心跳轮询中的标题更新
                        if not target_web_rid:
                            asyncio.create_task(self._async_fetch_scene_info(target_room_id, uid, nickname))
                        
                        if not target_web_rid:
                            # 只有在连 Redis 都没命中、彻底拿不到 web_rid 时，才跳过当前轮次
                            continue


                # 异步保存资料卡及飞书通知
                await self._save_author_card(user, override_web_rid=target_web_rid)

                if uid:
                    await self.feishu.check_and_notify(
                        uid=uid, nickname=nickname, live_status=raw_status,
                        room_id=target_room_id
                    )

                if self.db and target_room_id:
                    follower_count = user.get('follower_count', 0)
                    await self.db.update_room_realtime(str(target_room_id), raw_status, follower_count)

                # --- 发现即返回 (Yield) ---
                if raw_status == 1:  
                    live_info = self.extract_live_info(user)
                    if live_info:
                        if target_web_rid:
                            live_info['web_rid'] = target_web_rid

                        if live_info.get('web_rid'):
                            yield live_info
                        else:
                            logger.warning(f"⚠️ [Monitor] 放弃任务 (web_rid补齐中): {nickname}")
            
            has_more = data.get('has_more', False)
            if not has_more:
                break
            
            offset += 20
            await asyncio.sleep(0.5)

    async def _save_author_card(self, user_data: Dict, override_web_rid: Optional[str] = None):
        """异步保存主播资料卡"""
        if not self.db: return
        try:
            nickname = user_data.get('nickname')
            sec_uid = user_data.get('sec_uid')
            uid = user_data.get('uid')
            live_status = user_data.get('live_status', 0)            
            avatar_url = ""
            try:
                if user_data.get('avatar_thumb') and user_data['avatar_thumb'].get('url_list'):
                    avatar_url = user_data['avatar_thumb']['url_list'][0]
            except Exception: pass
                       
            web_rid = override_web_rid
            user_count = 0
            weight = 3
            raw_room_data = user_data.get('room_data') 
            current_room_id = "" # 初始化默认为空
            
            if live_status in [1, 2]:
                weight = live_status
                if raw_room_data:
                    try:
                        room_data_dict = json.loads(raw_room_data)
                        user_count = room_data_dict.get('user_count', 0)
                        if not web_rid:
                            web_rid = room_data_dict.get('owner', {}).get('web_rid')
                        # 尝试从 room_data_dict 提取 room_id
                        current_room_id = str(room_data_dict.get('id_str') or room_data_dict.get('room_id_str') or '')
                    except Exception: pass
                
                if not web_rid: 
                    web_rid = user_data.get('web_rid')
                # 尝试从外层 user_data 提取 room_id
                if not current_room_id:
                    current_room_id = str(user_data.get('room_id_str') or '')
                
                # 过滤掉默认未开播时的 "0"
                if current_room_id == "0":
                    current_room_id = ""
            else:
                web_rid = None
                user_count = 0
                current_room_id = "" # status 为 0 时强制设为空

            # 核心取值：优先 unique_id，为空则降级取 short_id
            unique_id = user_data.get('unique_id') or user_data.get('short_id') or ''

            author_doc = {
                'nickname': nickname,
                'sec_uid': sec_uid,
                'uid': uid,
                'unique_id': str(unique_id),
                'avatar': avatar_url,
                'live_status': live_status,
                'web_rid': web_rid,
                'user_count': user_count,
                'follower_count': user_data.get('follower_count', 0),
                'weight': weight,
                'current_room_id': current_room_id
            }

            if live_status == 1 and web_rid:
                author_doc['self_web_rid'] = web_rid

            await self.db.save_author_card(author_doc)
        except Exception as e:
            logger.error(f"⚠️ 保存资料卡异常: {e}")

    def extract_live_info(self, user_data: Dict) -> Optional[Dict]:
        """提取直播信息字典基础结构"""
        try:
            live_status = user_data.get('live_status')
            room_data_dict = {}
            web_rid = user_data.get('web_rid')
            
            raw_room_data = user_data.get('room_data')
            if raw_room_data:
                try:
                    room_data_dict = json.loads(raw_room_data)
                    if not web_rid:
                        web_rid = room_data_dict.get('owner', {}).get('web_rid')
                except: pass
            
            room_id = None
            if live_status == 1:
                room_id = user_data.get('room_id_str')          
            if not room_id and room_data_dict:
                room_id = room_data_dict.get('id_str')

            avatar_url = ""
            if user_data.get('avatar_thumb') and user_data['avatar_thumb'].get('url_list'):
                avatar_url = user_data['avatar_thumb']['url_list'][0]
            
            return {
                'nickname': user_data.get('nickname', '未知'),
                'uid': user_data.get('uid'),
                'sec_uid': user_data.get('sec_uid'),
                'live_status': live_status,
                'room_id': room_id, 
                'web_rid': web_rid, 
                'title': f"{user_data.get('nickname', '主播')}正在直播",
                'follower_count': user_data.get('follower_count', 0),
                'avatar_url': avatar_url,
                'cover_url': avatar_url,
            }
        except Exception as e:
            logger.error(f"❌ 解析直播信息异常: {e}")
            return None

    async def delete_cookie(self, cookie_str: str):
        if not cookie_str or not self.db: 
            return
        await self.db.delete_cookie(cookie_str)