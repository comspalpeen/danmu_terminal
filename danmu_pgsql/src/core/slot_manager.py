# src/core/slot_manager.py
import os
import logging
from typing import Optional, List, Dict

logger = logging.getLogger("SlotManager")

class CookieSlotManager:
    def __init__(self, max_db_slots: int = 4, max_private_slots: int = 3):
        self.max_db_slots = max_db_slots
        self.max_private_slots = max_private_slots
        
        # 推荐：从环境变量读取私人兜底 Cookie，而不是硬编码
        self.private_cookie = os.getenv("PRIVATE_RESERVE_COOKIE", "")
        
        # 记录 DB Cookie 的使用情况: {cookie_str: current_usage_count}
        self.db_cookies: Dict[str, int] = {}
        
        # 记录私有 Cookie 的使用情况
        self.private_usage = 0

    def sync_db_cookies(self, new_cookies: List[str]):
        """热更新：与数据库最新的 Cookie 列表同步"""
        new_cookie_set = set(new_cookies)
        current_cookie_set = set(self.db_cookies.keys())

        # 1. 移除数据库中已经删除/失效的 Cookie
        for old_cookie in current_cookie_set - new_cookie_set:
            del self.db_cookies[old_cookie]
            logger.info("🗑️ [调度器] 移除失效 Cookie 的额度监控")

        # 2. 加入新添加的 Cookie，初始负载为 0
        for new_cookie in new_cookie_set - current_cookie_set:
            self.db_cookies[new_cookie] = 0
            logger.info("✨ [调度器] 接入新 Cookie 的额度监控")

    def acquire_cookie(self) -> Optional[str]:
        """申请一个 Cookie 名额，严格执行平均分配 (1-1-1 -> 2-2-2)"""
        if not self.db_cookies and not self.private_cookie:
            return None

        # 策略 A: 优先使用 DB 流量池 (寻找当前负载最小的)
        if self.db_cookies:
            # 找到 usage 最小的 Cookie 键
            best_cookie = min(self.db_cookies, key=self.db_cookies.get)
            min_usage = self.db_cookies[best_cookie]

            if min_usage < self.max_db_slots:
                self.db_cookies[best_cookie] += 1
                logger.info(f"🎫 [调度器] 分配 DB 名额 (当前负载 {min_usage + 1}/{self.max_db_slots})")
                return best_cookie

        # 策略 B: DB 爆满，降级使用私人备用池
        if self.private_cookie and self.private_usage < self.max_private_slots:
            self.private_usage += 1
            logger.info(f"🛡️ [调度器] 分配 备用名额 (当前负载 {self.private_usage}/{self.max_private_slots})")
            return self.private_cookie

        # 策略 C: 全盘爆满，返回 None 通知下游进行拼接降级
        logger.warning("⚠️ [调度器] 所有名额已耗尽！将触发无登录态降级...")
        return None

    def release_cookie(self, cookie: Optional[str]):
        """释放名额：无论任务是正常结束、异常崩溃还是被看门狗 Kill，都必须调用"""
        if not cookie:
            return

        if cookie == self.private_cookie:
            self.private_usage = max(0, self.private_usage - 1)
            logger.debug(f"♻️ [调度器] 回收 备用名额 (剩余负载 {self.private_usage}/{self.max_private_slots})")
        elif cookie in self.db_cookies:
            self.db_cookies[cookie] = max(0, self.db_cookies[cookie] - 1)
            logger.debug(f"♻️ [调度器] 回收 DB 名额 (剩余负载 {self.db_cookies[cookie]}/{self.max_db_slots})")