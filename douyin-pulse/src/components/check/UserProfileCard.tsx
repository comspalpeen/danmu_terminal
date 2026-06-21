import type { MouseEvent } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScanEye } from "lucide-react";
import { InfoCell } from "./InfoCell";
import { getDouyinWebUserUrl, openDouyinUser } from "@/lib/douyin-links";

export function UserProfileCard({ result }: { result: any }) {
  if (!result) return null;
  const profileUrl = getDouyinWebUserUrl(result.sec_uid);
  const handleProfileClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    openDouyinUser(result.sec_uid);
  };

  // 消费金额格式化逻辑
  const formatSpend = (diamond: number) => {
    const rmb = diamond / 10;
    if (rmb >= 10000) {
      return parseFloat((rmb / 10000).toFixed(2)) + " 万";
    }
    return rmb.toLocaleString();
  };

  return (
    // 替换为 bg-card 和 border-border
    <Card className="bg-card border-border shadow-2xl text-foreground overflow-hidden transition-colors duration-500">
        <CardHeader className="pb-6 border-b border-border bg-muted/30">
        <div className="flex items-start gap-5">
            <a href={profileUrl} onClick={handleProfileClick} target="_blank" rel="noreferrer" className="shrink-0 transition-transform hover:scale-105">
            <Avatar className="w-24 h-24 border-4 border-border shadow-xl">
                <AvatarImage src={result.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-muted text-2xl text-muted-foreground">{result.nickname?.[0]}</AvatarFallback>
            </Avatar>
            </a>
            
            <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
                <a href={profileUrl} onClick={handleProfileClick} target="_blank" rel="noreferrer" 
                className="text-3xl font-bold text-foreground hover:text-primary transition-colors truncate max-w-full">
                {result.nickname}
                </a>
                {result.grade_icon_url && <img src={result.grade_icon_url} className="h-7 w-auto" alt="level" />}
            </div>
            
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-foreground/80 font-mono text-sm">
                <span className="bg-background px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-primary font-bold transition-colors duration-500">UID: {result.uid}</span>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">{result.secret}</span>
                </div>
                <div className="text-[10px] font-mono text-primary/80 break-all bg-background/50 p-1 rounded-[var(--radius-sm)] transition-colors duration-500">
                {result.sec_uid}
                </div>
            </div>
            </div>
        </div>
        </CardHeader>

        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-5 pt-8">
            {/* 1. 真实身份曝光 (使用 destructive 变量) */}
            {result.real_identity && (
            <div className="col-span-2 md:col-span-3 bg-destructive/10 border border-destructive/30 p-3 rounded-[var(--radius)] flex items-center gap-3 animate-in slide-in-from-top-2 transition-colors duration-500">
                <div className="shrink-0">
                    <Avatar className="w-14 h-14 border-2 border-destructive/50">
                    <AvatarImage src={result.real_identity.avatar_url} />
                    <AvatarFallback className="bg-destructive/20 text-destructive">真</AvatarFallback>
                    </Avatar>
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <ScanEye className="w-4 h-4 text-destructive" />
                        <span className="text-xs font-bold text-destructive uppercase tracking-widest">真实身份曝光</span>
                    </div>
                    <div className="text-lg font-bold text-foreground flex items-center gap-2">
                        {result.real_identity.nickname}
                        <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-destructive/20">Hidden ID</span>
                    </div>
                </div>
            </div>
            )}
            
            {/* 2. 基础信息格 */}
            <InfoCell label="抖音号" value={result.display_id} />
            <InfoCell label="性别" value={result.gender} />
            {/* 城市使用 accent 强调色 */}
            <InfoCell label="城市" value={result.city} color="text-accent" />
            <InfoCell label="关注" value={result.following_count} />
            <InfoCell label="粉丝" value={result.follower_count?.toLocaleString()} />
            {/* 认证信息使用 accent 强调色 */}
            <InfoCell label="认证信息" value={result.verify} color="text-accent" />
            
            {/* 3. 财富等级 & 消费估值 (渐变大卡片，使用 background 到 card 的平滑过渡) */}
            <div className="col-span-2 md:col-span-3 bg-gradient-to-br from-background to-card p-6 rounded-[var(--radius)] border border-border mt-2 shadow-inner relative overflow-hidden transition-colors duration-500">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-0">
                    <div>
                        <label className="text-sm text-muted-foreground font-bold italic mb-1 block tracking-wider">
                            财富等级
                        </label>
                        <div className="text-4xl font-black text-primary font-mono tracking-tighter drop-shadow-md leading-none transition-colors duration-500">
                            Lv.{result.pay_level}
                        </div>
                    </div>
                    <div className="md:text-right md:pr-6">
                        <label className="text-sm text-muted-foreground font-bold italic mb-1 block tracking-wider">
                            预计累计消费估值 (RMB)
                        </label>
                        
                        <div className="flex items-baseline md:justify-end gap-2">
                            {result.max_diamond > 0 ? (
                                <>
                                    <span className="text-4xl font-black text-accent font-mono tracking-tighter drop-shadow-[0_0_8px_var(--color-accent)] leading-none transition-colors duration-500">
                                        ¥ {formatSpend(result.min_diamond)}
                                    </span>
                                    <span className="text-accent font-black text-2xl">~</span>
                                    <span className="text-4xl font-black text-accent font-mono tracking-tighter drop-shadow-[0_0_8px_var(--color-accent)] leading-none transition-colors duration-500">
                                        {formatSpend(result.max_diamond)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-4xl font-black text-accent font-mono tracking-tighter drop-shadow-[0_0_8px_var(--color-accent)] leading-none transition-colors duration-500">
                                    ¥ {formatSpend(result.min_diamond)}+
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. 个人简介 */}
            <div className="col-span-2 md:col-span-3">
                <label className="text-xs text-muted-foreground font-bold uppercase mb-2 block tracking-widest">个人简介</label>
                <p className="text-sm text-foreground/80 leading-relaxed bg-muted/40 p-4 rounded-[var(--radius)] border border-border shadow-sm border-l-4 border-l-primary transition-colors duration-500">
                {result.signature || "暂无个人简介"}
                </p>
            </div>
        </CardContent>
    </Card>
  );
}
