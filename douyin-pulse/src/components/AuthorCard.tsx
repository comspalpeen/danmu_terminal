import React from 'react';
import Link from 'next/link';
import { Author } from '../types/author';
import { openDouyinLiveRoom, openDouyinUser } from '@/lib/douyin-links';

interface AuthorCardProps {
    author: Author;
}

const formatNumber = (num: number) => {
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString();
};

const AuthorCard: React.FC<AuthorCardProps> = ({ author }) => {
    const isLive = author.live_status === 1;
    const isLine = author.live_status === 2;
    const isOnline = isLive || isLine;

    const cardOpacity = isOnline ? 'opacity-100' : 'opacity-60 hover:opacity-100';
    const borderColor = isLive 
        ? 'border-destructive shadow-[0_0_10px_rgba(var(--color-destructive),0.3)]' 
        : isLine 
            ? 'border-accent' 
            : 'border-border group-hover:border-primary/50';

    const textColor = isLive ? 'text-destructive' : isLine ? 'text-accent' : 'text-muted-foreground';
    const statusText = isLive ? 'LIVE' : isLine ? 'LINKED' : 'OFFLINE';
    const handleAvatarClick = (e: React.MouseEvent) => {
        e.preventDefault(); 
        if (author.live_status === 1 || author.live_status === 2) {
            // 直播中或连麦中，跳转直播间
            openDouyinLiveRoom({ roomId: author.room_id, webRid: author.web_rid });
        } else {
            // live_status === 0 或其他状态，跳转用户主页
            openDouyinUser(author.sec_uid);
        }
    };

    return (
        <Link 
            href={`/author/${author.sec_uid}`} 
            className={`block relative group cursor-pointer outline-none transition-all duration-500 transform-gpu [-webkit-tap-highlight-color:transparent] ${cardOpacity}`}
        >
            <div className={`relative bg-card p-4 border transition-all duration-500 ${borderColor} overflow-hidden rounded-[var(--radius)]`}>
                
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>

                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current transition-all group-hover:w-4 group-hover:h-4 text-primary opacity-100 [.theme-pink_&]:opacity-0"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current transition-all group-hover:w-4 group-hover:h-4 text-primary opacity-100 [.theme-pink_&]:opacity-0"></div>
                

                <div className="relative z-10 flex gap-4 items-center">
                    <div className="relative shrink-0">
                        <div 
                            onClick={handleAvatarClick}
                            className={`w-16 h-16 border-2 ${isLive ? 'border-destructive' : 'border-transparent'} p-0.5 bg-background rounded-[var(--radius)] overflow-hidden transition-all duration-300 hover:scale-110 z-10 relative shadow-sm`}
                            title={isOnline ? "点击进入直播间" : "点击跳转抖音主页"}
                        >
                            <img 
                                src={author.avatar || '/default-avatar.png'} 
                                alt={author.nickname}
                                className="w-full h-full object-cover rounded-[calc(var(--radius)-2px)]"
                            />
                        </div>
                        <div className={`absolute -bottom-2 -right-3 px-2 py-0.5 border-2 border-card bg-background font-black text-[10px] tracking-wider rounded-full transition-colors duration-500 z-20 flex items-center shadow-sm ${textColor}`}>
                            {isLive && <span className="inline-block w-1.5 h-1.5 bg-destructive rounded-full mr-1 animate-ping"></span>}
                            {statusText}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center h-16 pl-2">
                        <h3 className={`font-bold text-base truncate transition-colors ${isOnline ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'} uppercase [.theme-pink_&]:normal-case`}>
                            {author.nickname}
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[11px]">
                            <div className="flex flex-col border-l-2 border-primary/30 pl-1.5 transition-colors">
                                <span className="text-muted-foreground origin-left">FOLLOWERS</span>
                                <span className="text-foreground font-bold">{formatNumber(author.follower_count)}</span>
                            </div>
                            <div className={`flex flex-col border-l-2 pl-1.5 transition-colors ${isOnline ? 'border-sky-400/50' : 'border-border'}`}>
                                <span className={`origin-left transition-colors ${isOnline ? 'text-sky-500' : 'text-muted-foreground'}`}>ON_SITE</span>
                                <span className={`transition-colors font-black ${isOnline ? 'text-sky-500' : 'text-muted-foreground'}`}>
                                    {isOnline ? formatNumber(author.user_count) : '---'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 悬停扫描线 - 仅在战术模式显示 */}
                <div className="absolute left-0 top-0 w-full h-[1px] bg-primary/50 opacity-0 group-hover:opacity-100 group-hover:animate-[scanline_2s_linear_infinite] [.theme-pink_&]:hidden z-10"></div>
            </div>
        </Link>
    );
};

export default AuthorCard;
