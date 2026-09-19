export interface AuthorSuggestion {
  sec_uid: string;
  nickname: string;
  avatar?: string;
}

export interface RoomOption {
  room_id: string;
  title: string;
  nickname?: string;
  created_at?: string;
  end_time?: string;
  live_status: number;
  total_diamond_count?: number;
}

export interface PreviewMeta {
  sec_uid: string;
  room_id: string;
  anchor_name: string;
  room_title: string;
  start_time: string;
  end_time: string;
}

export interface GiftPreviewRow {
  rank: number;
  user_name: string;
  display_id: string;
  sec_uid: string;
  profile_url: string;
  total_count: number;
  send_times: string[];
  gift_list: string[];
}

export interface SpenderPreviewRow {
  rank: number;
  user_name: string;
  display_id: string;
  sec_uid: string;
  profile_url: string;
  total_diamond_count: number;
  gift_list: string[];
}

export interface GiftPreviewResponse {
  meta: PreviewMeta;
  gift_keywords: string[];
  rows: GiftPreviewRow[];
}

export interface SpenderPreviewResponse {
  meta: PreviewMeta;
  min_total_diamond: number;
  rows: SpenderPreviewRow[];
}

export interface HighLevelFanItem {
  user_id: string;
  sec_uid: string;
  display_id: string;
  nickname: string;
  avatar_url: string;
  club_level: number;
  intimacy: number;
  participate_time: number;
  pay_grade: number;
  recorded_at?: string;
}

export type ToolTab = 'gift' | 'spender' | 'high_level';

// 用于传递给面板的通用过滤参数
export interface CommonFilterPayload {
  sec_uid: string;
  room_id: string;
  start_time: string;
  end_time: string;
}