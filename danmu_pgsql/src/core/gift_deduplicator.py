# gift_deduplicator.py
import asyncio
import time
import logging
from collections import OrderedDict
from src.db.redis_client import get_redis  # 使用全局 Redis 客户端
from src.utils.mystery_resolver import MysteryManResolver  # 引入神秘人解析器

logger = logging.getLogger("GiftDeduplicator")

class AsyncGiftDeduplicator:
    def __init__(self, db_handler, max_buffer_size=10000):
        """
        礼物去重处理器
        :param db_handler: 数据库处理器
        :param max_buffer_size: 缓冲区最大容量
        """
        self.db = db_handler
        self.max_buffer_size = max_buffer_size  # 保存上限配置
        self.buffer = OrderedDict()
        self.local_history = OrderedDict()
        self.LOCAL_HISTORY_SIZE = 5000 
        
        # 钻石礼物价格修正配置
        self.DIAMOND_OVERRIDES = { 
            "钻石火箭": 12001, "钻石嘉年华": 36000, "钻石兔兔": 360, "钻石飞艇": 23333, "甄爱嘉年华": 35000, "猩光璀璨": 36000, "520嘉年华": 33000,"推荐搭配": 1868,
            "钻石秘境": 16000, "钻石游轮": 7200, "钻石飞机": 3600, "钻石跑车": 1500, "钻石热气球": 620, "钻石邮轮": 7200, "青绿典藏版嘉年华": 35000, "无界超跑": 36000, "烈焰跑车": 6000, "至尊超跑": 12000, "御风飞机": 9000, "凌霄战机": 18000, "星际战舰": 36000, "闪烁星河": 99, "点点星光": 9, "甄嬛典藏嘉年华": 35000,
            "落日追光":6000,"繁花飞驰":12000,"幻翼超跑":36000
        }
        self.FUSION_COMPONENTS = {
            "邮轮": 6000, "飞机": 3000, "跑车": 1200, "烟花": 688,
            "心心": 520, "气球": 520, "玫瑰": 366, "兔兔": 299, "礼花": 199
        }
        self.lock = asyncio.Lock()
        self.running = False
        self.cleaner_task = None

        # 初始化持有的神秘人解析组件
        self.mystery_resolver = MysteryManResolver(self.db)
        # False (默认): 极速放行，只增加房间粉丝票/钻石计数，不落表明细
        # True: 极速放行，既增加房间计数，也作为普通记录写入明细表
        self.SAVE_LIGHT_STICK_DETAILS = True       
    def start(self):
        self.running = True
        self.cleaner_task = asyncio.create_task(self._cleanup_loop())
        # 启动下游神秘人解析队列
        self.mystery_resolver.start()
        logger.info(f"✅ [Async] 礼物处理器启动 (BufferSize: {self.max_buffer_size})")

    def _get_unique_key(self, data):
        uid = str(data.get('user_id', 'unknown'))
        gid = data.get('gift_id', 'unknown')
        group_id = data.get('group_id', '0')
        to_uid = str(data.get('to_user_id', 'unknown'))
        
        if uid == '111111' or data.get('is_mystery'):
            webcast_uid = data.get('webcast_uid', '')
            identity = f"mystery_{webcast_uid}" if webcast_uid else f"name_{data.get('user_name', 'mystery_man')}"
        else:
            identity = uid
    
        # 将接收者的 uid 加入哈希指纹
        return f"{identity}_{to_uid}_{gid}_{group_id}"

    async def _is_duplicate(self, trace_id, combo, repeat_end, user_id, gift_id):
        uid = str(user_id)
        gid = str(gift_id)
        fingerprint = f"{trace_id}_{combo}_{repeat_end}_{uid}_{gid}"
        
        # 1. 内存级绝对拦截 (L1 Cache)
        if fingerprint in self.local_history:
            return True
            
        # 乐观预占位
        self.local_history[fingerprint] = True
        if len(self.local_history) > self.LOCAL_HISTORY_SIZE:
            self.local_history.popitem(last=False)
            
        # 2. Redis 跨进程去重 (L2 Cache)
        redis_key = f"dedup:gift:{fingerprint}"
        try:
            redis_client = get_redis()
            is_new = await redis_client.set(redis_key, 1, nx=True, ex=600)
            if not is_new:
                return True
            return False
        except Exception as e:
            self.local_history.pop(fingerprint, None)
            logger.error(f"⚠️ Redis 去重判定异常，降级放行: {e}")
            return False

    async def process_gift(self, gift_data):
        trace_id = gift_data.get('trace_id', '')
        repeat_end = gift_data.get('repeat_end', 0)
        combo = gift_data.get('combo_count', 1)
        gift_name = gift_data.get('gift_name', '')
        gift_id = str(gift_data.get('gift_id', ''))
        user_id = gift_data.get('user_id', '')
        diamond_count = gift_data.get('diamond_count', 0)
        group_count = gift_data.get('group_count', 1)

        # 1. 礼物价格修正逻辑 (前置处理，确保灯牌变种能拿到准确的钻数)
        if gift_name in self.DIAMOND_OVERRIDES:
            corrected_price = self.DIAMOND_OVERRIDES[gift_name]
            diamond_count = corrected_price
            gift_data['diamond_count'] = corrected_price
        else:
            # 融合礼物动态计价逻辑
            name_len = len(gift_name)
            if name_len >= 4 and name_len % 2 == 0:
                is_fusion = True
                calc_price = 0
                
                # 每2个字符切片一次，匹配组件库
                for i in range(0, name_len, 2):
                    chunk = gift_name[i:i+2]
                    if chunk in self.FUSION_COMPONENTS:
                        calc_price += self.FUSION_COMPONENTS[chunk]
                    else:
                        is_fusion = False  
                        break
                
                # 如果所有切片都匹配成功，则更新价格
                if is_fusion:
                    diamond_count = calc_price
                    gift_data['diamond_count'] = calc_price

        # 2. 粉丝灯牌单独极速路由 (覆盖常态与 9钻/99钻 变种)
        if gift_id == "685" or gift_name in ["粉丝团灯牌", "点点星光", "闪烁星河"]:
            if self.db:
                # 依据开关决定底层是否将其写入 live_gifts 明细表 (需在 __init__ 中定义 self.SAVE_LIGHT_STICK_DETAILS)
                gift_data['_is_light_stick'] = not getattr(self, 'SAVE_LIGHT_STICK_DETAILS', False)
                await self.db.insert_gift(gift_data)
            return

        # 3. 正常礼物去重拦截 (如果 trace_id 为空，无法去重，只能放行)
        if trace_id and await self._is_duplicate(trace_id, combo, repeat_end, user_id, gift_id):
            return 

        key = self._get_unique_key(gift_data)
        current_time = time.time()
        evicted_item_to_flush = None

        async with self.lock:
            if key in self.buffer:
                cached_item = self.buffer[key]
                if int(combo) > cached_item['max_combo']:
                    cached_item['max_combo'] = int(combo)
                    cached_item['combo_count'] = int(combo)
                if group_count > cached_item.get('group_count', 1):
                    cached_item['group_count'] = group_count
                if gift_data.get('cz_club_level', 0) > cached_item.get('cz_club_level', 0):
                    cached_item['cz_club_level'] = gift_data['cz_club_level']
                cached_item['last_update_time'] = current_time
                self.buffer.move_to_end(key)

                if repeat_end == 1:
                    cached_item['repeat_end'] = 1
                    cached_item['_force_flush'] = True 
            else:
                # 缓冲区溢出保护 (FIFO 淘汰)
                if len(self.buffer) >= self.max_buffer_size:
                    _, evicted_item_to_flush = self.buffer.popitem(last=False)

                gift_data['last_update_time'] = current_time
                gift_data['max_combo'] = int(combo)
                gift_data['combo_count'] = int(combo)
                gift_data['group_count'] = group_count
                gift_data['diamond_count'] = diamond_count
                self.buffer[key] = gift_data

        if evicted_item_to_flush:
            await self._flush_single_data_direct(evicted_item_to_flush)               

    async def _flush_item(self, key):
        data_to_write = None
        async with self.lock:
            if key in self.buffer:
                data_to_write = self.buffer.pop(key)

        if data_to_write and self.db:
            for field in ['last_update_time', 'max_combo', '_force_flush']:
                data_to_write.pop(field, None)
            
            unit_price = data_to_write.get('diamond_count', 0)
            group_count = data_to_write.get('group_count', 1)
            combo_count = data_to_write.get('combo_count', 1)
            
            data_to_write['total_diamond_count'] = unit_price * group_count * combo_count

            if combo_count >= 0:
                uid = str(data_to_write.get('user_id', ''))
                is_mystery = data_to_write.get('is_mystery', False)
                
                # 路由判断：如果是脱敏的神秘人，送到慢速解析队列处理；否则直入数据库
                if uid == '111111' or is_mystery:
                    await self.mystery_resolver.add_task(data_to_write)
                else:
                    await self.db.insert_gift(data_to_write)

    async def _flush_single_data_direct(self, data_to_write):
        if not self.db or not data_to_write: return
        try:
            for field in ['last_update_time', 'max_combo', '_force_flush']:
                data_to_write.pop(field, None)
            
            unit_price = data_to_write.get('diamond_count', 0)
            group_count = data_to_write.get('group_count', 1)
            combo_count = data_to_write.get('combo_count', 1)
            
            data_to_write['total_diamond_count'] = unit_price * group_count * combo_count
            
            if combo_count > 0:
                uid = str(data_to_write.get('user_id', ''))
                is_mystery = data_to_write.get('is_mystery', False)
                
                if (uid == '111111' or is_mystery) and is_mystery:
                    await self.mystery_resolver.add_task(data_to_write)
                else:
                    await self.db.insert_gift(data_to_write)
        except Exception as e:
            logger.error(f"❌ 强制写入失败: {e}")

    async def _cleanup_loop(self):
        NON_COMBO_GIFT_IDS = {"6937", "3242"}
        while self.running:
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            
            current_time = time.time()
            keys_to_flush = []

            async with self.lock:
                for key, item in self.buffer.items():
                    last_update = item.get('last_update_time', 0)
                    is_forced = item.get('_force_flush', False)
                    diamond_count = item.get('diamond_count', 0)
                    gift_id = str(item.get('gift_id', ''))

                    if gift_id in NON_COMBO_GIFT_IDS:
                        timeout_limit = 10  
                    elif diamond_count < 9:
                        timeout_limit = 100
                    elif diamond_count < 601:
                        timeout_limit = 20
                    else:
                        timeout_limit = 12

                    if is_forced or (current_time - last_update > timeout_limit):
                        keys_to_flush.append(key)
            
            for key in keys_to_flush:
                await self._flush_item(key)

    async def stop(self):
        self.running = False  
        
        if self.cleaner_task:
            try:
                await asyncio.wait_for(self.cleaner_task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                logger.warning("⚠️ [Async] 礼物清理任务超时退出")
                pass
        
        # 1. 优先将 deduplicator 内存 buffer 里剩余的大礼物全部冲刷完
        async with self.lock:
            keys = list(self.buffer.keys())
            
        if keys:
            logger.info(f"🛑 [Async] 正在保存剩余 {len(keys)} 组大礼物...")
            if self.db:
                await asyncio.gather(*[self._flush_item(key) for key in keys])

        # 2. 上游全盘冲刷完成后，最后触发神秘人解析器的安全关闭 (包含 Queue.join() 排空)
        await self.mystery_resolver.stop()
        
        logger.info("👋 [Async] 礼物处理器已完全停止")