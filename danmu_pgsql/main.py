# main.py
import asyncio
import os
import logging
import sys
from logging.handlers import RotatingFileHandler
import aiohttp
from src.core.gift_deduplicator import AsyncGiftDeduplicator
from src.core.monitor import AsyncDouyinLiveMonitor
from src.core.fetcher import AsyncDouyinLiveWebFetcher
from src.db.redis_client import init_redis, close_redis
from src.utils.daily_reporter import DailyReporter
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, time
from dotenv import load_dotenv
load_dotenv()
from src.core.slot_manager import CookieSlotManager

# --- 配置日志 ---
log_dir = "logs"
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

log_file_path = os.path.join(log_dir, "monitor.log")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - [%(name)s]: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler(
            filename=log_file_path, 
            mode='a', 
            maxBytes=10 * 1024 * 1024, 
            backupCount=5, 
            encoding='utf-8', 
            delay=False
        )
    ]
)
logger = logging.getLogger("Main")

# --- 全局任务字典 ---
# Key: web_rid, Value: asyncio.Task
recording_tasks = {}
slot_manager = CookieSlotManager()

async def settle_room(db, room_id, nickname):
    """封装结算逻辑"""
    if not room_id: return
    try:
        status = await db.get_room_live_status(room_id)
        if status == 4: return
        logger.info(f"🛑 [智能结算] 判定直播结束，正在结算: {nickname} ({room_id})")
        await db.set_room_ended(room_id)
    except Exception as e:
        logger.error(f"❌ 结算异常: {e}")

async def start_recorder_task(web_rid, nickname, start_follower_count, db, gift_processor, monitor_data=None, session=None):
    """包装器：管理 Cookie 的生命周期"""
    fetcher = None
    assigned_cookie = None
    try:
        # 从 monitor_data 中提取主播 uid，作为调度锁键
        anchor_id = str(monitor_data.get('uid', '')) if monitor_data else ""
        
        # ✅ 修改点：传入 anchor_id 代替原先的 web_rid
        assigned_cookie = slot_manager.acquire_cookie(anchor_id)
        
        logger.info(f"🚀 [任务启动] {nickname} ({web_rid})")
        
        fetcher = AsyncDouyinLiveWebFetcher(
            live_id=web_rid,
            db=db,
            gift_processor=gift_processor,
            start_follower_count=start_follower_count,
            initial_state=monitor_data,
            session=session,
            assigned_cookie=assigned_cookie
        )
        await fetcher.start()
        
    except asyncio.CancelledError:
        logger.info(f"🛑 [任务取消] {nickname}")
    except Exception as e:
        logger.error(f"💥 [任务异常] {nickname}: {e}")
    finally:
        if fetcher: await fetcher.stop()
        if assigned_cookie:
            slot_manager.release_cookie(assigned_cookie)
        logger.info(f"🏁 [任务结束] {nickname} (名额已回收)")

async def zombie_cleaner(db_handler):
    """延迟启动的看门狗 + 僵尸任务终结者"""
    logger.info("🐶 [看门狗] 正在待命，将在 5分钟 后开始首次清理...")
    await asyncio.sleep(300) # 给 LiveMan 重连的时间
    
    while True:
        try:
            # 1. 数据库层面标记清理，并获取被清理的 room_id 列表
            zombie_ids = await db_handler.clear_zombie_rooms(timeout_seconds=180) 
            
            # 2. 如果发现僵尸房间，立即查找对应的运行任务并切断 WebSocket
            if zombie_ids:
                zombie_set = set(str(rid) for rid in zombie_ids)
                logger.warning(f"🧟‍♂️ [看门狗] 数据库已标记 {len(zombie_ids)} 个僵尸，正在物理切断连接...")

                for web_rid, task_info in list(recording_tasks.items()):
                    current_room_id = str(task_info.get('room_id'))
                    
                    if current_room_id in zombie_set:
                        task = task_info['task']
                        nickname = task_info.get('nickname', '未知')
                        
                        if not task.done():
                            logger.warning(f"🪓 [看门狗] 强制终止僵尸进程: {nickname} (RoomID:{current_room_id})")
                            task.cancel()
                            
        except Exception as e:
            logger.error(f"❌ 看门狗报错: {e}")
            
        await asyncio.sleep(60)

async def main():
    # 1. 先初始化全局 Redis 连接，因为 DB 连接池启动时还需要读取 Redis 恢复备份队列
    await init_redis("redis://localhost:6379/0")

    # 2. 初始化 PostgreSQL 数据库连接池
    from src.db.db import AsyncPostgresHandler 
    db = AsyncPostgresHandler()
    await db.init_pool() 
    
    asyncio.create_task(zombie_cleaner(db))

    # 3. 初始化礼物去重
    gift_processor = AsyncGiftDeduplicator(db_handler=db)
    gift_processor.start()

    # 设置全局 Session 超时
    timeout = aiohttp.ClientTimeout(total=15, connect=10)
    
    cookies = await db.get_all_cookies()
    
    if not cookies or cookies[0] == "":
        logger.error("❌ 没拿到 Cookie！请在 db.py 的 get_all_cookies() 中填入有效的 Cookie")
        await db.close()
        await close_redis()
        return
    slot_manager.sync_db_cookies(cookies)
    logger.info(f"✅ 成功加载 {len(cookies)} 个 Cookie，准备启动监控...")
    
    try:
        reporter = DailyReporter(db)
        scheduler = AsyncIOScheduler()
        scheduler.add_job(reporter.generate_report, 'cron', hour=23, minute=55)
        scheduler.start()
        logger.info("⏰ [Scheduler] 定时任务已启动 (每天 23:55 生成日报)")
    except Exception as e:
        logger.error(f"❌ 定时任务启动失败: {e}")

    # 【Session 上下文管理器】
    async with aiohttp.ClientSession(
        timeout=timeout, 
        cookie_jar=aiohttp.DummyCookieJar() 
    ) as shared_session:
        
        # 4. 初始化监控器 (传入 session)
        monitor = AsyncDouyinLiveMonitor(cookies, db, session=shared_session)

        logger.info("✅ 系统组件初始化完成，开始智能监控...")

        try:
            while True:
                try:
                    current_live_map = {}
                    
                    # ====================================================
                    # 阶段 B (前置): 流式迭代，查到即启动！不等翻页！
                    # ====================================================
                    async for live_info in monitor.stream_all_live_users():
                        web_rid = live_info.get('web_rid')
                        if not web_rid:
                            continue
                            
                        current_live_map[web_rid] = live_info
                        
                        # 发现即启动，直接扔进事件循环
                        if web_rid not in recording_tasks and live_info.get('live_status') == 1:
                            nickname = live_info.get('nickname')
                            room_id = str(live_info.get('room_id'))
                            
                            task = asyncio.create_task(
                                start_recorder_task(
                                    web_rid, 
                                    nickname, 
                                    live_info.get('follower_count', 0), 
                                    db, 
                                    gift_processor, 
                                    monitor_data=live_info,
                                    session=shared_session  # 修复Bug：此处传入复用的 shared_session
                                )
                            )
                            recording_tasks[web_rid] = {
                                "task": task,
                                "room_id": room_id,
                                "nickname": nickname
                            }
                            logger.info(f"⚡ [极速启动] 发现 {nickname} 正在直播，已立即触发录制！")

                    # ====================================================
                    # 阶段 A (后置): 整个列表流式扫描结束后，统一处理任务清理
                    # ====================================================
                    for web_rid in list(recording_tasks.keys()):
                        task_info = recording_tasks[web_rid]
                        task = task_info['task']
                        old_room_id = task_info['room_id']
                        nickname = task_info['nickname']
                        
                        # 获取 Monitor 的最新情报
                        latest_info = current_live_map.get(web_rid)
                    
                        # 1. 优先执行主动换场检测（绕过 task.done() 限制）
                        if latest_info:
                            new_room_id = str(latest_info.get('room_id'))
                            if new_room_id and new_room_id != old_room_id:
                                logger.info(f"🔄 [主动换场] 发现房间号变更 ({old_room_id} -> {new_room_id})，强制切断旧任务: {nickname}")
                                
                                # 主动强杀仍在运行的旧 WebSocket 任务
                                if not task.done():
                                    task.cancel()
                                    
                                # 结算旧房间并从任务字典中移除
                                await settle_room(db, old_room_id, nickname)
                                del recording_tasks[web_rid]
                                
                                # 跳过当前循环，下一次阶段 B 的 stream_all_live_users 会自动为新 room_id 启动任务
                                continue
                    
                        # 2. 如果房间号没变，且任务尚未自然结束，则跳过后续结算逻辑
                        if not task.done():
                            continue
                    
                        # 3. 检查异常
                        if not task.cancelled() and task.exception():
                            logger.warning(f"💥 [异常断开] {nickname}: {task.exception()}")
                    
                        db_status = await db.get_room_live_status(old_room_id)
                    
                        # 分支 1: 真正下播
                        if db_status == 4 or not latest_info:
                            logger.info(f"👋 [确认下播] 任务自然结束: {nickname}")
                            await settle_room(db, old_room_id, nickname)
                            del recording_tasks[web_rid]
                            continue
                    
                        # 分支 3: 意外断开 (Monitor 显示还在播，但任务自己结束了)
                        logger.warning(f"♻️ [闪断恢复] WS断开但Monitor显示在线，立即重启: {nickname}")
                        
                        new_task = asyncio.create_task(
                            start_recorder_task(
                                web_rid, 
                                nickname, 
                                latest_info.get('follower_count', 0), 
                                db, 
                                gift_processor, 
                                monitor_data=latest_info,
                                session=shared_session
                            )
                        )
                        recording_tasks[web_rid]['task'] = new_task

                    logger.info(f"💓 扫描完成: 在线{len(current_live_map)} | 录制中{len(recording_tasks)}")

                except Exception as e:
                    logger.error(f"❌ 主循环异常: {e}", exc_info=True)

                now_time = datetime.now().time()
                target_start = time(20, 59, 30)
                target_end = time(21, 1, 0)

                if target_start <= now_time <= target_end:
                    sleep_duration = 10
                    logger.info(f"⚡ 冲刺时段！监控间隔缩短为 {sleep_duration} 秒") 
                else:
                    sleep_duration = 30

                await asyncio.sleep(sleep_duration)

        except (KeyboardInterrupt, asyncio.CancelledError):
            logger.info("🛑 收到退出信号...")
        finally:
            if recording_tasks:
                logger.info("正在取消所有录制任务...")
                for t in recording_tasks.values():
                    if isinstance(t, dict): t['task'].cancel()
                    else: t.cancel()
                
                tasks = [t['task'] for t in recording_tasks.values() if isinstance(t, dict)]
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)

            await gift_processor.stop()
            await db.close()
            await close_redis()
            logger.info("👋 系统已完全退出")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass