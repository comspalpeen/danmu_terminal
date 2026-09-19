'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
    ArrowLeft, Home, ExternalLink, Calendar, Clock, Eye, Gem, 
    Video, Inbox, Search, MessageSquare, Gift, X, Loader2, Copy, ChevronRight, FileQuestion 
} from "lucide-react";
import { openDouyinUser } from '@/lib/douyin-links';

interface Room {
    room_id: string;
    title: string;
    nickname?: string;
    cover_url?: string;
    created_at: string;
    end_time?: string;
    max_viewers: number;
    like_count: number;
    live_status: number; 
    total_diamond_count?: number; 
}

interface AuthorStats {
    totalShows: number;
    recent7DaysRevenue: number; 
    peakViewer: number;
    lastActive: string;
}

export default function AuthorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const sec_uid = params.sec_uid as string;

    // ================= 房间列表与统计状态 =================
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);

    // ================= 独立弹窗搜索状态 =================
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [actualQuery, setActualQuery] = useState('');
    const [searchType, setSearchType] = useState<'chat' | 'gift'>('chat');
    const [resolvedName, setResolvedName] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const observer = useRef<IntersectionObserver | null>(null);
    const loaderRef = useCallback((node: HTMLDivElement) => {
        if (isSearching) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) loadMoreData();
        });
        if (node) observer.current.observe(node);
    }, [isSearching, hasMore]);

    // 初始化获取房间列表
    useEffect(() => {
        if (!sec_uid) return;
        const fetchRooms = async () => {
            try {
                const res = await fetch(`/api/authors/${sec_uid}/rooms?limit=0`);
                if (res.ok) {
                    const data = await res.json();
                    setRooms(data);
                }
            } catch (error) {
                console.error('Fetch error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRooms();
    }, [sec_uid]);

    // 计算统计数据
    const stats: AuthorStats = useMemo(() => {
        if (rooms.length === 0) return { totalShows: 0, recent7DaysRevenue: 0, peakViewer: 0, lastActive: '-' };
        let recent7DaysRevenue = 0;
        let peakViewer = 0;
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        rooms.forEach(r => {
            if (r.max_viewers > peakViewer) peakViewer = r.max_viewers; 
            const roomDate = new Date(r.created_at);
            if (roomDate >= sevenDaysAgo) {
                recent7DaysRevenue += (r.total_diamond_count || 0);
            }
        });

        return {
            totalShows: rooms.length,
            recent7DaysRevenue,
            peakViewer,
            lastActive: rooms[0].created_at 
        };
    }, [rooms]);

    // ================= 搜索相关逻辑 =================

    const fetchSearchResults = async (q: string, type: string, pageNum: number) => {
        if (!q.trim()) return;
        setIsSearching(true);
        setHasSearched(true);
        try {
            const res = await fetch(`/api/authors/${sec_uid}/chats?keyword=${encodeURIComponent(q)}&search_type=${type}&limit=20&page=${pageNum}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length < 20) setHasMore(false);
                else setHasMore(true);
                setSearchResults(prev => pageNum === 1 ? data : [...prev, ...data]);
            }
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setIsSearching(false);
        }
    };

    // 联想防抖
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (keyword.trim().length > 0 && keyword !== actualQuery && keyword !== resolvedName && !keyword.startsWith('MS4')) {
                setIsSearchingUsers(true);
                try {
                    const res = await fetch(`/api/search/users?q=${encodeURIComponent(keyword)}`);
                    if (res.ok) {
                        setSuggestions(await res.json());
                        setShowSuggestions(true);
                    }
                } catch (e) {} finally {
                    setIsSearchingUsers(false);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 1500); 
        return () => clearTimeout(timer);
    }, [keyword]);

    // 点击外部关闭联想
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectUser = (user: any) => {
        setShowSuggestions(false);
        setKeyword(user.user_name);      
        setActualQuery(user.sec_uid); 
        setResolvedName(user.user_name);
        setPage(1);
        setSearchResults([]);
        fetchSearchResults(user.sec_uid, searchType, 1);
    };

    const handleTypeChange = (type: 'chat' | 'gift') => {
        setSearchType(type);
        if (actualQuery) {
            setPage(1);
            setSearchResults([]);
            fetchSearchResults(actualQuery, type, 1);
        }
    };

    const loadMoreData = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchSearchResults(actualQuery, searchType, nextPage);
    };

    const handleSearchSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowSuggestions(false);
        const trimmedKeyword = keyword.trim();
        if (!trimmedKeyword) return;

        let targetQuery = trimmedKeyword;
        let displayKeyword = trimmedKeyword;

        if (trimmedKeyword.startsWith('MS4')) {
            targetQuery = trimmedKeyword;
        } else {
            try {
                setIsSearchingUsers(true);
                const res = await fetch(`/api/search/users?q=${encodeURIComponent(trimmedKeyword)}&limit=1`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        targetQuery = data[0].sec_uid;
                        displayKeyword = data[0].user_name;
                    } else {
                        // 拦截模糊搜索：没找到用户直接返回空，因为后端已不再支持文本搜索
                        setSearchResults([]);
                        setHasSearched(true);
                        setIsSearching(false);
                        return;
                    }
                }
            } catch (error) {
                console.error("智能匹配失败", error);
                return;
            } finally {
                setIsSearchingUsers(false);
            }
        }

        setKeyword(displayKeyword);      
        setActualQuery(targetQuery);  
        setResolvedName(displayKeyword);
        setPage(1);
        setSearchResults([]);
        fetchSearchResults(targetQuery, searchType, 1);
    };

    const handleJumpToContext = (e: React.MouseEvent, item: any) => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;
        const ts = new Date(item.created_at).toISOString();
        router.push(`/room/${item.room_id}?jump_time=${ts}&highlight_uid=${item.sec_uid}`);
    };

    // ================= 辅助函数 =================
    const formatDate = (dateString?: string) => {
        if (!dateString) return '未知时间';
        return new Date(dateString).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const getDuration = (start: string, end?: string) => {
        if (!end) return '直播中...';
        const diffMin = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000 / 60);
        return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
    };

    const formatNum = (num: number) => num >= 10000 ? (num / 10000).toFixed(1) + '万' : (num || 0).toLocaleString();

    return (
        <div className="h-screen bg-background flex flex-col overflow-hidden animate-in fade-in duration-300">
            <header className="bg-card/90 backdrop-blur-md border-b border-border p-3 shadow-sm z-20 shrink-0 relative transition-colors duration-500">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <button onClick={() => router.back()} title="返回上一页" className="text-muted-foreground hover:text-primary hover:bg-primary/10 p-1.5 transition-colors border border-transparent hover:border-primary/30 rounded-[var(--radius)]">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <button onClick={() => router.push('/')} title="返回首页" className="text-muted-foreground hover:text-primary hover:bg-primary/10 p-1.5 transition-colors border border-transparent hover:border-primary/30 rounded-[var(--radius)]">
                                <Home className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex flex-col p-1 -ml-1">
                            <h1 className="font-black text-foreground truncate text-sm md:text-lg tracking-widest uppercase">
                                主播详情
                            </h1>
                            <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                                {rooms.length > 0 ? rooms[0].nickname : 'SYS_LOADING...'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-1 md:justify-end">
                        <Button 
                            onClick={() => setIsSearchModalOpen(true)}
                            className="h-9 px-4 rounded-[var(--radius)] text-sm font-bold shadow-sm flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
                        >
                            <Search className="w-4 h-4" /> 搜索
                        </Button>
                        <Button 
                            onClick={() => openDouyinUser(sec_uid)} 
                            variant="outline" 
                            className="h-9 font-bold rounded-[var(--radius)] px-4 text-sm border-border bg-background hover:bg-muted"
                        >
                            主页 <ExternalLink className="w-4 h-4 ml-1.5" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl w-full mx-auto p-3 flex flex-col gap-4 overflow-hidden">
                
                <Card className="bg-card border-border flex-shrink-0 shadow-sm overflow-hidden">
                    <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center py-3 px-3 bg-primary/5 rounded-xl border border-primary/10">
                                <div className="text-xs text-primary mb-1 font-bold uppercase tracking-widest">实际监控场次</div>
                                <div className="text-3xl font-black text-foreground">{stats.totalShows}</div>
                            </div>
                            <div className="text-center py-3 px-3 bg-secondary/20 rounded-xl border border-secondary/30">
                                <div className="text-xs text-secondary-foreground mb-1 font-bold uppercase tracking-widest">历史最高在线</div>
                                <div className="text-3xl font-black text-foreground">{formatNum(stats.peakViewer)}</div>
                            </div>
                            <div className="text-center py-3 px-3 bg-accent/20 rounded-xl border border-accent/30">
                                <div className="text-xs text-accent-foreground mb-1 font-bold uppercase tracking-widest">近七日营收(钻)</div>
                                <div className="text-3xl font-black text-foreground">{formatNum(stats.recent7DaysRevenue)}</div>
                            </div>
                            <div className="text-center py-3 px-3 bg-muted rounded-xl border border-border flex flex-col justify-center">
                                <div className="text-xs text-muted-foreground mb-1 font-bold uppercase tracking-widest">最近开播</div>
                                <div className="text-base md:text-xl font-black text-foreground mt-1">
                                    {stats.lastActive !== '-' ? new Date(stats.lastActive).toLocaleDateString() : '-'}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="pb-2 text-sm font-black uppercase text-foreground flex items-center gap-2 border-b border-border/50">
                    <Video className="w-4 h-4 text-primary"/> 直播记录
                </div>

                <div className="flex-1 overflow-y-scroll pr-2 space-y-3 pb-6 custom-scrollbar">
                    {loading ? (
                        <div className="text-center py-10 text-muted-foreground font-bold animate-pulse tracking-widest uppercase">数据加载中...</div>
                    ) : rooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Inbox className="w-10 h-10 mb-3 opacity-30"/>
                            <span className="font-bold tracking-widest uppercase">暂无监控记录</span>
                        </div>
                    ) : (
                        rooms.map((room) => (
                            <Card key={room.room_id} onClick={() => router.push(`/room/${room.room_id}`)} className="group bg-card border-border cursor-pointer hover:shadow-md hover:border-primary/50 transition-all overflow-hidden">
                                <div className="py-2 px-3 flex gap-4"> 
                                    <div className="w-36 h-24 bg-muted rounded-lg flex-shrink-0 overflow-hidden relative border border-border">
                                        <img 
                                            src={room.cover_url || '/cover.png'} 
                                            alt="cover" 
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                                            onError={(e) => { e.currentTarget.src = '/cover.png'; e.currentTarget.onerror = null; }}
                                        />
                                        {room.live_status === 1 && <Badge variant="destructive" className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-black animate-pulse">LIVE</Badge>}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                                        <div>
                                            <h3 className="font-black text-foreground truncate text-sm md:text-base group-hover:text-primary transition-colors">{room.title || '无标题直播'}</h3>
                                            <div className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-3 font-medium">
                                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {formatDate(room.created_at)}</span>
                                                <span className="bg-muted px-2 py-0.5 rounded-md text-foreground flex items-center gap-1 border border-border"><Clock className="w-3 h-3"/> {getDuration(room.created_at, room.end_time)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs mt-2">
                                            <span className="flex items-center gap-1.5 text-secondary-foreground font-black bg-secondary/10 px-2.5 py-1 rounded-md border border-secondary/20"><Eye className="w-3.5 h-3.5"/> {formatNum(room.max_viewers)}</span>
                                            <span className="flex items-center gap-1.5 text-accent-foreground font-black bg-accent/10 px-2.5 py-1 rounded-md border border-accent/20"><Gem className="w-3.5 h-3.5"/> {formatNum(room.total_diamond_count || 0)}</span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </main>
            {isSearchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-6 animate-in fade-in duration-200">
                    <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative" ref={searchRef}>
                        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
                            <h2 className="text-lg font-black tracking-widest uppercase flex items-center gap-2">
                                <Search className="w-5 h-5 text-primary" /> 房间检索
                            </h2>
                            <button onClick={() => setIsSearchModalOpen(false)} className="text-muted-foreground hover:text-destructive transition-colors p-1 bg-background rounded-full border border-border shadow-sm">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 border-b border-border bg-background z-20 shrink-0">
                            <div className="flex flex-col md:flex-row gap-4 items-center">
                                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full relative">
                                    <div className="relative flex-1 group">
                                        {isSearchingUsers ? (
                                            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
                                        ) : (
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                        )}
                                        <Input 
                                            type="text" 
                                            className="w-full h-11 pl-12 pr-4 rounded-xl border-border bg-muted text-base focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background transition-colors"
                                            placeholder="搜用户名(自动联想)"
                                            value={keyword}
                                            onChange={e => {
                                                setKeyword(e.target.value);
                                                setResolvedName('');
                                            }}
                                            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                        />
                                    </div>
                                    <Button type="submit" className="h-11 px-8 rounded-xl font-bold shadow-sm whitespace-nowrap">检索</Button>
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-14 left-0 w-[calc(100%-100px)] bg-card border border-primary/50 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-72 overflow-y-auto">
                                            <div className="text-[10px] text-muted-foreground bg-muted/50 px-4 py-2 font-mono border-b border-border font-bold">MATCHED_USERS</div>
                                            {suggestions.map((u) => (
                                                <div key={u.sec_uid} onClick={() => handleSelectUser(u)} className="flex items-center gap-3 px-4 py-3 hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/30 last:border-none">
                                                    <img src={u.avatar_url || '/default-avatar.png'} alt="" className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0" />
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-bold text-foreground truncate">{u.user_name}</span>
                                                            {u.pay_grade > 0 && <img src={`https://p3-webcast.douyinpic.com/img/webcast/new_user_grade_level_v1_${u.pay_grade}.png~tplv-obj.image`} alt="" className="h-3.5 w-auto object-contain" />}
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground font-mono truncate bg-muted px-1.5 py-0.5 rounded w-fit mt-0.5">{u.sec_uid}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </form>

                                <div className="flex bg-muted p-1 rounded-xl w-full md:w-fit">
                                    <button onClick={() => handleTypeChange('chat')} className={`flex-1 md:flex-none flex justify-center items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${searchType === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                                        <MessageSquare className="w-4 h-4" /> 弹幕
                                    </button>
                                    <button onClick={() => handleTypeChange('gift')} className={`flex-1 md:flex-none flex justify-center items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${searchType === 'gift' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                                        <Gift className="w-4 h-4" /> 礼物
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-muted/10 custom-scrollbar relative">
                            {isSearching && page === 1 ? (
                                <div className="text-center py-20 flex flex-col items-center">
                                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                                    <p className="font-bold tracking-widest text-sm uppercase text-muted-foreground">检索网络架构中...</p>
                                </div>
                            ) : hasSearched && searchResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                    <FileQuestion className="w-12 h-12 mb-4 opacity-30"/>
                                    <span className="font-bold text-lg tracking-widest uppercase">未找到匹配的记录</span>
                                    <span className="text-xs mt-2 opacity-50 text-center max-w-sm">非精确UID搜索为了保护数据库，仅检索近30天的数据。</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {searchResults.map((item, idx) => (
                                        <Card key={idx} onClick={(e) => handleJumpToContext(e, item)} className="group bg-card border-border cursor-pointer hover:shadow-md hover:border-primary/50 transition-all overflow-hidden">
                                            <CardContent className="p-3 flex gap-3 items-start">
                                                <img src={item.avatar_url || '/default-avatar.png'} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-border shadow-sm flex-shrink-0"/>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-black text-foreground text-sm group-hover:text-primary transition-colors">{item.user_name}</span>
                                                                {item.pay_grade_icon && <img src={item.pay_grade_icon} alt="level" className="h-4 w-auto object-contain" />}
                                                                {item.fans_club_icon && <img src={item.fans_club_icon} alt="fans" className="h-4 w-auto object-contain" />}
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-bold tracking-tight text-muted-foreground whitespace-nowrap bg-muted px-2 py-0.5 rounded-md border border-border">{formatDate(item.created_at)}</span>
                                                    </div>

                                                    {searchType === 'gift' ? (
                                                        <div className="bg-orange-500/10 border border-orange-500/30 px-3 py-2 rounded-lg text-sm text-orange-500/90 leading-relaxed shadow-inner flex items-center gap-2">
                                                            {item.gift_icon && <img src={item.gift_icon} alt="gift" className="w-5 h-5 object-contain" />}
                                                            <span className="font-bold truncate">送出了 {item.content}
                                                                {item.gift_count && item.gift_count > 0 && (
                                                                    <span className="font-black text-orange-600 ml-1 drop-shadow-sm">x{item.gift_count}</span>
                                                                )}</span>
                                                            <span className="ml-auto font-mono font-black text-xs opacity-70 flex-shrink-0">💎 {item.total_diamond_count}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-muted/50 border border-border/50 px-3 py-2 rounded-lg text-sm text-foreground/90 break-all leading-relaxed shadow-inner">
                                                            {item.content}
                                                        </div>
                                                    )}

                                                    <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
                                                        <ChevronRight className="w-3 h-3" />
                                                        <span>跳转至现场</span>
                                                        <span className="bg-accent/10 text-accent-foreground px-1.5 py-0.5 rounded ml-1 truncate max-w-[150px]">{item.room_title || '直播回放'}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    
                                    {searchResults.length > 0 && hasMore && (
                                        <div ref={loaderRef} className="py-6 flex items-center justify-center text-muted-foreground">
                                            <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" />
                                            <span className="text-xs font-bold tracking-widest uppercase">加载更多...</span>
                                        </div>
                                    )}
                                    {searchResults.length > 0 && !hasMore && (
                                        <div className="py-8 text-center text-xs font-black tracking-widest uppercase text-muted-foreground/50 border-t border-border mt-4">- 到底了 -</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
