'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RoomDetail, SearchTarget } from '@/types/room';
import { ArrowLeft, Home, ChevronRight, X, Filter, Gem, Heart, Medal, Clock } from 'lucide-react';

interface RoomHeaderProps {
    roomInfo: RoomDetail | null | undefined;
    searchState: any; 
    actions: any;
    onOpenStats: () => void;
}

export default function RoomHeader({ roomInfo, searchState, actions, onOpenStats }: RoomHeaderProps) {
    const router = useRouter();
    const { 
        searchTarget, setSearchTarget, 
        inputSearch, setInputSearch, appliedSearch,
        minPriceInput, setMinPriceInput,
        enableMinPrice, setEnableMinPrice,
        filterGender, setFilterGender,
        filterMinPayGrade, setFilterMinPayGrade,
        filterMinFansLevel, setFilterMinFansLevel,
        filterStartTime, setFilterStartTime,
        filterEndTime, setFilterEndTime
    } = searchState;

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isLive = roomInfo?.live_status === 1;

    const getAvgOnline = () => {
        if (!roomInfo) return 0;
        const startStr = typeof roomInfo.created_at === 'string' ? roomInfo.created_at : (roomInfo.created_at as any)?.$date;
        const endStr = roomInfo.end_time ? (typeof roomInfo.end_time === 'string' ? roomInfo.end_time : (roomInfo.end_time as any).$date) : undefined;
        if (!startStr) return 0;

        const start = new Date(startStr).getTime();
        const end = isLive ? Date.now() : (endStr ? new Date(endStr).getTime() : Date.now());
        const duration = (end - start) / 1000;
        if (duration <= 0) return 0;
        const totalSeconds = roomInfo.total_watch_time_sec || 0;
        return Math.floor(totalSeconds / duration);
    };

    const headerStatLabel = isLive ? "当前在线" : "平均在线";
    const headerStatValue = isLive ? (roomInfo?.user_count || 0) : getAvgOnline(); 
    
    const hasActiveFilters = filterGender !== null || filterMinPayGrade > 0 || filterMinFansLevel > 0 || !!filterStartTime || !!filterEndTime;

    const handleTimeBlur = (val: string, setter: (v: string) => void) => {
        if (!val || !roomInfo?.created_at) return;
        
        let startStr = typeof roomInfo.created_at === 'string' ? roomInfo.created_at : (roomInfo.created_at as any).$date;
        let endStr = roomInfo.end_time ? (typeof roomInfo.end_time === 'string' ? roomInfo.end_time : (roomInfo.end_time as any).$date) : undefined;
        if (!startStr) return;

        startStr = startStr.replace('Z', '');
        endStr = endStr ? endStr.replace('Z', '') : undefined;

        const startT = new Date(startStr).getTime();
        const endT = endStr ? new Date(endStr).getTime() : Date.now();
        const [hours, minutes] = val.split(':').map(Number);
        
        if (isNaN(hours) || isNaN(minutes) || isNaN(startT)) return;

        const baseDate = new Date(startStr);
        baseDate.setHours(hours, minutes, 0, 0); 
        
        const candidates = [
            baseDate.getTime() - 86400000, 
            baseDate.getTime(),            
            baseDate.getTime() + 86400000  
        ];
        
        let best = candidates.find(c => c >= startT && c <= endT);
        
        if (!best) {
            let minDistance = Infinity;
            let closest = candidates[1];
            for (const c of candidates) {
                const distToStart = Math.abs(c - startT);
                const distToEnd = Math.abs(c - endT);
                const minDist = Math.min(distToStart, distToEnd);
                if (minDist < minDistance) {
                    minDistance = minDist;
                    closest = c;
                }
            }
            best = closest < startT ? startT : (closest > endT ? endT : closest);
        }
        
        const safeDate = new Date(best);
        const hh = String(safeDate.getHours()).padStart(2, '0');
        const mm = String(safeDate.getMinutes()).padStart(2, '0');
        setter(`${hh}:${mm}`); 
    };

    return (
        // 核心对齐：外层 padding 和结构与 sec_uid 页面完全统一
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
                    
                    <div className="flex flex-col cursor-pointer group p-1 -ml-1 transition-colors rounded-[var(--radius)] hover:bg-muted/50" onClick={onOpenStats}>
                        <div className="flex items-center gap-1">
                            <h1 className="font-black text-foreground truncate max-w-[150px] text-sm md:text-lg group-hover:text-primary transition-colors tracking-widest uppercase">
                                {/* 这里用的是 roomInfo，而不是 rooms */}
                                {roomInfo?.nickname || 'SYS_LOADING...'}
                            </h1>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <span className={`text-[10px] flex items-center gap-1.5 font-bold tracking-widest uppercase ${isLive ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {isLive && <span className="w-1.5 h-1.5 bg-destructive animate-pulse rounded-full"></span>}
                            {headerStatLabel}: <span className="text-xs font-mono normal-case">{headerStatValue.toLocaleString()}</span>
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-1 md:justify-end">
                    <div className="flex gap-0 w-full md:w-auto items-stretch h-9 shadow-sm rounded-[var(--radius)] overflow-hidden border border-input focus-within:ring-1 focus-within:ring-primary transition-all duration-500 bg-background">
                        <select 
                            value={searchTarget} 
                            onChange={(e) => setSearchTarget(e.target.value as SearchTarget)} 
                            className="bg-muted text-foreground text-xs md:text-sm px-2 border-r border-border outline-none font-medium cursor-pointer transition-colors duration-500"
                        >
                            <option value="all">全部</option>
                            <option value="chat">弹幕</option>
                            <option value="gift">礼物</option>
                        </select>
                        <div className="relative flex-1 md:w-48 bg-transparent">
                            <input 
                                type="text" 
                                className="block w-full h-full p-2 pr-7 text-base md:text-sm text-foreground bg-transparent focus:outline-none placeholder:text-muted-foreground font-mono" 
                                placeholder="关键词..." 
                                value={inputSearch} 
                                onChange={(e) => setInputSearch(e.target.value)} 
                                onKeyDown={actions.handleKeyDown} 
                            />
                            {inputSearch && (
                                <button onClick={() => setInputSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <button onClick={actions.handleSearch} className="px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs md:text-sm font-bold transition-colors">
                            搜索
                        </button>
                        
                        <button 
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`px-3 flex items-center justify-center transition-colors border-l border-border ${
                                hasActiveFilters || isFilterOpen
                                ? 'bg-primary/10 text-primary' 
                                : 'bg-muted text-muted-foreground hover:bg-muted-foreground/10'
                            }`} 
                        >
                            <Filter className="w-4 h-4" />
                        </button>

                        <button 
                            onClick={actions.handleReset} 
                            disabled={!appliedSearch && !hasActiveFilters} 
                            className={`px-3 text-xs md:text-sm font-bold border-l border-border transition-colors ${
                                appliedSearch || hasActiveFilters
                                ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer' 
                                : 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed'
                            }`}
                        >
                            重置
                        </button>
                    </div>

                    <div className={`flex items-center rounded-[var(--radius)] px-2 border h-9 transition-colors duration-500 shadow-sm ${enableMinPrice ? 'bg-accent/10 border-accent/30' : 'bg-muted border-border'}`}>
                        <input type="checkbox" checked={enableMinPrice} onChange={(e) => setEnableMinPrice(e.target.checked)} className="mr-1.5 accent-accent" />
                        <Gem className={`w-3 h-3 mr-1 ${enableMinPrice ? 'text-accent-foreground' : 'text-muted-foreground'}`} />
                        <span className={`text-xs font-bold mr-1 ${enableMinPrice ? 'text-accent-foreground' : 'text-muted-foreground'}`}>&gt;</span>
                        <input 
                            type="number" 
                            className={`w-14 md:w-16 bg-transparent text-xs outline-none font-black ${enableMinPrice ? 'text-accent-foreground' : 'text-muted-foreground'}`} 
                            value={minPriceInput} 
                            onChange={(e) => setMinPriceInput(Number(e.target.value))} 
                        />
                    </div>
                </div>
            </div>
            {isFilterOpen && (
                <div ref={filterRef} className="absolute top-full right-2 mt-2 w-72 bg-card rounded-xl shadow-2xl border border-border p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <h3 className="text-sm font-black text-foreground mb-4 flex justify-between items-center tracking-widest uppercase">
                        高级筛选条件
                        <span className="text-xs font-bold text-primary cursor-pointer hover:underline normal-case tracking-normal" onClick={actions.handleReset}>清空全部</span>
                    </h3>
                    
                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-bold text-muted-foreground block mb-2 uppercase tracking-wider">性别</label>
                            <div className="flex bg-muted rounded-lg p-1 border border-border/50">
                                {[
                                    { val: null, label: '全部' },
                                    { val: 1, label: '男' },
                                    { val: 2, label: '女' }
                                ].map((opt) => (
                                    <button
                                        key={String(opt.val)}
                                        onClick={() => setFilterGender(opt.val)}
                                        className={`flex-1 py-1.5 text-xs rounded-md transition-all font-bold ${
                                            filterGender === opt.val 
                                            ? 'bg-background shadow-sm text-primary' 
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">最低消费等级</label>
                                <div className="flex items-center border border-input rounded-lg px-2.5 bg-background focus-within:ring-1 focus-within:ring-ring transition-shadow">
                                    <Medal className="w-3.5 h-3.5 text-primary mr-1.5" />
                                    <input 
                                        type="number" 
                                        className="w-full bg-transparent text-sm py-2 outline-none font-bold text-foreground placeholder:text-muted-foreground" 
                                        placeholder="0"
                                        value={filterMinPayGrade || ''}
                                        onChange={(e) => setFilterMinPayGrade(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">最低粉丝团</label>
                                <div className="flex items-center border border-input rounded-lg px-2.5 bg-background focus-within:ring-1 focus-within:ring-ring transition-shadow">
                                    <Heart className="w-3.5 h-3.5 text-destructive mr-1.5" />
                                    <input 
                                        type="number" 
                                        className="w-full bg-transparent text-sm py-2 outline-none font-bold text-foreground placeholder:text-muted-foreground" 
                                        placeholder="0"
                                        value={filterMinFansLevel || ''}
                                        onChange={(e) => setFilterMinFansLevel(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">时段筛选 (静默匹配跨天)</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center border border-input rounded-lg px-2.5 bg-background focus-within:ring-1 focus-within:ring-ring transition-shadow">
                                    <Clock className="w-3.5 h-3.5 text-primary mr-1.5" />
                                    <input 
                                        type="time" 
                                        className="w-full bg-transparent text-sm py-2 outline-none font-bold text-foreground" 
                                        value={filterStartTime || ''}
                                        onChange={(e) => setFilterStartTime(e.target.value)}
                                        onBlur={(e) => handleTimeBlur(e.target.value, setFilterStartTime)}
                                    />
                                </div>
                                <div className="flex items-center border border-input rounded-lg px-2.5 bg-background focus-within:ring-1 focus-within:ring-ring transition-shadow">
                                    <Clock className="w-3.5 h-3.5 text-destructive mr-1.5" />
                                    <input 
                                        type="time" 
                                        className="w-full bg-transparent text-sm py-2 outline-none font-bold text-foreground" 
                                        value={filterEndTime || ''}
                                        onChange={(e) => setFilterEndTime(e.target.value)}
                                        onBlur={(e) => handleTimeBlur(e.target.value, setFilterEndTime)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
