'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
    Users, 
    ChevronDown, 
    ChevronRight, 
    Trash2, 
    Crown, 
    ShieldCheck, 
    RotateCcw,
    RefreshCw
} from "lucide-react";
interface Favorite {
    sec_uid: string;
    nickname: string;
    avatar_url: string;
    group_name?: string;
    grade_icon_url?: string; 
    display_id?: string;
    follower_count?: number;
}

interface BatchResult {
    target_sec_uid: string;
    fans_level: number;
    fans_badge_url?: string;
    is_member: boolean;
    is_admin: boolean;
}

interface FavoritesSectionProps {
  userSecUid: string;
  favorites: Favorite[];
  onRefreshFavorites: () => void;
}

const formatCount = (num?: number) => {
    if (!num) return "0";
    if (num >= 100000000) return (num / 100000000).toFixed(1) + "亿";
    if (num >= 10000) return (num / 10000).toFixed(1) + "万";
    return num.toLocaleString();
};

export function FavoritesSection({ userSecUid, favorites, onRefreshFavorites }: FavoritesSectionProps) {
  const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["特别关注", "默认分组"]); 
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);

  const groupedFavorites = useMemo(() => {
    if (batchResults) return {}; 
    const sortedFavorites = [...favorites].sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
    return sortedFavorites.reduce((acc, curr) => {
        const group = curr.group_name || "默认分组";
        if (!acc[group]) acc[group] = [];
        acc[group].push(curr);
        return acc;
    }, {} as Record<string, Favorite[]>);
  }, [favorites, batchResults]);

  const resultList = useMemo(() => {
    if (!batchResults) return [];
    const list = favorites.filter(f => selectedStreamers.includes(f.sec_uid));
    return list.sort((a, b) => {
        const resA = batchResults.find(r => r.target_sec_uid === a.sec_uid);
        const resB = batchResults.find(r => r.target_sec_uid === b.sec_uid);
        const levelA = resA?.fans_level || 0;
        const levelB = resB?.fans_level || 0;
        if (levelB !== levelA) return levelB - levelA;
        return (b.follower_count || 0) - (a.follower_count || 0);
    });
  }, [favorites, batchResults, selectedStreamers]);

  const toggleGroupExpand = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName]
    );
  };

  const toggleSelect = (secUid: string) => {
    if (batchResults) return; 
    setSelectedStreamers(prev => 
        prev.includes(secUid) ? prev.filter(id => id !== secUid) : [...prev, secUid]
    );
  };

  const toggleSelectGroup = (items: Favorite[]) => {
      const ids = items.map(i => i.sec_uid);
      const allSelected = ids.every(id => selectedStreamers.includes(id));
      if (allSelected) {
          setSelectedStreamers(prev => prev.filter(id => !ids.includes(id)));
      } else {
          setSelectedStreamers(prev => [...new Set([...prev, ...ids])]);
      }
  };

  const deleteFavorite = async (sec_uid: string) => {
    if (!confirm("确定要删除这位主播吗？")) return;
    try {
        await fetch(`/api/favorites/${sec_uid}`, { method: 'DELETE' });
        onRefreshFavorites();
        setSelectedStreamers(prev => prev.filter(id => id !== sec_uid));
    } catch (e) { console.error(e); }
  };

  const onBatchSearch = async () => {
    if (selectedStreamers.length === 0 || !userSecUid) return;
    setBatchLoading(true);
    try {
        const res = await fetch('/api/check/batch_relation', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_sec_uid: userSecUid, streamer_sec_uids: selectedStreamers })
        });
        const data = await res.json();
        setBatchResults(data);
    } catch(e) { console.error(e); }
    finally { setBatchLoading(false); }
  };

  const resetSearch = () => { setBatchResults(null); };

  const onUpdateAllInfo = async () => {
      if(isUpdatingInfo) return;
      if(!confirm(`将更新所有 ${favorites.length} 位主播的最新头像、昵称、粉丝数和抖音号，耗时较长，是否继续？`)) return;
      setIsUpdatingInfo(true);
      try {
          const res = await fetch('/api/favorites/refresh_all', { method: 'POST' });
          const data = await res.json();
          alert(data.msg); 
          setTimeout(() => {
              onRefreshFavorites();
              setIsUpdatingInfo(false);
          }, 5000); 
      } catch(e) {
          console.error(e);
          setIsUpdatingInfo(false);
      }
  };

  return (
    // 使用 bg-card，border-border，顶部装饰线使用 border-t-primary/50
    <div className="bg-card/80 backdrop-blur-md rounded-[var(--radius)] p-6 border border-border border-t-primary/50 shadow-2xl mt-6 animate-in slide-in-from-bottom-6 transition-colors duration-500">
       
       {/* --- 顶部控制栏 --- */}
       <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-border/50 pb-4">
           <div className="flex items-center gap-3">
               <div className="p-2 bg-primary/10 rounded-[var(--radius-md)] border border-primary/20 transition-colors duration-500">
                   <Users className="w-5 h-5 text-primary" />
               </div>
               <div>
                   <h2 className="text-xl font-bold text-foreground transition-colors duration-500">
                       {batchResults ? "透视报告" : "批量关系透视"}
                   </h2>
                   {!batchResults && (
                       <div className="text-xs text-muted-foreground mt-1 transition-colors duration-500">
                           已选 <span className="text-primary font-bold">{selectedStreamers.length}</span> / {favorites.length} 位主播
                       </div>
                   )}
               </div>
           </div>

           <div className="flex items-center gap-3">
               {batchResults ? (
                   <Button 
                       onClick={resetSearch}
                       variant="secondary"
                       className="bg-muted hover:bg-muted/80 text-foreground border border-border rounded-[var(--radius)] transition-colors duration-500"
                   >
                       <RotateCcw className="w-4 h-4 mr-2" />
                       返回列表
                   </Button>
               ) : (
                   <>
                       <Button 
                           variant="ghost" 
                           size="sm"
                           onClick={onUpdateAllInfo}
                           disabled={isUpdatingInfo}
                           className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-[var(--radius)] transition-colors duration-500"
                           title="修复 ID 显示，同步最新头像/等级/粉丝数"
                       >
                           <RefreshCw className={`w-4 h-4 mr-1 ${isUpdatingInfo ? 'animate-spin' : ''}`} />
                           {isUpdatingInfo ? "更新中..." : "刷新资料"}
                       </Button>

                       <Button 
                           onClick={onBatchSearch} 
                           disabled={batchLoading || selectedStreamers.length === 0} 
                           className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 shadow-lg shadow-primary/20 transition-all active:scale-95 rounded-[var(--radius)]"
                       >
                           {batchLoading ? "全速扫描中..." : "开始透视"}
                       </Button>
                   </>
               )}
           </div>
       </div>

       {/* --- 列表区域 --- */}
       <div className="space-y-4 max-h-[800px] overflow-y-auto custom-scrollbar pr-2">
           
           {batchResults ? (
               <div className="flex flex-col gap-2">
                   {resultList.map((fav) => {
                       const result = batchResults.find(r => r.target_sec_uid === fav.sec_uid);
                       const displayIdText = fav.display_id ? `抖音号: ${fav.display_id}` : "抖音号: 未获取";

                       return (
                           <div key={fav.sec_uid} className="flex items-center justify-between p-4 bg-background/40 border border-border rounded-[var(--radius)] hover:bg-muted/40 transition-colors duration-500 animate-in slide-in-from-bottom-2">
                               <div className="flex items-center gap-4">
                                   <div className="relative">
                                       <Avatar className="w-14 h-14 border-2 border-border transition-colors duration-500">
                                           <AvatarImage src={fav.avatar_url} />
                                           <AvatarFallback>{fav.nickname[0]}</AvatarFallback>
                                       </Avatar>
                                   </div>
                                   <div>
                                       <div className="flex items-center gap-2">
                                            <span className="text-base font-bold text-foreground transition-colors duration-500">{fav.nickname}</span>
                                            {fav.grade_icon_url && (
                                                <img src={fav.grade_icon_url} className="h-5 w-auto" alt="Lv" />
                                            )}
                                       </div>
                                       <div className="flex items-center gap-3 mt-1 text-xs">
                                           <span className="text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-primary/20 transition-colors duration-500">
                                               粉丝: {formatCount(fav.follower_count)}
                                           </span>
                                           <span className="text-muted-foreground font-mono transition-colors duration-500">
                                               {displayIdText}
                                           </span>
                                       </div>
                                   </div>
                               </div>

                               <div className="flex items-center gap-8 mr-4">
                                   <div className="flex flex-col items-center w-14">
                                       <span className="text-[10px] text-muted-foreground font-bold mb-1.5 uppercase tracking-wide">粉丝团</span>
                                       {result?.fans_badge_url ? (
                                           <img src={result.fans_badge_url} className="h-8 w-auto object-contain drop-shadow-lg" alt="Badge" />
                                       ) : <div className="h-8 flex items-center justify-center"><span className="text-muted-foreground/50 text-xs font-bold">-</span></div>}
                                   </div>
                                   <div className="flex flex-col items-center w-12">
                                       <span className="text-[10px] text-muted-foreground font-bold mb-1.5 uppercase tracking-wide">会员</span>
                                       {result?.is_member ? (
                                           <Crown className="w-8 h-8 text-yellow-400 fill-yellow-400/20 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                                       ) : <div className="h-8 flex items-center justify-center"><span className="text-muted-foreground/50 text-2xl leading-none">·</span></div>}
                                   </div>
                                   <div className="flex flex-col items-center w-12">
                                       <span className="text-[10px] text-muted-foreground font-bold mb-1.5 uppercase tracking-wide">房管</span>
                                       {result?.is_admin ? (
                                           <ShieldCheck className="w-8 h-8 text-blue-400 fill-blue-400/20 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]" />
                                       ) : <div className="h-8 flex items-center justify-center"><span className="text-muted-foreground/50 text-2xl leading-none">·</span></div>}
                                   </div>
                               </div>
                           </div>
                       );
                   })}
               </div>
           ) : (
               Object.keys(groupedFavorites).length === 0 ? (
                   <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-[var(--radius)] bg-background/30 transition-colors duration-500">
                       暂无收藏主播
                   </div>
               ) : (
                   Object.entries(groupedFavorites).map(([groupName, items]) => {
                       const isExpanded = expandedGroups.includes(groupName);
                       const isAllSelected = items.length > 0 && items.every(i => selectedStreamers.includes(i.sec_uid));

                       return (
                           <div key={groupName} className="border border-border rounded-[var(--radius)] overflow-hidden bg-background/20 transition-colors duration-500">
                               
                               <div 
                                   className="flex items-center justify-between p-3 bg-card/80 cursor-pointer hover:bg-muted transition-colors border-b border-border/50 duration-500"
                                   onClick={() => toggleGroupExpand(groupName)}
                               >
                                   <div className="flex items-center gap-2">
                                       {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground"/> : <ChevronRight className="w-4 h-4 text-muted-foreground"/>}
                                       <span className="font-bold text-sm text-foreground">{groupName}</span>
                                       <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full">{items.length}</span>
                                   </div>

                                   <div 
                                       className={`flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] cursor-pointer transition-all border ${
                                           isAllSelected 
                                           ? 'text-primary border-primary/30 bg-primary/20' 
                                           : 'text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground'
                                       }`}
                                       onClick={(e) => { 
                                           e.stopPropagation(); 
                                           toggleSelectGroup(items); 
                                       }}
                                   >
                                       <Checkbox 
                                            checked={isAllSelected} 
                                            className={`w-3 h-3 mr-1 border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors`}
                                       />
                                       {isAllSelected ? "已全选" : "全选本组"}
                                   </div>
                               </div>

                               {isExpanded && (
                                   <div className="flex flex-col">
                                       {items.map((fav) => {
                                           const isSelected = selectedStreamers.includes(fav.sec_uid);
                                           const displayIdText = fav.display_id ? `ID: ${fav.display_id}` : "ID: 需刷新";

                                           return (
                                               <div 
                                                   key={fav.sec_uid} 
                                                   onClick={() => {
                                                       if(batchResults) return;
                                                       toggleSelect(fav.sec_uid);
                                                   }}
                                                   className={`flex items-center justify-between p-4 border-b last:border-0 border-border/50 transition-all cursor-pointer group hover:bg-muted/40 ${
                                                       isSelected ? "bg-primary/10" : "bg-transparent"
                                                   }`}
                                               >
                                                   <div className="flex items-center gap-4 flex-1">
                                                        <Checkbox 
                                                            checked={isSelected} 
                                                            className="border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors" 
                                                        />
                                                        <Avatar className="w-10 h-10 border border-border transition-colors duration-500">
                                                            <AvatarImage src={fav.avatar_url} />
                                                            <AvatarFallback>{fav.nickname[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col">
                                                            <div className="text-sm font-bold text-foreground flex items-center gap-2 transition-colors duration-500">
                                                                {fav.nickname}
                                                                {fav.grade_icon_url && <img src={fav.grade_icon_url} className="h-4 w-auto" alt="Lv"/>}
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-0.5 text-xs">
                                                                <span className="text-primary/80 font-medium transition-colors duration-500">
                                                                    粉丝: {formatCount(fav.follower_count)}
                                                                </span>
                                                                <span className="text-muted-foreground transition-colors duration-500">
                                                                    {displayIdText}
                                                                </span>
                                                            </div>
                                                        </div>
                                                   </div>
                                                   
                                                   <button 
                                                       onClick={(e) => { e.stopPropagation(); deleteFavorite(fav.sec_uid); }}
                                                       className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                   >
                                                       <Trash2 className="w-4 h-4" />
                                                   </button>
                                               </div>
                                           );
                                       })}
                                   </div>
                               )}
                           </div>
                       );
                   })
               )
           )}
       </div>
    </div>
  );
}