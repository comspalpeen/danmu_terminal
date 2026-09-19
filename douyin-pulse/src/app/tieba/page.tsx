"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

import { 
  Search, Activity, Users, MessageSquare, Target, 
  ShieldCheck, Wifi, Settings2, LayoutList, Rows3,ChevronLeft 
} from "lucide-react";
import { TiebaFeedItem } from "@/types/tieba";
const HighlightText = ({ text, keyword }: { text: string; keyword: string }) => {
  if (!keyword) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${keyword})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <span key={i} className="text-primary font-bold bg-primary/20 px-1 rounded-sm">{part}</span>
        ) : part
      )}
    </span>
  );
};
const RichTextRenderer = ({ rawContents, fallbackText, keyword }: { rawContents?: string, fallbackText: string, keyword: string }) => {
  // 如果没有结构化数据，兜底使用纯文本高亮
  if (!rawContents) return <HighlightText text={fallbackText} keyword={keyword} />;
  
  try {
    const parsed = JSON.parse(rawContents);
    
    return (
      <div className="space-y-2">
        {parsed.map((item: any, idx: number) => {
          // 1. 纯文本处理 (继承你的高亮逻辑)
          if (item.type === 'text') {
            return <HighlightText key={idx} text={item.text} keyword={keyword} />;
          }
          
          // 2. 图片处理 (防盗链 + 圆角战术风格)
          if (item.type === 'image') {
            return (
              <div key={idx} className="mt-2 relative inline-block">
                <img 
                  src={item.src} 
                  alt="情报图片" 
                  className="max-w-full sm:max-w-md rounded-md border-2 border-border/50 shadow-sm"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              </div>
            );
          }
          
          // 3. 表情处理 (优雅降级为文字)
          if (item.type === 'emoji') {
            return (
              <span key={idx} className="text-muted-foreground/70 text-xs mx-0.5 font-bold">
                [{item.desc}]
              </span>
            );
          }
          
          // 未知类型忽略
          return null;
        })}
      </div>
    );
  } catch (error) {
    // JSON 解析失败则兜底纯文本
    return <HighlightText text={fallbackText} keyword={keyword} />;
  }
};
export default function TiebaMonitorPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [stats, setStats] = useState({ new_threads: 0, new_posts: 0, new_comments: 0, active_users: 0 });
  
  const [feedData, setFeedData] = useState<TiebaFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [initialLoaded, setInitialLoaded] = useState(false);
  const LIMIT = 5;
  const isRestoringRef = useRef(false);
  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/tieba/stats`);
      const data = await res.json();
      setStats(data);
    } catch (error) {}
  };

  const fetchFeed = async (kw: string, pageNum: number, mode: string) => {
    setLoading(true);
    try {
      const offset = (pageNum - 1) * LIMIT;
      const res = await fetch(`/api/tieba/feed?limit=${LIMIT}&offset=${offset}&view_mode=${mode}${kw ? `&keyword=${encodeURIComponent(kw)}` : ""}`);
      const data: TiebaFeedItem[] = await res.json();
      
      setHasMore(data.length >= LIMIT);
      if (pageNum === 1) setFeedData(data || []);
      else setFeedData(prev => [...prev, ...(data || [])]);
    } catch (error) {
      console.error("获取情报失败", error);
    } finally {
      setLoading(false);
    }
  };

  // 检查是否有缓存数据（从详情页返回时触发）
  useEffect(() => {
    fetchStats();
    const cacheStr = sessionStorage.getItem("tieba_feed_state");
    if (cacheStr) {
      isRestoringRef.current = true; // 🔒 上锁：标记系统当前正在恢复缓存现场
      const cache = JSON.parse(cacheStr);
      setKeyword(cache.keyword);
      setSearchInput(cache.keyword);
      setViewMode(cache.viewMode);
      setFeedData(cache.feedData);
      setPage(cache.page);
      setHasMore(cache.hasMore);
      
      // 延迟还原滚动条高度
      setTimeout(() => window.scrollTo(0, cache.scrollY), 100);
      
      // 阅后即焚（如果你在开发环境下遇到缓存丢失，可以把这行注释掉）
      sessionStorage.removeItem("tieba_feed_state"); 
    } else {
      fetchFeed("", 1, "grouped"); 
    }
    setInitialLoaded(true);
  }, []);

  // 3. 修改监听页码的 useEffect
  useEffect(() => {
    if (initialLoaded && page > 1) {
      if (isRestoringRef.current) {
        isRestoringRef.current = false; // 解开锁，让下一次正常滚动可以触发
        return;
      }
      fetchFeed(keyword, page, viewMode);
    }
  }, [page, initialLoaded]);

  // 用户点击搜索
  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
    setHasMore(true);
    fetchFeed(searchInput, 1, viewMode);
  };

  // 用户切换模式
  const handleViewModeChange = (mode: "grouped" | "flat") => {
    setViewMode(mode);
    setPage(1);
    setHasMore(true);
    fetchFeed(keyword, 1, mode);
  };

  // 点击卡片跳转前瞬间封存现场
  const handleCardClick = (tid: string) => {
    sessionStorage.setItem("tieba_feed_state", JSON.stringify({
      keyword,
      viewMode,
      feedData,
      page,
      hasMore,
      scrollY: window.scrollY // 记录滚动条高度
    }));
    router.push(`/tieba/${tid}?keyword=${encodeURIComponent(keyword || "泽")}`);
  };

  // 触底探测器
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) setPage(prev => prev + 1);
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const groupedFeed = useMemo(() => {
    if (keyword || viewMode === "flat") return { '情报大盘': feedData };
    const groups: Record<string, TiebaFeedItem[]> = { '今天': [], '昨天': [], '更早': [] };
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    feedData.forEach(item => {
      const dateStr = new Date(item.create_time).toDateString();
      if (dateStr === today) groups['今天'].push(item);
      else if (dateStr === yesterday) groups['昨天'].push(item);
      else groups['更早'].push(item);
    });
    return groups;
  }, [feedData, keyword, viewMode]);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/50">
        <div className="flex items-center">
          <button 
            onClick={() => router.back()} 
            className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors group"
          >
            <ChevronLeft className="w-5 h-5 mr-1 transition-transform group-hover:-translate-x-1" />
            返回
          </button>
          <div className="h-4 w-[1px] bg-border mx-4"></div> {/* 分割线 */}
          <h1 className="text-lg font-bold text-foreground">贴吧监控大盘</h1>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-slot="card" className="p-4 flex flex-col items-center justify-center border-border">
          <div className="flex items-center text-muted-foreground mb-1"><Target className="w-4 h-4 mr-1"/> 昨日主题帖</div>
          <div className="text-2xl font-bold text-foreground">{stats.new_threads}</div>
        </Card>
        <Card data-slot="card" className="p-4 flex flex-col items-center justify-center border-border">
          <div className="flex items-center text-muted-foreground mb-1"><MessageSquare className="w-4 h-4 mr-1"/> 昨日回复</div>
          <div className="text-2xl font-bold text-foreground">{stats.new_posts}</div>
        </Card>
        <Card data-slot="card" className="p-4 flex flex-col items-center justify-center border-border">
          <div className="flex items-center text-muted-foreground mb-1"><Activity className="w-4 h-4 mr-1"/> 昨日楼中楼</div>
          <div className="text-2xl font-bold text-foreground">{stats.new_comments}</div>
        </Card>
        <Card data-slot="card" className="p-4 flex flex-col items-center justify-center border-border">
          <div className="flex items-center text-muted-foreground mb-1"><Users className="w-4 h-4 mr-1"/> 昨日发言人数</div>
          <div className="text-2xl font-bold text-foreground">{stats.active_users}</div>
        </Card>
      </div>

      <div className="mb-8 p-4 rounded-md border border-dashed border-border/50 bg-muted/20 opacity-70 cursor-not-allowed select-none transition-opacity hover:opacity-100">
        <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center">
          <Settings2 className="w-4 h-4 mr-2"/> 数据库探针 (Read-only)
        </h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 flex items-center rounded-sm tracking-wide">
            <ShieldCheck className="w-4 h-4 mr-2" />
            <span className="font-bold mr-2">目标锁定:</span> "陈泽" / "CZ" / "泽神" / "四眼"
          </span>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 border-b border-border/50">
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-slot="input"
              placeholder="输入关键词..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <button 
            data-slot="button"
            onClick={handleSearch}
            className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 hidden sm:block"
          >
            搜索
          </button>
          
          <div className="flex bg-muted/50 p-1 rounded-md border border-border shrink-0">
            <button
              onClick={() => handleViewModeChange("grouped")}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-all rounded-sm ${viewMode === 'grouped' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutList className="w-4 h-4" /> 主题
            </button>
            <button
              onClick={() => handleViewModeChange("flat")}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-all rounded-sm ${viewMode === 'flat' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Rows3 className="w-4 h-4" /> 平铺
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-8">
        {feedData.length === 0 && !loading ? (
          <div className="text-center text-muted-foreground py-10 border border-dashed border-border rounded-md mx-2">
            当前规则下暂无目标数据
          </div>
        ) : (
          Object.entries(groupedFeed).map(([groupName, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={groupName}>
                {!keyword && viewMode !== "flat" && (
                  <h2 className="text-sm font-bold mb-3 text-muted-foreground flex items-center gap-2 pl-1">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    {groupName}
                  </h2>
                )}
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <Card 
                      key={`${item.tid}-${item.create_time}-${idx}`}
                      data-slot="card"
                      className="p-4 cursor-pointer hover:border-primary/50 group bg-card"
                      onClick={() => handleCardClick(item.tid)}
                    >
                      <div className="flex justify-between items-center mb-2 text-xs text-muted-foreground">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-sm font-medium border border-primary/20">
                          {item.fname}吧
                        </span>
                        <span>{new Date(item.create_time).toLocaleString('zh-CN', { hour12: false })}</span>
                      </div>
                      
                      <h3 className="font-semibold text-base mb-3 group-hover:text-primary transition-colors line-clamp-2 text-card-foreground">
                        {item.thread_title}
                      </h3>

                      <div className="bg-muted/30 border-l-4 border-l-primary p-3 flex gap-3">
                        <img 
                          src={item.portrait ? `https://gss0.baidu.com/7Ls0a8Sm2Q5IlBGlnYG/sys/portrait/item/${item.portrait}` : '/favicon.ico'} 
                          alt="avatar" 
                          className="w-10 h-10 rounded-full border border-border object-cover shrink-0"
                          referrerPolicy="no-referrer" 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-card-foreground mb-1 flex items-center">
                            {item.nick_name}
                            <span className="ml-2 text-[10px] text-muted-foreground border border-border px-1 rounded-sm bg-background">
                              {item.source_type === 'thread' ? '楼主' : item.source_type === 'post' ? '回复' : '楼中楼'}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground break-words line-clamp-3">
                            <RichTextRenderer 
                              rawContents={item.raw_contents} 
                              fallbackText={item.hit_content} 
                              keyword={keyword} 
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div ref={lastElementRef} className="py-10 text-center flex flex-col items-center justify-center text-muted-foreground">
        {loading && hasMore && (
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 animate-pulse text-primary" />
            <span className="text-sm font-medium tracking-widest">更早的消息...</span>
          </div>
        )}
        {!hasMore && feedData.length > 0 && (
          <div className="flex items-center justify-center w-full">
            <span className="bg-muted px-4 py-1 text-xs rounded-sm opacity-50 border border-border">
              —— 没有更多数据了 ——
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
