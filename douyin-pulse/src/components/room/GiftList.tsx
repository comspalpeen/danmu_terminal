'use client';

import React, { useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { GiftMsg } from '@/types/room';
import { Gem } from 'lucide-react';

interface GiftListProps {
    gifts: GiftMsg[];
    loading: boolean;
    onLoadMore: () => void;
    goToProfile: (e: React.MouseEvent, uid?: string) => void;
    formatTime: (t?: string) => string;
}

const BadgeIcons = ({ msg }: { msg: GiftMsg }) => (
    <div className="flex items-center gap-1 mr-1 flex-shrink-0 pointer-events-none">
        {msg.pay_grade_icon && <img src={msg.pay_grade_icon} alt="level" className="h-5 w-auto object-contain drop-shadow-sm" />}
        {msg.fans_club_icon && <img src={msg.fans_club_icon} alt="fans" className="h-5 w-auto object-contain drop-shadow-sm" />}
    </div>
);

const GenderIcon = ({ gender }: { gender?: number }) => {
    // 男性符号：将 text-primary 改为 text-blue-500
    if (gender === 1) return <svg className="w-4 h-4 ml-0.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 14a4 4 0 100-8 4 4 0 000 8zm5-9l5-5m0 0h-5m5 0v5" /></svg>;    if (gender === 2) return <svg className="w-4 h-4 ml-0.5 text-destructive shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 11a4 4 0 100-8 4 4 0 000 8zm0 4v6m-3-3h6" /></svg>;
    return null;
};

export default function GiftList({ gifts, loading, onLoadMore, goToProfile, formatTime }: GiftListProps) {
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    if (gifts.length === 0) {
        return <div className="py-20 text-center text-xs font-bold tracking-widest uppercase text-muted-foreground">{loading ? "数据扫描中..." : "暂无礼物"}</div>;
    }

    return (
        <div className="h-full w-full bg-background flex flex-col">
            <Virtuoso
                ref={virtuosoRef}
                className="custom-scrollbar"
                style={{ flex: 1, width: '100%' }}
                data={gifts}
                overscan={500}
                endReached={onLoadMore}
                components={{ 
                    Footer: () => (loading ? <div className="py-4 text-center text-xs font-bold tracking-widest uppercase text-muted-foreground">加载更多...</div> : null) 
                }}
                itemContent={(index, gift) => {
                    const isBig = gift.total_diamond_count >= 10000;
                    const displayCount = gift.combo_count * (gift.group_count || 1);
                    
                    return (
                        <div className="px-3 py-1.5">
                            <div className={`p-3 rounded-[var(--radius)] border transition-all shadow-sm ${isBig ? 'bg-destructive/10 border-destructive/30' : 'bg-card border-border'}`}>
                                
                                <div className="flex justify-between items-start mb-2 border-b border-border/50 pb-2">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div 
                                            className="relative w-6 h-6 shrink-0 cursor-pointer z-10" 
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToProfile(e, gift.sec_uid); }}
                                        >
                                            <img src={gift.avatar_url || '/default-avatar.png'} alt="avatar" className="w-6 h-6 rounded-full object-cover border border-border" />
                                        </div>
                                        <div className="min-w-0 flex items-center gap-1">
                                            <span 
                                                className="text-xs font-bold truncate text-foreground cursor-pointer hover:text-primary transition-colors max-w-[100px] uppercase [.theme-pink_&]:normal-case relative z-10" 
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToProfile(e, gift.sec_uid); }}
                                            >
                                                {gift.user_name}
                                            </span>
                                            <BadgeIcons msg={gift} />
                                            <GenderIcon gender={gift.gender} />
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap ml-2 pointer-events-none">{formatTime(gift.send_time || gift.created_at)}</span>
                                </div>
                                
                                <div className="flex items-center justify-between pointer-events-none">
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-10 h-10 shrink-0">
                                            {gift.gift_icon_url ? 
                                                <img src={gift.gift_icon_url} alt="gift" className="w-10 h-10 object-contain drop-shadow-sm" /> : 
                                                <div className="w-full h-full bg-muted rounded flex items-center justify-center text-[10px] font-bold tracking-widest text-muted-foreground">无图</div>
                                            }
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-xs md:text-sm font-bold text-foreground">{gift.gift_name}</span>
                                                <span className="text-lg md:text-xl font-black font-mono text-primary italic drop-shadow-sm">x{displayCount}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-1">
                                            <Gem className="w-3.5 h-3.5 text-accent" />
                                            <span className="text-xl md:text-2xl font-black font-mono text-accent italic leading-none drop-shadow-sm">
                                                {gift.total_diamond_count}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                            </div>
                        </div>
                    );
                }}
            />
        </div>
    );
}
