import React from 'react';
import { RoomDetail } from '@/types/room';

interface StatsModalProps {
    room: RoomDetail | null;
    isOpen: boolean;
    onClose: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ room, isOpen, onClose }) => {
    if (!isOpen || !room) return null;

    const isLive = room.live_status === 1;

    // 1. 直播时长
    const getDurationSec = () => {
        const start = new Date(room.created_at).getTime();
        const end = isLive ? Date.now() : (room.end_time ? new Date(room.end_time).getTime() : Date.now());
        return (end - start) / 1000;
    };

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}小时 ${m}分`;
    };

    // 2. 平均停留
    const getAvgStay = () => {
        if (!room.total_user_count || room.total_user_count === 0) return '0分0秒';
        const totalSeconds = room.total_watch_time_sec || 0;
        const avgSeconds = totalSeconds / room.total_user_count;
        const m = Math.floor(avgSeconds / 60);
        const s = Math.floor(avgSeconds % 60);
        return `${m}分${s}秒`;
    };

    // 3. 平均在线
    const getAvgOnline = () => {
        const duration = getDurationSec();
        if (duration <= 0) return 0;
        const totalSeconds = room.total_watch_time_sec || 0;
        return Math.floor(totalSeconds / duration);
    };

    // 4. 数字格式化
    const formatStat = (num?: number) => {
        if (!num) return '0';
        if (num < 10000) return num.toLocaleString();
        return (num / 10000).toFixed(1) + '万'; // 使用 W 替代 万 增加科技感
    };

    const primaryStatLabel = isLive ? "当前在线" : "平均在线";
    const primaryStatValue = isLive ? room.user_count : getAvgOnline();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm transition-colors duration-500" onClick={onClose}>
            <div className="relative bg-card text-card-foreground rounded-[var(--radius)] border border-border w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 transition-colors duration-500" onClick={e => e.stopPropagation()}>
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity z-10"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/50 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity z-10"></div>
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/50 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity z-10"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity z-10"></div>
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20 transition-colors duration-500">
                    <h3 className="font-black text-lg text-primary tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 bg-primary animate-pulse rounded-full"></span>
                        本场数据 // STATS
                        {!isLive && <span className="bg-muted text-muted-foreground border border-border font-mono text-[10px] px-1.5 py-0.5 rounded-[calc(var(--radius)-4px)] tracking-normal ml-2">OFFLINE</span>}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted w-8 h-8 rounded-[var(--radius)] flex items-center justify-center transition-colors text-2xl leading-none outline-none">&times;</button>
                </div>
                
                <div className="p-5 space-y-4 bg-background/50 transition-colors duration-500">
                    {/* 第一行：核心流量指标 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-primary/10 border border-primary/20 p-3 rounded-[calc(var(--radius)-4px)] transition-colors duration-500 relative overflow-hidden group">
                            <div className="text-[10px] font-bold text-primary/70 mb-1 uppercase tracking-wider">{primaryStatLabel}</div>
                            <div className="text-2xl font-black font-mono text-primary drop-shadow-[0_0_8px_rgba(var(--color-primary),0.3)]">{primaryStatValue.toLocaleString()}</div>
                            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-primary/30 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
                        </div>
                        <div className="bg-accent/10 border border-accent/20 p-3 rounded-[calc(var(--radius)-4px)] transition-colors duration-500 relative overflow-hidden group">
                            <div className="text-[10px] font-bold text-accent/70 mb-1 uppercase tracking-wider">峰值在线</div>
                            <div className="text-2xl font-black font-mono text-accent drop-shadow-[0_0_8px_rgba(var(--color-accent),0.3)]">{room.max_viewers?.toLocaleString() || '-'}</div>
                        </div>
                    </div>

                    {/* 第二行：钻石营收 (通栏大卡片) */}
                    <div className="bg-card border-2 border-primary/30 p-4 rounded-[var(--radius)] flex justify-between items-center shadow-[0_0_15px_rgba(var(--color-primary),0.1)] hover:border-primary/60 transition-all duration-500 group">
                        <div>
                            <div className="text-[10px] text-primary/70 mb-1 uppercase tracking-wider font-bold">本场钻石营收</div>
                            <div className="text-3xl font-black font-mono text-primary tabular-nums tracking-tight drop-shadow-[0_0_10px_rgba(var(--color-primary),0.4)] group-hover:scale-105 origin-left transition-transform">
                                {formatStat(room.total_diamond_count)}
                            </div>
                        </div>
                        <div className="text-right opacity-80 text-3xl drop-shadow-[0_0_10px_rgba(var(--color-primary),0.5)] transition-all group-hover:scale-110 group-hover:rotate-12 group-hover:opacity-100">
                            💎
                        </div>
                    </div>

                    {/* 第三行：累计互动 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-secondary border border-border p-3 rounded-[calc(var(--radius)-4px)] transition-colors duration-500">
                            <div className="text-[10px] font-bold text-secondary-foreground/70 mb-1 uppercase tracking-wider">累计点赞 </div>
                            <div className="text-xl font-black font-mono text-secondary-foreground">{formatStat(room.like_count)}</div>
                        </div>
                        <div className="bg-secondary border border-border p-3 rounded-[calc(var(--radius)-4px)] transition-colors duration-500">
                            <div className="text-[10px] font-bold text-secondary-foreground/70 mb-1 uppercase tracking-wider">累计观看</div>
                            <div className="text-xl font-black font-mono text-secondary-foreground">{formatStat(room.total_user_count)}</div>
                        </div>
                    </div>

                    {/* 第四行：粘性指标 */}
                    <div className="bg-muted/50 border border-border p-4 rounded-[var(--radius)] flex justify-between items-center transition-colors duration-500">
                        <div>
                            <div className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">人均停留时长</div>
                            <div className="text-2xl font-black text-foreground font-mono">{getAvgStay()}</div>
                        </div>
                        <div className="text-right opacity-30 text-muted-foreground">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                    </div>

                    {/* 第五行 - 拆分为两个独立卡片，突出显示涨粉 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted border border-border p-3 rounded-[calc(var(--radius)-4px)] transition-colors duration-500">
                            <div className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">直播时长</div>
                            <div className="text-lg font-black text-foreground font-mono">
                                {formatDuration(getDurationSec())}
                            </div>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-[calc(var(--radius)-4px)] transition-colors duration-500">
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-1 font-bold uppercase tracking-wider">本场涨粉</div>
                            <div className={`text-xl font-black font-mono ${(room.follower_diff || 0) >= 0 ? 'text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'text-destructive'}`}>
                                {(room.follower_diff || 0) > 0 ? '+' : ''}{formatStat(room.follower_diff)}
                            </div>
                        </div>
                    </div>
                    
                    <div className="col-span-2 text-[10px] text-muted-foreground/50 text-center mt-2 font-mono uppercase tracking-widest transition-colors duration-500">
                        开播时间: {new Date(room.created_at).toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsModal;