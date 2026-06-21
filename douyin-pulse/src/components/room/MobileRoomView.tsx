'use client';

import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import ChatList from './ChatList';
import GiftList from './GiftList';
import PkList from './PkList';
import { MessageSquare, Gift, Swords, ArrowUpToLine } from 'lucide-react';

interface MobileRoomViewProps {
    data: any; 
    tab: 'chat' | 'gift' | 'pk';
    setTab: (t: 'chat' | 'gift' | 'pk') => void;
    jumpTime: string | null;
    highlightUid: string | null;
    goToProfile: (e: React.MouseEvent, uid?: string) => void;
    formatTime: (t?: string) => string;
    onReturnToLatest: () => void;
}

export default function MobileRoomView({ 
    data, tab, setTab, jumpTime, highlightUid, goToProfile, formatTime, onReturnToLatest 
}: MobileRoomViewProps) {
    const { handleTouchStart, handleTouchEnd } = useSwipeGesture(tab, setTab);

    return (
        <div 
            className="md:hidden flex-1 flex flex-col overflow-hidden animate-in fade-in duration-300"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="flex border-b border-border bg-card z-10 shrink-0">
                <button 
                    onClick={() => setTab('chat')} 
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${tab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}
                >
                    <MessageSquare className="w-4 h-4"/> 弹幕
                </button>
                <button 
                    onClick={() => setTab('gift')} 
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${tab === 'gift' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}
                >
                    <Gift className="w-4 h-4"/> 礼物
                </button>
                <button 
                    onClick={() => setTab('pk')} 
                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${tab === 'pk' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}
                >
                    <Swords className="w-4 h-4"/> PK
                </button>
            </div>
            
            <div className="flex-1 relative bg-background min-h-0 mt-1">
                {tab === 'chat' && (
                    <div className="absolute inset-0 flex flex-col">
                        <div className="flex-1 min-h-0 relative">
                            <div className="absolute top-2 right-2 z-50 flex gap-2 items-center pointer-events-none">
                                {data.loadingChats && !jumpTime && <span className="text-[10px] uppercase font-black tracking-widest text-primary animate-pulse bg-background/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm border border-border/50">Loading...</span>}
                                {jumpTime && (
                                    <button onClick={onReturnToLatest} className="pointer-events-auto text-xs bg-primary/10 border border-primary/30 text-primary font-bold px-2.5 py-1.5 rounded-md hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 shadow-sm backdrop-blur-md">
                                        <ArrowUpToLine className="w-3 h-3"/> 返回最新
                                    </button>
                                )}
                            </div>
                            <ChatList 
                                chats={data.chats} 
                                loading={data.loadingChats} 
                                onLoadMore={data.loadOldChats} 
                                jumpTime={jumpTime} 
                                highlightUid={highlightUid} 
                                goToProfile={goToProfile} 
                                formatTime={formatTime} 
                            />
                        </div>
                    </div>
                )}
                {tab === 'gift' && (
                    <div className="absolute inset-0 flex flex-col">
                        <div className="flex-1 min-h-0 bg-background/50 relative">
                            <div className="absolute top-2 right-2 z-50 pointer-events-none">
                                 {data.loadingGifts && <span className="text-[10px] uppercase font-black tracking-widest text-primary animate-pulse bg-background/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm border border-border/50">Loading...</span>}
                            </div>
                            <GiftList gifts={data.gifts} loading={data.loadingGifts} onLoadMore={data.loadOldGifts} goToProfile={goToProfile} formatTime={formatTime} />
                        </div>
                    </div>
                )}
                {tab === 'pk' && <PkList roomId={data.roomId} roomUserId={data.roomInfo?.user_id} pks={data.pks} loading={data.loadingPks} onRefreshPks={data.reloadPks} liveStatus={data.roomInfo?.live_status} />}
            </div>
        </div>
    );
}
