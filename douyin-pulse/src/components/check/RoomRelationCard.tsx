'use client';

import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, PlusCircle, Crown, ShieldCheck } from "lucide-react";

interface RoomRelationProps {
  userSecUid: string; 
  onRefreshFavorites: () => void;
}

export function RoomRelationCard({ userSecUid, onRefreshFavorites }: RoomRelationProps) {
  const [streamerInput, setStreamerInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [targetGroup, setTargetGroup] = useState("特别关注");

  const onRoomSearch = async () => {
    if (!streamerInput.trim() || !userSecUid) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/check/relation?user_sec=${userSecUid}&streamer=${encodeURIComponent(streamerInput)}`);
      const json = await res.json();
      setData(json);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const saveStreamer = async () => {
    if (!data?.anchor_info?.sec_uid) {
        alert("无法获取主播ID，请重试");
        return;
    }
    try {
        const payload = {
        nickname: data.anchor_info.nickname,
        avatar_url: data.anchor_info.avatar_url,
        sec_uid: data.anchor_info.sec_uid,
        grade_icon_url: data.anchor_info.grade_icon_url,
        display_id: data.anchor_info.display_id,
        follower_count: data.anchor_info.follower_count || 0,
        group_name: targetGroup,
    };

        const res = await fetch('/api/favorites', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            onRefreshFavorites();
            alert(`已将 ${data.anchor_info.nickname} 加入 [${targetGroup}]`);
        }
    } catch(e) { console.error(e); }
  };

  return (
    <div className="bg-card/50 rounded-[var(--radius)] p-6 border border-border border-t-primary/50 shadow-2xl animate-in slide-in-from-bottom-6 transition-colors duration-500">
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
                <Search className="w-5 h-5 text-primary transition-colors duration-500" />
                <h2 className="text-xl font-bold text-foreground transition-colors duration-500">直播间关系透视</h2>
                <span className="text-xs text-muted-foreground ml-auto uppercase tracking-wider">Room Intelligence</span>
            </div>
            
            <div className="flex gap-2 relative z-10">
                <Input 
                    placeholder="输入主播 ID / 链接 / 抖音号..." 
                    className="bg-background border-border text-foreground h-12 focus-visible:ring-ring rounded-[var(--radius)] transition-colors duration-500"
                    value={streamerInput}
                    onChange={(e) => setStreamerInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onRoomSearch()}
                />
                <Button 
                    onClick={onRoomSearch} 
                    disabled={loading}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 font-bold rounded-[var(--radius)] transition-colors duration-500"
                >
                    {loading ? "分析中..." : "透视"}
                </Button>
            </div>

            {data && !data.error && (
                <div className="mt-4 bg-gradient-to-r from-background to-card border border-primary/30 rounded-[var(--radius)] overflow-hidden relative animate-in zoom-in-95 transition-colors duration-500">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mt-20 -mr-20 pointer-events-none transition-colors duration-500"></div>

                    <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-background/40 p-1 rounded-[var(--radius-sm)] backdrop-blur-sm border border-border/50">
                        <select 
                            value={targetGroup}
                            onChange={(e) => setTargetGroup(e.target.value)}
                            className="bg-transparent text-xs text-primary border-none outline-none font-bold cursor-pointer transition-colors duration-500"
                        >
                            <option value="默认分组" className="bg-card text-foreground">默认分组</option>
                            <option value="陈泽传媒" className="bg-card text-foreground">陈泽传媒</option>
                            <option value="颜值主播 " className="bg-card text-foreground">颜值主播</option>
                            <option value="热门主播" className="bg-card text-foreground">热门主播</option>
                        </select>
                        <button 
                            onClick={saveStreamer}
                            className="bg-primary hover:bg-primary/80 text-primary-foreground px-3 py-1 rounded-[var(--radius-sm)] text-xs font-bold transition-all flex items-center gap-1 shadow-md"
                        >
                            <PlusCircle className="w-3 h-3" /> 收藏
                        </button>
                    </div>

                    <div className="p-6 relative z-10 flex flex-col gap-6">
                        
                        {data.anchor_info && (
                            <div className="flex items-center gap-3 pb-4 border-b border-border/50">
                                <div className="text-xs text-primary/80 font-bold uppercase tracking-widest mr-2 transition-colors duration-500">Target:</div>
                                <Avatar className="w-8 h-8 border border-primary transition-colors duration-500">
                                    <AvatarImage src={data.anchor_info.avatar_url} />
                                    <AvatarFallback>A</AvatarFallback>
                                </Avatar>
                                <div className="flex items-center gap-2">
                                    <div className="text-sm font-bold text-foreground transition-colors duration-500">
                                        {data.anchor_info.nickname}
                                    </div>
                                    {data.anchor_info.grade_icon_url && (
                                        <img src={data.anchor_info.grade_icon_url} className="h-4 w-auto" alt="Grade" />
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex-1 flex flex-col items-center gap-2 border-b md:border-b-0 md:border-r border-border/50 pb-4 md:pb-0 md:pr-6 w-full md:w-auto">
                                <div className="text-[10px] text-primary/80 font-bold uppercase tracking-widest transition-colors duration-500">粉丝团等级</div>
                                <div className="flex items-center gap-3">
                                    {data.fans_badge_url ? (
                                        <img src={data.fans_badge_url} className="h-8 w-auto drop-shadow-lg" alt="Badge" />
                                    ) : (
                                        <span className="text-muted-foreground text-xs transition-colors duration-500">无勋章</span>
                                    )}
                                    <span className="text-3xl font-black text-foreground italic tracking-tighter transition-colors duration-500">
                                        {data.fans_level > 0 ? `Lv.${data.fans_level}` : "未加入"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col items-center gap-2 border-b md:border-b-0 md:border-r border-border/50 pb-4 md:pb-0 md:pr-6 w-full md:w-auto">
                                <div className="text-[10px] text-yellow-500/80 font-bold uppercase tracking-widest">付费会员</div>
                                <div className="flex items-center gap-2">
                                    <Crown className={`w-8 h-8 ${data.is_member ? "text-yellow-400 fill-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)] animate-pulse" : "text-muted-foreground/50"}`} />
                                    <span className={`text-2xl font-bold ${data.is_member ? "text-foreground" : "text-muted-foreground"}`}>
                                        {data.is_member ? "已开通" : "未开通"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col items-center gap-2 w-full md:w-auto">
                                <div className="text-[10px] text-blue-400/80 font-bold uppercase tracking-widest">房管权限</div>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className={`w-8 h-8 ${data.is_admin ? "text-blue-400 fill-blue-400/20 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]" : "text-muted-foreground/50"}`} />
                                    <span className={`text-2xl font-bold ${data.is_admin ? "text-foreground" : "text-muted-foreground"}`}>
                                        {data.is_admin ? "管理员" : "普通用户"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {data?.error && (
                <div className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-[var(--radius)] text-destructive text-center text-sm font-medium animate-in fade-in transition-colors duration-500">
                    {data.error}
                </div>
            )}
        </div>
    </div>
  );
}