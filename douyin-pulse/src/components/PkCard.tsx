'use client';

import React from 'react';
import Image from 'next/image'; 
import { PkBattle, PkTeam, PkContributor } from '@/types/room';
import { Clock, Flame, Swords, Crown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getDouyinUserUrl, openDouyinUrl } from '@/lib/douyin-links';

interface PkCardProps {
    pk: PkBattle;
    roomUserId?: string; // 支持从外部传入当前房间的主播 UID
}

const extractDate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'object' && val.$date) return val.$date;
    return String(val);
};

const PkCard: React.FC<PkCardProps> = ({ pk, roomUserId }) => {
    // 1. 工具函数：时间显示
    const getTimeDisplay = () => {
        const startRaw = extractDate(pk.start_time);
        if (!startRaw) return '未知时间';

        const startObj = new Date(startRaw);
        const startStr = startObj.toLocaleString('zh-CN', { 
            month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit', 
            hour12: false 
        }).replace(/\//g, '-');

        let endObj: Date | null = null;
        if (pk.duration) {
            endObj = new Date(startObj.getTime() + Number(pk.duration) * 1000);
        } else if (pk.created_at) {
            const createdRaw = extractDate(pk.created_at);
            if (createdRaw) endObj = new Date(createdRaw);
        }

        if (endObj && !isNaN(endObj.getTime())) {
            const endStr = endObj.toLocaleString('zh-CN', { 
                hour: '2-digit', minute: '2-digit', second: '2-digit', 
                hour12: false 
            });
            return `${startStr} ~ ${endStr}`;
        }
        return startStr;
    };
    // 2. 工具函数：点击跳转抖音
    const handleAvatarClick = async (e: React.MouseEvent, uid: string) => {
        e.stopPropagation();
        e.preventDefault();
        const newWindow = window.open('about:blank', '_blank');
        try {
            const res = await fetch(`/api/lookup_user/${uid}`);
            const data = await res.json();
            if (data.sec_uid) {
                const profileUrl = getDouyinUserUrl(data.sec_uid);
                if (profileUrl.startsWith('snssdk1128://')) {
                    newWindow?.close();
                    openDouyinUrl(profileUrl);
                } else if (newWindow) {
                    newWindow.location.href = profileUrl;
                }
            } else {
                newWindow?.close();
                alert("未查询到该用户主页信息");
            }
        } catch (error) {
            newWindow?.close();
        }
    };
    // 3. 核心判定：模式识别
    const totalAnchorsCount = pk.teams.reduce((acc, t) => acc + t.anchors.length, 0);
    const isRankMode = pk.teams.length > 2 || pk.mode === 'rank' || pk.mode === 'free_for_all';
    const isTeamVsMode = pk.teams.length === 2 && totalAnchorsCount > 2;
    // 4. 渲染子组件：贡献榜
    const renderContributorList = (list: PkContributor[]) => {
        if (!list || list.length === 0) return <div className="text-[10px] text-muted-foreground mt-1 text-center py-1">暂无贡献</div>;
        return (
            <div className="flex flex-col gap-1 mt-1 w-full px-1 max-h-24 overflow-y-auto custom-scrollbar">
                {list.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted/50 p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer group" onClick={(e) => handleAvatarClick(e, c.user_id)}>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                            <div className="relative flex-shrink-0 w-4 h-4">
                                <Image src={c.avatar || '/default-avatar.png'} alt={c.nickname} fill sizes="20px" className="rounded-full object-cover border border-border" unoptimized referrerPolicy="no-referrer" />
                                {i < 3 && <span className={`absolute -top-1 -right-1 text-[6px] flex justify-center items-center w-2.5 h-2.5 rounded-full text-white font-bold scale-90 z-10 ${i===0 ? 'bg-yellow-500' : i===1 ? 'bg-slate-400' : 'bg-orange-500'}`}>{i+1}</span>}
                            </div>
                            <span className="flex-1 min-w-0 truncate text-foreground group-hover:text-primary transition-colors font-medium text-[10px] scale-90 origin-left">{c.nickname}</span>
                        </div>
                        <span className="flex-shrink-0 font-mono font-bold text-muted-foreground text-[10px] scale-90 origin-right">{c.score}</span>
                    </div>
                ))}
            </div>
        );
    };
    // 5. 渲染分支 A：多人排名赛 (含主播高亮)
    if (isRankMode) {
        const allAnchors = pk.teams.flatMap(t => t.anchors);
        const sortedAnchors = allAnchors.sort((a, b) => b.score - a.score);

        return (
            <Card className="mb-4 shadow-sm border-border bg-card overflow-hidden">
                <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-4 border-b border-border/50 pb-3">
                        <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0" /> {getTimeDisplay()}</span>
                        <span className="text-[10px] font-bold bg-muted text-foreground px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0"><Crown className="w-3 h-3 text-yellow-500" /> 多人排名赛 ({sortedAnchors.length}人)</span>
                    </div>
                    <div className="space-y-4">
                        {sortedAnchors.map((anchor, idx) => {
                            const isStreamer = roomUserId && String(anchor.user_id) === String(roomUserId);
                            const rankColor = idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-500' : 'text-muted-foreground/50';
                            
                            return (
                                <div key={anchor.user_id} className={`flex flex-col md:flex-row items-start md:items-center p-3 rounded-xl border transition-all ${isStreamer ? 'bg-[hsl(var(--streamer))]/10 border-[hsl(var(--streamer))]/30 shadow-sm' : 'bg-muted/20 border-border/50'}`}>
                                    <div className="flex items-center w-full md:w-48 flex-shrink-0 mb-3 md:mb-0">
                                        <span className={`w-6 font-bold text-xl ${rankColor} text-center mr-3`}>{idx + 1}</span>
                                        <div className="relative mr-3 flex-shrink-0 w-12 h-12 group cursor-pointer" onClick={(e) => handleAvatarClick(e, anchor.user_id)}>
                                            <Image src={anchor.avatar || '/default-avatar.png'} alt={anchor.nickname} fill sizes="50px" className={`rounded-full object-cover border-2 ${isStreamer ? 'border-[hsl(var(--streamer))]' : 'border-transparent'} group-hover:border-primary/50 transition-colors shadow-sm`} unoptimized referrerPolicy="no-referrer" />
                                            {idx === 0 && <Crown className="absolute -top-3 -left-1.5 w-5 h-5 text-yellow-500 animate-bounce z-10" />}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm truncate max-w-[120px] cursor-pointer block w-full text-foreground font-bold hover:text-primary transition-colors" onClick={(e) => handleAvatarClick(e, anchor.user_id)}>
                                                {anchor.nickname}
                                            </span>
                                            <div className="text-xs font-bold text-muted-foreground mt-0.5">{anchor.score.toLocaleString()} 分</div>
                                        </div>
                                    </div>
                                    <div className="flex-1 w-full border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-4 min-w-0">
                                        <div className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-2"><Flame className="w-3 h-3 text-orange-500" /> 贡献榜</div>
                                        {renderContributorList(anchor.contributors)}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        );
    }
    // 6. 渲染分支 B：VS 对决 (1V1 / 组队)
    // 使用 let 以允许在判定后交换
    let teamA = pk.teams[0];
    let teamB = pk.teams[1] || { anchors: [], win_status: 0, team_id: '0' };
    if (roomUserId) {
        const isStreamerInRight = teamB.anchors?.some(a => String(a.user_id) === String(roomUserId));
        if (isStreamerInRight) {
            [teamA, teamB] = [teamB, teamA]; // 结构赋值直接交换
        }
    }

    const scoreA = teamA.anchors.reduce((acc, cur) => acc + cur.score, 0);
    const scoreB = teamB.anchors.reduce((acc, cur) => acc + cur.score, 0);
    const totalScore = scoreA + scoreB || 1;
    const percentA = Math.round((scoreA / totalScore) * 100);

    const getIsWin = (currentTeam: PkTeam, currentScore: number, opponentTeam: PkTeam, opponentScore: number) => {
        if (currentTeam.win_status === 1) return true;
        if (currentTeam.win_status === 2) return false;
        if (currentTeam.win_status === 0 && opponentTeam.win_status === 0) return currentScore > opponentScore;
        return false;
    };

    const isTeamAWin = getIsWin(teamA, scoreA, teamB, scoreB);
    const isTeamBWin = getIsWin(teamB, scoreB, teamA, scoreA);

    const renderVsSide = (team: PkTeam, side: 'left' | 'right', isWinner: boolean) => {
        const isRed = side === 'left';
        const isStreamerSide = team.anchors?.some(a => String(a.user_id) === String(roomUserId));
        
        return (
            <div className={`flex-1 w-0 min-w-0 flex flex-col items-center rounded-xl p-3 border ${isRed ? 'border-red-500/20 bg-red-500/10' : 'border-blue-500/20 bg-blue-500/10'} ${isStreamerSide ? 'ring-1 ring-inset ring-[hsl(var(--streamer))]/30' : ''}`}>
                <div className="flex flex-col items-center justify-center relative w-full border-b border-border/50 pb-3 mb-4 h-[72px]">
                    {isWinner && <Crown className="absolute -top-5 w-6 h-6 text-yellow-500 filter drop-shadow-md z-20 animate-pulse transform -rotate-12" />}
                    <span className={`text-2xl font-bold ${isRed ? 'text-red-500' : 'text-blue-500'} drop-shadow-sm`}>{team.anchors.reduce((acc, cur) => acc + cur.score, 0).toLocaleString()}</span>
                    <div className="h-[20px] mt-1 flex items-center justify-center">
                        {isWinner && <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white shadow-sm ${isRed ? 'bg-red-500' : 'bg-blue-500'}`}>WIN</span>}
                    </div>
                </div>

                <div className="w-full space-y-3">
                    {team.anchors.map((anchor) => (
                        <div key={anchor.user_id} className="flex flex-col w-full bg-card rounded-xl p-2.5 shadow-sm border border-border/50">
                            <div className="flex items-center gap-2 mb-2 border-b border-dashed border-border pb-2 w-full">
                                <div className="relative w-8 h-8 flex-shrink-0 cursor-pointer" onClick={(e) => handleAvatarClick(e, anchor.user_id)}>
                                    <Image src={anchor.avatar || '/default-avatar.png'} alt={anchor.nickname} fill sizes="40px" className={`rounded-full border-2 ${isRed ? 'border-red-500/40' : 'border-blue-500/40'} p-0.5 object-cover`} unoptimized referrerPolicy="no-referrer" />
                                </div>
                                <div className="flex flex-col min-w-0 flex-1 w-full">
                                    <span className="text-xs truncate block w-full cursor-pointer hover:text-primary transition-colors font-bold text-foreground" onClick={(e) => handleAvatarClick(e, anchor.user_id)}>
                                        {anchor.nickname}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-mono font-bold mt-0.5">{anchor.score.toLocaleString()} 分</span>
                                </div>
                            </div>
                            {renderContributorList(anchor.contributors)}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <Card className="mb-4 shadow-sm border-border bg-card overflow-hidden">
            <CardContent className="p-4">
                <div className="flex justify-between items-center text-xs font-bold text-muted-foreground mb-4 border-b border-border/50 pb-3">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0" /> {getTimeDisplay()}</span>
                    <span className="font-bold bg-muted px-2.5 py-1 rounded-full text-[10px] flex items-center gap-1 text-foreground shrink-0"><Swords className="w-3 h-3" /> {isTeamVsMode ? '组队 PK' : '1V1 对决'}</span>
                </div>

                <div className="flex items-start justify-between gap-3 w-full">
                    {renderVsSide(teamA, 'left', isTeamAWin)}
                    <div className="flex-shrink-0 flex flex-col items-center w-8 pt-8">
                        <span className="text-xl font-bold text-muted-foreground/40 select-none">VS</span>
                    </div>
                    {renderVsSide(teamB, 'right', isTeamBWin)}
                </div>
                
                <div className="mt-5 w-full h-2.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden flex shadow-inner">
                    <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${percentA}%` }}></div>
                    <div className="h-full bg-blue-500 transition-all duration-500 flex-1"></div>
                </div>
            </CardContent>
        </Card>
    );
};

export default PkCard;
