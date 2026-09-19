"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { Swords, Users, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface LivePkCardProps {
    roomId: string;
    roomUserId?: string;
    onPkFinish?: () => void; 
    liveStatus?: number;
}

export default function LivePkCard({ roomId, roomUserId, onPkFinish, liveStatus }: LivePkCardProps) {
    const [snapshot, setSnapshot] = useState<any>(null);
    const [now, setNow] = useState(Date.now());
    const reconnectRef = useRef<number | null>(null);
    
    const currentBattleIdRef = useRef<string | null>(null);
    const finishedBattleIdRef = useRef<string | null>(null); 
    // 1. SSE 数据监听
    useEffect(() => {
        if (liveStatus !== 1) {
            return;
        }
        let eventSource: EventSource | null = null;
        let stopped = false;

        const connect = () => {
            if (stopped) return;
            eventSource = new EventSource(`/api/rooms/${roomId}/pk/live`);

            eventSource.addEventListener("pk_snapshot", (event) => {
                try {
                    const next = JSON.parse((event as MessageEvent).data);
                    setSnapshot(next);
                } catch (error) {
                    console.error("parse pk snapshot failed", error);
                }
            });

            eventSource.onerror = () => {
                eventSource?.close();
                if (!stopped) reconnectRef.current = window.setTimeout(connect, 1500);
            };
        };

        connect();
        return () => {
            stopped = true;
            eventSource?.close();
            if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
        };
    }, [roomId, liveStatus]);
    // 2. 内部时钟：驱动倒计时
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        if (snapshot?.status === 2 && snapshot.start_info?.battle_id !== finishedBattleIdRef.current) {
            finishedBattleIdRef.current = snapshot.start_info?.battle_id;
            
            // 通知父组件去重刷历史列表
            if (onPkFinish) {
                onPkFinish();
            }

            // 延迟 5 秒后清空数据，让实时卡片优雅消失
            const timer = setTimeout(() => {
                setSnapshot(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [snapshot?.status, snapshot?.start_info?.battle_id, onPkFinish]);
    // 3. 核心判定：空数据、无开始包、断流10秒 -> 完全隐藏
    const isStale = useMemo(() => {
        if (!snapshot || !snapshot.updated_at) return false;
        if (snapshot.status === 2) return false; 
        return (now - snapshot.updated_at) > 30000;
    }, [snapshot, now]);

    const startTimeStr = useMemo(() => {
        if (!snapshot?.start_info?.start_time_ms) return "";
        const date = new Date(snapshot.start_info.start_time_ms);
        return date.toLocaleTimeString('zh-CN', { hour12: false });
    }, [snapshot?.start_info?.start_time_ms]);

    if (!snapshot || !snapshot.start_info || isStale) {
        return null;
    }
    // 4. 倒计时计算
    const { start_time_ms, duration } = snapshot.start_info;
    const timeLeft = Math.max(0, Math.floor((start_time_ms + duration * 1000 - now) / 1000));
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const isFreeForAll = snapshot.teams && snapshot.teams.length > 2;
    // 渲染模式 1：四人混战 / 个人赛
    if (isFreeForAll) {
        const sortedTeams = [...snapshot.teams].sort((a, b) => b.team_score - a.team_score);
        const maxScore = Math.max(...sortedTeams.map(t => t.team_score), 1);

        return (
            <Card className="mb-4 overflow-hidden border-border bg-card shadow-sm animate-in fade-in duration-300">
                <CardContent className="p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
                        <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <Users className="h-4 w-4" /> 实时 PK (个人)
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                                <span className="opacity-50">开始:</span>
                                <span className="font-mono">{startTimeStr}</span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-primary">
                                <Timer className="h-3.5 w-3.5 animate-pulse" />
                                <span className="text-xs font-mono font-black">{timeString}</span>
                            </div>
                            <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-foreground">
                                {snapshot.status === 2 ? "结算中..." : "进行中"}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {sortedTeams.map((team, index) => {
                            const anchor = team.anchors[0];
                            if (!anchor) return null;
                            const percent = (team.team_score / maxScore) * 100;
                            
                            const isStreamer = roomUserId && String(anchor.user_id) === String(roomUserId);
                            const containerClass = isStreamer ? "bg-[hsl(var(--streamer))]/10 border-[hsl(var(--streamer))]/30" : "bg-background border-border";
                            const nameColorClass = "font-bold text-foreground";
                            const barColorClass = isStreamer ? "bg-[hsl(var(--streamer))]/20" : "bg-primary/10";

                            return (
                                <div key={team.team_id} className={`relative overflow-hidden rounded-lg border p-2 transition-colors ${containerClass}`}>
                                    <div 
                                        className={`absolute left-0 top-0 h-full transition-all duration-500 ${barColorClass}`} 
                                        style={{ width: `${percent}%` }} 
                                    />
                                    <div className="relative z-10 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-muted-foreground w-4 text-center">
                                                {index + 1}
                                            </span>
                                            <div className={`relative h-8 w-8 overflow-hidden rounded-full border ${isStreamer ? 'border-[hsl(var(--streamer))]' : 'border-border'}`}>
                                                <Image src={anchor.avatar || "/default-avatar.png"} alt={anchor.nickname} fill className="object-cover" unoptimized referrerPolicy="no-referrer" />
                                            </div>
                                            <span className={`text-xs ${nameColorClass}`}>{anchor.nickname}</span>
                                        </div>
                                        <span className={`text-sm font-mono font-bold ${isStreamer ? 'text-[hsl(var(--streamer))]' : 'text-primary'}`}>
                                            {team.team_score.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        );
    }
    // 渲染模式 2：1v1 / 阵营战 (红蓝对抗模式)
    const leftTeam = snapshot.teams.find((t: any) => 
    t.anchors?.some((a: any) => String(a.user_id) === String(roomUserId))
) || snapshot.teams[0];

    const rightTeam = snapshot.teams.find((t: any) => t.team_id !== leftTeam?.team_id) || snapshot.teams[1];

    if (!leftTeam || !rightTeam) return null;

    const leftScore = leftTeam.team_score;
    const rightScore = rightTeam.team_score;
    const totalScore = Math.max(leftScore + rightScore, 1);
    const leftPercent = (leftScore / totalScore) * 100;
    const rightPercent = 100 - leftPercent;
    const isOneVsOne = leftTeam.anchors?.length === 1 && rightTeam.anchors?.length === 1;
    const battleTitle = isOneVsOne ? "实时 PK (个人战)" : "实时 PK (阵营战)";
    return (
        <Card className="mb-4 overflow-hidden border-border bg-card shadow-sm animate-in fade-in duration-300">
            <CardContent className="p-4">
                <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <Swords className="h-4 w-4" /> 
                        {battleTitle}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                            <span className="opacity-50">开始:</span>
                            <span className="font-mono">{startTimeStr}</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-primary">
                            <Timer className="h-3.5 w-3.5 animate-pulse" />
                            <span className="text-xs font-mono font-black">{timeString}</span>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-foreground">
                            {snapshot.status === 2 ? "结算中..." : "进行中"}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                    {/* 左边队伍 */}
                    <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                        <div className="mb-3 text-center text-2xl font-bold text-red-500">
                            {leftScore.toLocaleString()}
                        </div>
                        <div className="space-y-2">
                            {[...leftTeam.anchors].sort((a: any, b: any) => b.score - a.score).map((anchor: any) => (
                                <div key={anchor.user_id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                                    <Image src={anchor.avatar || "/default-avatar.png"} alt={anchor.nickname} width={32} height={32} className="rounded-full" unoptimized referrerPolicy="no-referrer" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-semibold text-foreground">
                                        {anchor.nickname}
                                    </div>
                                        <div className="text-[11px] font-mono text-muted-foreground">{anchor.score.toLocaleString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="pt-6 text-sm font-bold text-muted-foreground/50">VS</div>

                    {/* 右边队伍 */}
                    <div className="flex-1 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                        <div className="mb-3 text-center text-2xl font-bold text-blue-500">
                            {rightScore.toLocaleString()}
                        </div>
                        <div className="space-y-2">
                            {[...rightTeam.anchors].sort((a: any, b: any) => b.score - a.score).map((anchor: any) => (
                                <div key={anchor.user_id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                                    <Image src={anchor.avatar || "/default-avatar.png"} alt={anchor.nickname} width={32} height={32} className="rounded-full" unoptimized referrerPolicy="no-referrer" />
                                    <div className="min-w-0 flex-1">
                                        <div className={`truncate text-xs ${String(anchor.user_id) === String(roomUserId) ? 'text-[hsl(var(--streamer))] font-black' : 'font-semibold'}`}>
                                        {anchor.nickname}
                                    </div>
                                        <div className="text-[11px] font-mono text-muted-foreground">{anchor.score.toLocaleString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-full bg-neutral-200 shadow-inner">
                    <div className="flex h-3 w-full">
                        <div className="bg-red-500 transition-all duration-500" style={{ width: `${leftPercent}%` }} />
                        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${rightPercent}%` }} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}