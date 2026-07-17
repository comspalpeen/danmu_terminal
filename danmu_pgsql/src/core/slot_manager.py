# src/core/slot_manager.py
import os
import logging
from typing import Optional, List, Dict
from datetime import datetime

logger = logging.getLogger("SlotManager")

class CookieSlotManager:
    def __init__(self, max_db_slots: int = 4, max_private_slots: int = 3):
        self.max_db_slots = max_db_slots
        self.max_private_slots = max_private_slots
        self.private_cookie = os.getenv("PRIVATE_RESERVE_COOKIE", "")
        
        # --- 新增：解析黑名单配置 ---
        raw_blacklist = os.getenv("BLACKLIST_WEB_RIDS", "")
        # 过滤掉空字符串，生成集合提升查询效率
        self.blacklist = set(rid.strip() for rid in raw_blacklist.split(",") if rid.strip())
        
        self.db_cookies: Dict[str, int] = {}
        self.private_usage = 0

    def sync_db_cookies(self, new_cookies: List[str]):
        """保持原有逻辑不变"""
        new_cookie_set = set(new_cookies)
        current_cookie_set = set(self.db_cookies.keys())

        for old_cookie in current_cookie_set - new_cookie_set:
            del self.db_cookies[old_cookie]
            logger.info("🗑️ [调度器] 移除失效 Cookie 的额度监控")

        for new_cookie in new_cookie_set - current_cookie_set:
            self.db_cookies[new_cookie] = 0
            logger.info("✨ [调度器] 接入新 Cookie 的额度监控")

    def acquire_cookie(self, web_rid: str) -> Optional[str]:
        """
        申请 Cookie 名额
        新增参数: web_rid (用于黑名单校验)
        """
        # --- 新增：高峰期黑名单拦截逻辑 ---
        current_hour = datetime.now().hour
        # 判断是否在 23:00 到 01:59 之间 (跨天判断)
        is_peak_time = (current_hour == 23 or current_hour == 0 or current_hour == 1)
        
        if is_peak_time and web_rid in self.blacklist:
            logger.warning(f"⛔ [调度器] 触发限流: {web_rid} 在黑名单且处于高峰期，降级为默认游客模式")
            return None # 直接返回 None，让 Fetcher 走 TTWID 策略

        # --- 以下保持原有的 Round-Robin 分配逻辑不变 ---
        if not self.db_cookies and not self.private_cookie:
            return None

        if self.db_cookies:
            best_cookie = min(self.db_cookies, key=self.db_cookies.get)
            min_usage = self.db_cookies[best_cookie]

            if min_usage < self.max_db_slots:
                self.db_cookies[best_cookie] += 1
                logger.info(f"🎫 [调度器] 分配 DB 名额给 {web_rid} (当前负载 {min_usage + 1}/{self.max_db_slots})")
                return best_cookie

        if self.private_cookie and self.private_usage < self.max_private_slots:
            self.private_usage += 1
            logger.info(f"🛡️ [调度器] 分配 备用名额给 {web_rid} (当前负载 {self.private_usage}/{self.max_private_slots})")
            return self.private_cookie

        logger.warning(f"⚠️ [调度器] 额度耗尽！{web_rid} 将触发无登录态降级...")
        return None

    def release_cookie(self, cookie: Optional[str]):
        """保持原有逻辑不变"""
        if not cookie:
            return

        if cookie == self.private_cookie:
            self.private_usage = max(0, self.private_usage - 1)
        elif cookie in self.db_cookies:
            self.db_cookies[cookie] = max(0, self.db_cookies[cookie] - 1)