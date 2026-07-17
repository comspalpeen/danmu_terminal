from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime
class FavoriteStreamer(BaseModel):
    sec_uid: str
    nickname: str
    avatar_url: str
    group_name: str = "默认分组"
    display_id: Optional[str] = None     # 抖音号
    grade_icon_url: Optional[str] = None # 财富等级图标
    follower_count: int = 0
    created_at: datetime = Field(default_factory=datetime.now)

class BatchCheckRequest(BaseModel):
    user_sec_uid: str
    streamer_sec_uids: List[str]
class Author(BaseModel):
    sec_uid: str
    nickname: str = "未知用户"
    weight: int = 3
    avatar: Optional[str] = None
    signature: Optional[str] = None
    live_status: int = 0
    web_rid: Optional[str] = None
    room_id: Optional[str] = None
    user_count: int = 0
    follower_count: int = 0
    class Config:
        populate_by_name = True

class RoomSchema(BaseModel):
    room_id: str
    title: str = ""
    nickname: Optional[str] = ""
    user_id: Optional[str] = None
    sec_uid: Optional[str] = None
    cover_url: Optional[str] = None
    created_at: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_viewers: int = 0
    like_count: int = 0
    live_status: int = 4
    total_diamond_count: int = 0
    
    class Config:
        populate_by_name = True

class PkBattle(BaseModel):
    battle_id: str
    room_id: str
    start_time: datetime
    mode: str
    teams: List[dict]
    created_at: datetime
    duration: Optional[int] = None

class QnAItem(BaseModel):
    id: Optional[str] = None 
    question: str
    answer: str
    order: int = 0 
    is_visible: bool = True 

class GlobalSearchResult(BaseModel):
    user_name: str
    sec_uid: str = ""
    avatar_url: str = ""
    content: str
    created_at: datetime
    event_time: Optional[datetime] = None
    send_time: Optional[datetime] = None
    room_id: str
    anchor_name: str = "未知主播"
    room_title: str = ""
    room_cover: str = ""
    pay_grade_icon: Optional[str] = ""
    fans_club_icon: Optional[str] = ""
    total_diamond_count: Optional[int] = 0 
    gift_icon: Optional[str] = ""
    gift_count: Optional[int] = 0
class DailyReportItem(BaseModel):
    date: str
    uid: str
    sec_uid: str
    nickname: str
    avatar_url: Optional[str] = "" 
    pay_grade_icon: Optional[str] = ""
    
    follower_count: int
    active_fans_count: int = 0  # 点亮中
    total_fans_club: int = 0    # 总量
    today_new_fans: int = 0     # 新加入
    task_1_completed: int = 0   # 送灯牌
    
    # 计算字段
    follower_diff: Optional[int] = 0

class DailyReportResponse(BaseModel):
    date: str
    items: List[DailyReportItem]
class CzLevelBatchRequest(BaseModel):
    targets: List[str] = []
    user_ids: list[str] = []

class CzLevelResponse(BaseModel):
    query: Optional[str] = None      # 批量查询时带回原始查询词
    sec_uid: str
    display_id: str
    nickname: str
    avatar: str
    level: int
    source: str
    passed: bool
class ToolsBaseRequest(BaseModel):
    sec_uid: str
    room_id: str
    start_time: str
    end_time: str


class GiftReportPreviewRequest(ToolsBaseRequest):
    gift_keywords: List[str]


class SpenderThresholdPreviewRequest(ToolsBaseRequest):
    min_total_diamond: int = 0


class ToolsPreviewMeta(BaseModel):
    sec_uid: str
    room_id: str
    anchor_name: str = "未知主播"
    room_title: str = ""
    start_time: str
    end_time: str


class GiftReportRow(BaseModel):
    rank: int
    user_name: str
    display_id: str = ""
    sec_uid: str = ""
    profile_url: str = ""
    total_count: int = 0
    send_times: List[str] = []
    gift_list: List[str] = []


class SpenderThresholdRow(BaseModel):
    rank: int
    user_name: str
    display_id: str = ""
    sec_uid: str = ""
    profile_url: str = ""
    total_diamond_count: int = 0
    gift_list: List[str] = []


class GiftReportPreviewResponse(BaseModel):
    meta: ToolsPreviewMeta
    gift_keywords: List[str]
    rows: List[GiftReportRow]


class SpenderThresholdPreviewResponse(BaseModel):
    meta: ToolsPreviewMeta
    min_total_diamond: int
    rows: List[SpenderThresholdRow]
class HighLevelFanItem(BaseModel):
    user_id: str
    sec_uid: str
    display_id: str
    nickname: str
    avatar_url: str
    club_level: int
    intimacy: int
    participate_time: int
    pay_grade: int

class ExportNewRequest(BaseModel):
    user_ids: List[str]

class ScanStatusResponse(BaseModel):
    status: str  # "processing", "completed", "failed"
    message: str = ""
    data: List[HighLevelFanItem] = []
class SystemSettings(BaseModel):
    single_api_switch: int = 1
    enable_zero_level_shield: bool = True
    active_shield_days: int = 3
    enable_uid_recheck: bool = True  # 👈 新增：UID 纯数字复查降级开关（默认开启）