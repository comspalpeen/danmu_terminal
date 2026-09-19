import asyncio
import re
import orjson
import logging
from curl_cffi.requests import AsyncSession
from src.utils.fetcher_utils import get_global_ttwid
from src.db.redis_client import get_redis
logger = logging.getLogger("MysteryResolver")

class MysteryManResolver:
    def __init__(self, db_handler):
        self.db = db_handler
        self.queue = asyncio.Queue()
        self.running = False
        self.worker_task = None
        # 固定写入你提供的 sec_anchor_id
        self.sec_anchor_id = "MS4wLjABAAAAUE-AawRjwST5lBI2BjT1_b6ntgHPLWVyCldVL9n58arDLHGRMfWpbVscv75JBKfN"

    def start(self):
        self.running = True
        self.worker_task = asyncio.create_task(self._resolve_loop())
        logger.info("🕵️ [MysteryResolver] 神秘人解析队列已启动，严格限频 5s/次")

    async def stop(self):
        self.running = False
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass

    async def add_task(self, data):
        # 根据传入的标记判断是 礼物 还是 弹幕
        msg_type = data.get('_msg_type', 'gift')
        user_name = data.get('user_name', '')
        webcast_uid = data.get('webcast_uid') or data.get('sec_uid')
        pay_grade = data.get('pay_grade', 0)
        room_id = data.get('room_id', '')
        user_id = str(data.get('user_id', ''))
        is_mystery = data.get('is_mystery', False)
        
        # 动态入库路由闭包
        async def _final_insert(d):
            if d.get('_msg_type') == 'chat':
                await self.db.insert_chat(d)
            else:
                await self.db.insert_gift(d)
    
        async def _check_and_restore(key):
            cached_res = await get_redis().get(key)
            if cached_res:
                cached_data = orjson.loads(cached_res)
                if cached_data.get('id') != '111111':
                    data.update({
                        'user_id': cached_data['id'],
                        'sec_uid': cached_data['sec_uid'],
                        'display_id': cached_data.get('display_id', ''),
                        '_is_restored_mystery': True 
                    })
                return True
            return False
    
        is_dou_user = False
        if is_mystery and user_id == '111111':
            is_dou_user = bool(re.match(r'^dou\d{7}$', user_name, re.IGNORECASE))
    
        # ================= 1. 针对 dou 匿名用户 =================
        if is_dou_user:
            if webcast_uid and webcast_uid != '111111':
                if await _check_and_restore(f"mystery:uid:{webcast_uid}"):
                    if pay_grade > 0:
                        combo_key = f"mystery:combo:{user_name}:{pay_grade}"
                        resolved_info = {
                            'id': data['user_id'], 
                            'sec_uid': data['sec_uid'], 
                            'display_id': data.get('display_id', '')
                        }
                        await get_redis().setex(combo_key, 86400 * 5, orjson.dumps(resolved_info))
                    await _final_insert(data)
                    return
                    
            combo_key = f"mystery:combo:{user_name}:{pay_grade}"
            if pay_grade > 0 and await _check_and_restore(combo_key):
                await _final_insert(data)
                return
    
            logger.warning(f"[MysteryResolver] 👻 幽灵写入 ({'弹幕' if msg_type == 'chat' else '礼物'}匿名未命中): name={user_name} | webcast_uid={webcast_uid} | room_id={room_id}")
            await _final_insert(data)
            return
    
        # ================= 2. 针对普通神秘人 =================
        if not webcast_uid or webcast_uid == '111111':
            logger.warning(f"[MysteryResolver] 👻 幽灵写入 ({'弹幕' if msg_type == 'chat' else '礼物'}异常数据): name={user_name} | webcast_uid={webcast_uid} | room_id={room_id}")
            await _final_insert(data)
            return
    
        # 查缓存映射，命中则直接入库
        if await _check_and_restore(f"mystery:uid:{webcast_uid}"):
            await _final_insert(data)
            return
    
        # ================= 3. 拦截弹幕，绝不联网 =================
        if msg_type == 'chat':
            logger.warning(f"[MysteryResolver] 👻 幽灵写入 (弹幕防串查断路): name={user_name} | webcast_uid={webcast_uid} | room_id={room_id}")
            await _final_insert(data)
            return
    
        # 只有礼物 且 未命中任何缓存的 普通神秘人，才允许进入慢速联网队列
        await self.queue.put(data)

    async def _resolve_loop(self):
        redis_client = get_redis()
        
        # 使用 chrome124 指纹绕过基础防护
        async with AsyncSession(impersonate="chrome124") as session:
            while self.running:
                try:
                    gift_data = await self.queue.get()
                    webcast_uid = gift_data.get('webcast_uid')
                    room_id = gift_data.get('room_id')
                    cache_key = f"mystery:uid:{webcast_uid}"
                    
                    # 出队后二次检查缓存 (防止排队期间被其他相同的 webcast_uid 查完)
                    cached_res = await redis_client.get(cache_key)
                    if cached_res:
                        cached_data = orjson.loads(cached_res)
                        if cached_data.get('id') != '111111':
                            gift_data.update({
                                'user_id': cached_data['id'],
                                'sec_uid': cached_data['sec_uid'],
                                'display_id': cached_data['display_id']
                            })
                        await self.db.insert_gift(gift_data)
                        self.queue.task_done()
                        continue

                    # 强校验 ttwid
                    ttwid = await get_global_ttwid()

                    if not ttwid:
                        logger.warning("[MysteryResolver] 获取全局 ttwid 失败，跳过本次解析")
                        await self.db.insert_gift(gift_data)
                        self.queue.task_done()
                        continue
                    url = "https://live.douyin.com/webcast/user/profile/"
                    params = {
                        "aid": "6383",
                        "app_name": "douyin_web",
                        "live_id": "1",
                        "device_platform": "web",
                        "sec_anchor_id": self.sec_anchor_id,
                        "current_room_id": str(room_id),
                        "target_webcast_uid": webcast_uid
                    }
                    cookies = {"ttwid": ttwid}
                    
                    try:
                        resp = await session.get(url, params=params, cookies=cookies, timeout=5)
                        data = resp.json()
                        base_info = data.get('data', {}).get('user_profile', {}).get('base_info', {})
                        
                        real_uid = str(base_info.get('id_str', ''))
                        
                        if real_uid and real_uid not in ('0', '111111'):
                            resolved_info = {
                                'id': real_uid,
                                'sec_uid': base_info.get('sec_uid', ''),
                                'display_id': base_info.get('display_id', '')
                            }
                            # 写入常规 6 小时短效缓存
                            await redis_client.setex(cache_key, 21600, orjson.dumps(resolved_info))
                            
                            gift_data.update({
                                'user_id': resolved_info['id'],
                                'sec_uid': resolved_info['sec_uid'],
                                'display_id': resolved_info['display_id'],
                                '_is_restored_mystery': True # 打上隔离标记
                            })
                            
                            # ✅ 新增：如果是 dou 匿名用户，同时建立长效的“昵称+消费等级”复合指纹 (5天)
                            user_name = gift_data.get('user_name', '')
                            pay_grade = gift_data.get('pay_grade', 0)
                            if re.match(r'^dou\d{7}$', user_name, re.IGNORECASE) and pay_grade > 0:
                                combo_key = f"mystery:combo:{user_name}:{pay_grade}"
                                await redis_client.setex(combo_key, 86400 * 5, orjson.dumps(resolved_info))
                                
                            logger.info(f"[MysteryResolver] 🎉 成功还原神秘人身份 -> UID: {real_uid}")
                        else:
                            # 🚨 幽灵写入日志：接口请求成功但查无此人
                            logger.warning(f"[MysteryResolver] 👻 幽灵写入 (查无此人): name={gift_data.get('user_name')} | webcast_uid={webcast_uid} | room_id={room_id}")
                            await redis_client.setex(cache_key, 1800, orjson.dumps({'id': '111111'}))
                            
                    except Exception as e:
                        # 🚨 幽灵写入日志：接口请求发生异常（如风控、超时）
                        logger.warning(f"[MysteryResolver] 👻 幽灵写入 (接口异常): name={gift_data.get('user_name')} | webcast_uid={webcast_uid} | room_id={room_id} | err={e}")
                        await redis_client.setex(cache_key, 1800, orjson.dumps({'id': '111111'}))

                    # 最终无论如何必须放行数据入库
                    await self.db.insert_gift(gift_data)
                    self.queue.task_done()
                    
                    # 严格遵循 5 秒一次的慢速请求
                    await asyncio.sleep(5)
                    
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"[MysteryResolver] 队列循环异常: {e}")
                    await asyncio.sleep(1)