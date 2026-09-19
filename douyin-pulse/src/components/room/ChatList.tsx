'use client';

import React, { useRef, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { ChatMsg } from '@/types/room';

interface ChatListProps {
    chats: ChatMsg[];
    loading: boolean;
    onLoadMore: () => void;
    jumpTime: string | null;
    highlightUid: string | null;
    goToProfile: (e: React.MouseEvent, uid?: string) => void;
    formatTime: (t?: string) => string;
}

const BadgeIcons = ({ msg }: { msg: ChatMsg }) => (
    <div className="flex items-center gap-1 mr-1 flex-shrink-0 pointer-events-none">
        {msg.pay_grade_icon && <img src={msg.pay_grade_icon} alt="level" className="h-5 w-auto object-contain drop-shadow-sm" />}
        {msg.fans_club_icon && <img src={msg.fans_club_icon} alt="fans" className="h-5 w-auto object-contain drop-shadow-sm" />}
    </div>
);

const GenderIcon = ({ gender }: { gender?: number }) => {
    if (gender === 1) return <svg className="w-4 h-4 ml-0.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 14a4 4 0 100-8 4 4 0 000 8zm5-9l5-5m0 0h-5m5 0v5" /></svg>;
    if (gender === 2) return <svg className="w-4 h-4 ml-0.5 text-destructive shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 11a4 4 0 100-8 4 4 0 000 8zm0 4v6m-3-3h6" /></svg>;
    return null;
};

export default function ChatList({ chats, loading, onLoadMore, jumpTime, highlightUid, goToProfile, formatTime }: ChatListProps) {
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const hasScrolledRef = useRef(false);
    const getChatTime = (msg: ChatMsg) => msg.event_time || msg.created_at;

    useEffect(() => {
        if (highlightUid && chats.length > 0 && !hasScrolledRef.current) {
            const index = chats.findIndex(msg => 
                msg.sec_uid === highlightUid && 
                Math.abs(new Date(getChatTime(msg)!).getTime() - new Date(jumpTime || 0).getTime()) < 15000
            );
            
            if (index !== -1) {
                setTimeout(() => {
                    virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
                    hasScrolledRef.current = true;
                }, 500);
            }
        }
    }, [highlightUid, chats, jumpTime]);

    if (chats.length === 0) {
        return <div className="py-20 text-center text-xs font-bold tracking-widest uppercase text-muted-foreground">{loading ? "数据加载中..." : "暂无弹幕"}</div>;
    }

    return (
        <div className="h-full w-full bg-background flex flex-col">
            <Virtuoso
                ref={virtuosoRef}
                className="custom-scrollbar"
                style={{ flex: 1, width: '100%' }}
                data={chats}
                overscan={400}
                endReached={onLoadMore}
                components={{ 
                    Footer: () => (loading ? <div className="py-6 text-center text-xs font-bold text-muted-foreground animate-pulse tracking-widest uppercase">检索更早的记录...</div> : null) 
                }}
                itemContent={(index, msg) => {
                    const isHighlighted = highlightUid && msg.sec_uid === highlightUid && 
                                          Math.abs(new Date(getChatTime(msg)!).getTime() - new Date(jumpTime || 0).getTime()) < 15000;
                    return (
                        <div className="px-2 md:px-3 py-1.5">
                            <div className={`flex gap-3 group bg-card p-3 rounded-[var(--radius)] border transition-all shadow-sm hover:border-primary/40 ${isHighlighted ? 'bg-primary/5 border-primary/50 ring-1 ring-primary/50' : 'border-border'}`}>
                                <div 
                                    className="relative w-10 h-10 shrink-0 cursor-pointer z-10" 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToProfile(e, msg.sec_uid); }}
                                >
                                    <img src={msg.avatar_url || '/default-avatar.png'} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-border group-hover:border-primary/50 transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center flex-wrap gap-y-1 mb-1">
                                        <BadgeIcons msg={msg} />
                                        <span 
                                            className="text-xs md:text-sm font-bold text-foreground truncate cursor-pointer hover:text-primary transition-colors max-w-[120px] uppercase [.theme-pink_&]:normal-case relative z-10" 
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToProfile(e, msg.sec_uid); }}
                                        >
                                            {msg.user_name}
                                        </span>
                                        <GenderIcon gender={msg.gender} />
                                        <span className="text-[10px] md:text-xs text-muted-foreground font-mono ml-auto whitespace-nowrap pl-2 pointer-events-none">
                                            {formatTime(msg.event_time || msg.created_at)}
                                        </span>
                                    </div>
                                    <div className="text-xs md:text-sm text-foreground/90 break-words leading-relaxed">{msg.content}</div>
                                </div>
                            </div>
                        </div>
                    );
                }}
            />
        </div>
    );
}
