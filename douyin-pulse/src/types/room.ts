
export interface ChatMsg {
    user_name: string;
    content: string;
    avatar_url?: string;
    sec_uid?: string;
    gender?: number; 
    pay_grade_icon?: string; 
    fans_club_icon?: string; 
    created_at?: string;
    event_time?: string;
}

export interface GiftMsg {
    user_name: string;
    gift_name: string;
    gift_icon_url?: string;
    diamond_count: number;
    total_diamond_count: number;
    combo_count: number;
    group_count?: number;
    avatar_url?: string;
    sec_uid?: string;
    gender?: number;
    pay_grade_icon?: string; 
    fans_club_icon?: string;
    created_at?: string;
    send_time?: string;
}

export type SearchTarget = 'all' | 'chat' | 'gift';


export interface PkContributor {
    user_id: string;
    nickname: string;
    avatar: string;
    score: number;
    rank: number;
}

export interface PkAnchor {
    user_id: string;
    nickname: string;
    avatar: string;
    score: number;
    contributors: PkContributor[];
}

export interface PkTeam {
    team_id: string;
    win_status: number; // 1胜利 2失败 0平局
    anchors: PkAnchor[];
}

export interface PkBattle {
    battle_id: string;
    start_time: string;
    roomUserId?: string;
    mode: string;
    teams: PkTeam[];
    duration?: number;     // PK持续时间(秒)
    created_at?: string;
}

export interface LivePkAnchor {
    user_id: string;
    nickname: string;
    avatar: string;
    score: number;
    contributors: PkContributor[];
}

export interface LivePkTeam {
    team_id: string;
    team_score: number;
    rank?: number;
    win_status?: number;
    anchors: LivePkAnchor[];
}

export interface LivePkSnapshot {
    type: 'pk_live';
    room_id: string;
    roomUserId?: string;
    battle_id: string;
    channel_id: string;
    status: number;
    mode: string;
    start_time: number;
    duration: number;
    left_team_id: string;
    teams: LivePkTeam[];
    updated_at: number;
}

export interface RoomDetail {
    room_id: string;
    title: string;
    user_id?: string;
    sec_uid?: string;
    nickname: string;
    avatar_url?: string;
    cover_url?: string;
    live_status: number; // 1:直播中, 4:已结束
    user_count: number;       // 当前在线
    max_viewers: number;      // 峰值在线
    total_user_count: number; // 累计观看
    like_count: number;       // 点赞
    follower_count: number;   // 粉丝
    follower_diff?: number;   // 涨粉
    fans_ticket_count?: number; // 粉丝团灯牌
    total_chat_count?: number;  // 弹幕总数
    total_diamond_count?: number; // 钻石总数 (后端需聚合或估算)
    total_watch_time_sec?: number; // 总观看时长(秒)

    created_at: string;
    end_time?: string;
}
