'use client';

import { useState, useEffect, Suspense, useRef, useCallback } from 'react'; 
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Home, Search, ChevronRight, Copy, Loader2, FileQuestion, MessageSquare, Gift } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SearchResult {
    user_name: string;
    sec_uid: string;
    avatar_url: string;
    content: string; 
    created_at: string;
    event_time?: string;
    send_time?: string;
    room_id: string;
    anchor_name: string;
    room_title: string;
    room_cover: string;
    pay_grade_icon?: string;
    fans_club_icon?: string;
    total_diamond_count?: number; 
    gift_icon?: string; 
    gift_count?: number;
}

interface UserSuggestion {
    user_name: string;
    sec_uid: string;
    avatar_url?: string;
    pay_grade?: number;
}

function SearchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    
    // 从 URL 获取参数，解决刷新后输入框变成 UID 的问题
    const urlUid = searchParams.get('q') || '';
    const urlName = searchParams.get('name') || '';

    // UI 状态
    const [keyword, setKeyword] = useState(urlName || urlUid); // 输入框显示的值（优先显名字）
    const [actualQuery, setActualQuery] = useState(urlUid);    // 底层实际去搜索的 UID
    const [resolvedName, setResolvedName] = useState(urlName || urlUid);
    const [searchType, setSearchType] = useState<'chat' | 'gift'>('chat'); 
    
    // 下拉联想状态
    const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // 结果状态
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    
    // 无限滚动
    const observer = useRef<IntersectionObserver | null>(null);
    const loaderRef = useCallback((node: HTMLDivElement) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) loadMoreData();
        });
        if (node) observer.current.observe(node);
    }, [loading, hasMore]);

    // 核心拉取结果函数 (前端增加防御，只允许精确 UID 发起大表查询)
    const fetchSearchResults = async (q: string, type: string, pageNum: number) => {
        if (!q.trim() || !q.startsWith('MS4')) {
            setLoading(false);
            setHasSearched(true);
            setHasMore(false);
            setResults([]);
            return;
        }
        
        setLoading(true);
        setHasSearched(true);
        try {
            const res = await fetch(`/api/search/global?keyword=${encodeURIComponent(q)}&search_type=${type}&limit=20&page=${pageNum}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length < 20) setHasMore(false);
                else setHasMore(true);
                setResults(prev => pageNum === 1 ? data : [...prev, ...data]);
            }
        } catch (e) {
            console.error("搜索异常", e);
        } finally {
            setLoading(false);
        }
    };

    // 初始化检查 URL：只有在首次装载或 URL 的 UID 真正改变时才查询
    useEffect(() => {
        if (urlUid && urlUid.startsWith('MS4')) {
            setActualQuery(urlUid);
            setKeyword(urlName || urlUid);
            setResolvedName(urlName || urlUid);
            setPage(1);       
            setHasMore(true); 
            fetchSearchResults(urlUid, searchType, 1);
        }
    }, [searchParams]);

    // 2000ms 防抖的用户联想逻辑
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

    // 点击外部关闭下拉框
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 选中联想用户 -> 锁定 UID 并直接触发搜索
    const handleSelectUser = (user: UserSuggestion) => {
        setShowSuggestions(false);
        setKeyword(user.user_name);      
        setActualQuery(user.sec_uid);    
        setResolvedName(user.user_name);
        // 带着 UID 和 名字 更改 URL，防止刷新丢失
        router.push(`/search?q=${encodeURIComponent(user.sec_uid)}&name=${encodeURIComponent(user.user_name)}`);
        
        setPage(1);
        setResults([]);
        fetchSearchResults(user.sec_uid, searchType, 1);
    };

    // 切换类型(弹幕/礼物) -> 自动用当前的 query 重新搜索
    const handleTypeChange = (type: 'chat' | 'gift') => {
        setSearchType(type);
        if (actualQuery && actualQuery.startsWith('MS4')) {
            setPage(1);
            setResults([]);
            fetchSearchResults(actualQuery, type, 1);
        }
    };

    const loadMoreData = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchSearchResults(actualQuery, searchType, nextPage);
    };

    // 用户直接敲回车（智能匹配最高财富等级用户）
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowSuggestions(false);
        const trimmedKeyword = keyword.trim();
        if (!trimmedKeyword) return;

        // 如果用户直接粘贴的是 UID，直接搜
        if (trimmedKeyword.startsWith('MS4')) {
            router.push(`/search?q=${encodeURIComponent(trimmedKeyword)}`);
            return;
        }

        let targetUid = trimmedKeyword;
        let targetName = trimmedKeyword;

        try {
            setIsSearchingUsers(true);
            const res = await fetch(`/api/search/users?q=${encodeURIComponent(trimmedKeyword)}&limit=1`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    targetUid = data[0].sec_uid;
                    targetName = data[0].user_name;
                } else {
                    // 找不到用户直接拦截，因为后端已经不支持非 UID 搜索了
                    setResults([]);
                    setHasSearched(true);
                    setLoading(false);
                    return;
                }
            }
        } catch (error) {
            console.error("匹配失败", error);
            return;
        } finally {
            setIsSearchingUsers(false);
        }

        setKeyword(targetName);      
        setActualQuery(targetUid);   
        setResolvedName(targetName);
        router.push(`/search?q=${encodeURIComponent(targetUid)}&name=${encodeURIComponent(targetName)}`);
    };

    // 跳转到现场
    const getResultTime = (item: SearchResult) => {
        return searchType === 'gift' ? (item.send_time || item.created_at) : (item.event_time || item.created_at);
    };

    const handleJumpToContext = (e: React.MouseEvent, item: SearchResult) => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;
        const ts = new Date(getResultTime(item)).toISOString();
        router.push(`/room/${item.room_id}?jump_time=${ts}&highlight_uid=${item.sec_uid}`);
    };

    // 复制 UID
    const handleCopyUid = async (e: React.MouseEvent, uid: string) => {
        e.stopPropagation();
        e.preventDefault();
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(uid);
                alert(`✅ 复制成功！\nUID: ${uid}`);
                return;
            } catch (err) {}
        }
        const textArea = document.createElement("textarea");
        textArea.value = uid;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy') ? alert(`✅ 复制成功！\nUID: ${uid}`) : prompt("复制失败，请手动复制:", uid);
        } catch (err) {
            prompt("复制失败，请手动复制:", uid);
        } finally {
            document.body.removeChild(textArea);
        }
    };

    const formatTime = (t: string) => new Date(t).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md pb-4 pt-2 border-b border-border/50 mb-6" ref={searchRef}>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={() => router.push('/')} className="rounded-xl h-12 w-12 shrink-0 border-border" title="返回首页">
                            <Home className="w-5 h-5 text-foreground" />
                        </Button>
                        <form onSubmit={handleSubmit} className="flex-1 flex gap-2 relative">
                            <div className="relative flex-1 group">
    {isSearchingUsers ? (
        <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
    ) : (
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
    )}
    <Input 
        type="text" 
        className="w-full h-12 !pl-12 pr-4 rounded-xl border-border bg-card text-base focus-visible:ring-1 focus-visible:ring-primary shadow-sm"
        placeholder="搜用户名/sec_uid..."
        value={keyword}
        onChange={e => {
            setKeyword(e.target.value);
            setResolvedName(''); 
        }}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
    />
                            </div>
                            <Button type="submit" className="h-12 px-8 rounded-xl font-bold shadow-sm whitespace-nowrap">搜 索</Button>
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-14 left-0 w-[calc(100%-100px)] bg-card border border-primary/50 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-72 overflow-y-auto">
                                    <div className="text-[10px] text-muted-foreground bg-muted/50 px-4 py-2 font-mono border-b border-border font-bold">MATCHED_USERS</div>
                                    {suggestions.map((u) => (
                                        <div 
                                            key={u.sec_uid}
                                            onClick={() => handleSelectUser(u)}
                                            className="flex items-center gap-3 px-4 py-3 hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/30 last:border-none"
                                        >
                                            <img src={u.avatar_url || '/default-avatar.png'} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0" />
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-bold text-foreground truncate">{u.user_name}</span>
                                                    {/* 动态拼接财富等级图标 */}
                                                    {(u.pay_grade ?? 0) > 0 && (
                                                        <img 
                                                            src={`https://p3-webcast.douyinpic.com/img/webcast/new_user_grade_level_v1_${u.pay_grade}.png~tplv-obj.image`} 
                                                            alt={`等级 ${u.pay_grade}`} 
                                                            referrerPolicy="no-referrer"
                                                            className="h-4 w-auto object-contain drop-shadow-sm" 
                                                        />
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-muted-foreground font-mono truncate bg-muted px-1.5 py-0.5 rounded w-fit mt-1">
                                                    {u.sec_uid}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </form>
                    </div>
                    <div className="flex bg-muted p-1 rounded-xl w-fit self-start ml-[60px]">
                        <button 
                            onClick={() => handleTypeChange('chat')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${searchType === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <MessageSquare className="w-4 h-4" /> 弹幕
                        </button>
                        <button 
                            onClick={() => handleTypeChange('gift')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${searchType === 'gift' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Gift className="w-4 h-4" /> 礼物
                        </button>
                    </div>
                </div>
            </div>
            {loading && page === 1 && (
                <div className="text-center py-32 flex flex-col items-center">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <p className="font-bold tracking-widest text-sm uppercase text-muted-foreground">loading...</p>
                </div>
            )}

            {!loading && hasSearched && results.length === 0 && (
                <Card className="bg-muted/30 border-dashed border-2 shadow-none border-border">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <FileQuestion className="w-12 h-12 mb-4 opacity-30"/>
                        <span className="font-bold text-lg tracking-widest">未找到匹配的{searchType === 'chat' ? '发言' : '送礼'}记录</span>
                    </CardContent>
                </Card>
            )}
            <div className="space-y-4 pb-10">
                {results.map((item, idx) => (
                    <Card key={`${item.room_id}-${getResultTime(item)}-${idx}`} onClick={(e) => handleJumpToContext(e, item)} className="group bg-card border-border shadow-sm hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer overflow-hidden">
                        <CardContent className="p-4 flex gap-4 items-start">
                            <div className="hidden md:block w-32 h-20 relative flex-shrink-0 rounded-lg overflow-hidden bg-muted border border-border">
                                {item.room_cover ? <Image src={item.room_cover} alt="cover" fill unoptimized={true} referrerPolicy="no-referrer" className="object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black tracking-widest uppercase text-muted-foreground">无封面</div>}
                                <div className="absolute bottom-0 w-full bg-background/80 backdrop-blur-sm text-foreground text-[10px] font-bold text-center py-1 truncate px-2 border-t border-border">{item.anchor_name}</div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-10 h-10 flex-shrink-0">
                                            <Image src={item.avatar_url || '/default-avatar.png'} alt="avatar" fill unoptimized={true} referrerPolicy="no-referrer" className="rounded-full object-cover border border-border shadow-sm"/>
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-black text-foreground text-sm md:text-base group-hover:text-primary transition-colors">{item.user_name}</span>
                                                {item.pay_grade_icon && <img src={item.pay_grade_icon} alt="level" referrerPolicy="no-referrer" className="h-4 w-auto object-contain drop-shadow-sm" />}
                                                {item.fans_club_icon && <img src={item.fans_club_icon} alt="fans" referrerPolicy="no-referrer" className="h-4 w-auto object-contain drop-shadow-sm" />}
                                            </div>
                                            {item.sec_uid && (
                                                <div className="flex items-center mt-1">
                                                    <span className="text-[10px] text-muted-foreground font-mono font-bold bg-muted px-2 py-0.5 rounded-md flex items-center gap-2 border border-border">
                                                        UID: {item.sec_uid.slice(0, 6)}...{item.sec_uid.slice(-4)}
                                                        <button onClick={(e) => handleCopyUid(e, item.sec_uid)} className="text-primary hover:text-primary/80 transition-colors px-1" title="复制完整 UID"><Copy className="w-3 h-3" /></button>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold tracking-tight text-muted-foreground whitespace-nowrap bg-muted px-2.5 py-1 rounded-full border border-border">{formatTime(getResultTime(item))}</span>
                                </div>
                                {searchType === 'gift' ? (
                                    <div className="bg-orange-500/10 border border-orange-500/30 px-3.5 py-2.5 rounded-lg text-sm text-orange-500/90 break-all leading-relaxed shadow-inner flex items-center gap-2">
                                        {item.gift_icon && <img src={item.gift_icon} alt="gift" referrerPolicy="no-referrer" className="w-6 h-6 object-contain" />}
                                        <span className="font-bold">送出了 {item.content} 
                                            {item.gift_count && item.gift_count > 0 && (
                                                <span className="font-black text-orange-600 ml-1 drop-shadow-sm">x{item.gift_count}</span>
                                            )}
                                        </span>
                                        <span className="ml-auto font-mono font-black text-xs opacity-70">💎 {item.total_diamond_count}</span>
                                    </div>
                                ) : (
                                    <div className="bg-muted/50 border border-border/50 px-3.5 py-2.5 rounded-lg text-sm text-foreground/90 break-all leading-relaxed shadow-inner">
                                        {item.content}
                                    </div>
                                )}

                                <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
                                    <ChevronRight className="w-4 h-4" />
                                    <span>跳转至现场 &middot; 来自 <span className="text-foreground group-hover:text-primary underline decoration-border group-hover:decoration-primary/30 underline-offset-2">{item.anchor_name}</span> 的直播间</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {results.length > 0 && hasMore && (
                    <div ref={loaderRef} className="py-8 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" />
                        <span className="text-xs font-bold tracking-widest uppercase">加载更多...</span>
                    </div>
                )}
                
                {results.length > 0 && !hasMore && (
                    <div className="py-12 text-center text-xs font-black tracking-widest uppercase text-muted-foreground/50 border-t border-border mt-8">- END OF RESULTS -</div>
                )}
            </div>
        </div>
    );
}

export default function GlobalSearchPage() {
    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <Suspense fallback={
                <div className="flex h-screen items-center justify-center flex-col">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <div className="text-muted-foreground font-bold tracking-widest text-sm uppercase">组件初始化中...</div>
                </div>
            }>
                <SearchContent />
            </Suspense>
        </div>
    );
}
