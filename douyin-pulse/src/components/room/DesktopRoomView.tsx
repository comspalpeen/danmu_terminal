'use client';
import ChatList from './ChatList';
import GiftList from './GiftList';
import PkList from './PkList';
import { MessageSquare, Swords, Gift, ArrowUpToLine } from 'lucide-react';

interface DesktopRoomViewProps {
    data: any; 
    tab: 'chat' | 'pk';
    setTab: (t: 'chat' | 'pk') => void;
    jumpTime: string | null;
    highlightUid: string | null;
    goToProfile: (e: React.MouseEvent, uid?: string) => void;
    formatTime: (t?: string) => string;
    onReturnToLatest: () => void;
}

export default function DesktopRoomView({ 
    data, tab, setTab, jumpTime, highlightUid, goToProfile, formatTime, onReturnToLatest 
}: DesktopRoomViewProps) {
    return (
       <main className="hidden md:grid flex-1 max-w-7xl w-full mx-auto p-4 grid-cols-3 gap-6 overflow-hidden animate-in fade-in duration-300">
            <div className="col-span-2 bg-card rounded-[var(--radius)] border border-border shadow-sm flex flex-col overflow-hidden relative transition-colors duration-500">
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>

                <div className="flex border-b border-border shrink-0 bg-muted/20 transition-colors duration-500">
                    <button 
                        onClick={() => setTab('chat')} 
                        className={`flex-1 py-2 text-xs md:text-sm font-bold tracking-widest transition-colors flex items-center justify-center gap-2 ${tab === 'chat' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'}`}
                    >
                        <MessageSquare className="w-4 h-4"/> 弹幕
                    </button>
                    <button 
                        onClick={() => setTab('pk')} 
                        className={`flex-1 py-2 text-xs md:text-sm font-bold tracking-widest transition-colors flex items-center justify-center gap-2 ${tab === 'pk' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'}`}
                    >
                        <Swords className="w-4 h-4"/> PK战绩
                    </button>
                </div>
                
                <div className="flex-1 overflow-hidden relative min-h-0">
                    {tab === 'chat' && (
                        <div className="absolute inset-0 flex flex-col">
                            <div className="flex-1 min-h-0 bg-background transition-colors duration-500 relative">
                                <div className="absolute top-3 right-4 z-50 flex gap-2 items-center pointer-events-none">
                                    {data.loadingChats && !jumpTime && <span className="text-[10px] font-black tracking-widest text-primary/50 animate-pulse bg-background/80 px-2 py-1 rounded backdrop-blur-sm">Scanning...</span>}
                                    {jumpTime && (
                                        <button onClick={onReturnToLatest} className="pointer-events-auto text-[10px] font-bold bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-1 rounded-[var(--radius)] shadow-sm backdrop-blur-md">
                                            <ArrowUpToLine className="w-3 h-3"/> SYNC_LATEST
                                        </button>
                                    )}
                                </div>
                                <ChatList chats={data.chats} loading={data.loadingChats} onLoadMore={data.loadOldChats} jumpTime={jumpTime} highlightUid={highlightUid} goToProfile={goToProfile} formatTime={formatTime} />
                            </div>
                        </div>
                    )}
                    {tab === 'pk' && <PkList roomId={data.roomId} roomUserId={data.roomInfo?.user_id} pks={data.pks} loading={data.loadingPks} onRefreshPks={data.reloadPks} liveStatus={data.roomInfo?.live_status}/>}
                </div>
            </div>
            <div className="bg-card rounded-[var(--radius)] border border-border flex flex-col overflow-hidden relative shadow-sm transition-colors duration-500">
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>

                <div className="flex-1 overflow-hidden relative min-h-0 flex flex-col">
                    <div className="p-3 border-b border-border bg-muted/20 flex justify-between items-center h-[48px] shrink-0 z-10 transition-colors duration-500">
                        <span className="font-bold text-xs tracking-widest text-foreground flex items-center gap-2">
                            <Gift className="w-4 h-4 text-primary"/> 礼物
                        </span>
                        <div className="flex gap-2 items-center">
                            {data.loadingGifts && <span className="text-[10px] font-black tracking-widest text-primary/50 animate-pulse">Scanning...</span>}
                        </div>
                    </div>
                    {/* 阅读区：跟随背景变量 */}
                    <div className="flex-1 min-h-0 bg-background transition-colors duration-500">
                        <GiftList gifts={data.gifts} loading={data.loadingGifts} onLoadMore={data.loadOldGifts} goToProfile={goToProfile} formatTime={formatTime} />
                    </div>
                </div>
            </div>
        </main>
    );
}
