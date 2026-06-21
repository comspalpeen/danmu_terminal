"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle2, XCircle, Activity, Users, X } from "lucide-react";

interface AuthorInfo {
  nickname: string;
  avatar: string;
  follower_count: number;
  live_status: number;
}

// 增加头像和昵称
interface CheckResult {
  display_id: string;
  nickname: string;
  avatar: string;
  level: number;
  passed: boolean;
  source: string;
}

export default function CzLevelChecker() {
  const [displayId, setDisplayId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  
  const [authorInfo, setAuthorInfo] = useState<AuthorInfo | null>(null);

  useEffect(() => {
    fetch("/api/czlevel/author")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setAuthorInfo(data);
      })
      .catch(console.error);
  }, []);

  const handleCheck = async () => {
    if (!displayId.trim()) {
      setError("请输入正确的抖音号或主页链接");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/czlevel?display_id=${encodeURIComponent(displayId.trim())}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.detail || "接口请求失败，请稍后重试");

      setResult({
        display_id: data.display_id,
        nickname: data.nickname,
        avatar: data.avatar,
        level: data.level,
        passed: data.passed,
        source: data.source,
      });
    } catch (err: any) {
      setError(err.message || "网络错误，请检查后端连接");
    } finally {
      setLoading(false);
    }
  };

  const formatFollowers = (num: number) => {
    return num > 10000 ? (num / 10000).toFixed(1) + "万" : num;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative z-10">
      
      <div data-slot="card" className="w-full max-w-md p-6 sm:p-8 flex flex-col gap-6">
        {authorInfo ? (
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="relative">
              <img 
                src={authorInfo.avatar} 
                alt="avatar" 
                className="w-16 h-16 rounded-full border-2 border-primary/50 object-cover"
              />
              <span className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card ${
                authorInfo.live_status === 2 || authorInfo.live_status === 1 
                  ? "bg-green-500 animate-pulse" 
                  : "bg-gray-500"
              }`} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                {authorInfo.nickname}
                {authorInfo.live_status === 2 && (
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-sm">
                    LIVE
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Users size={14} />
                  {formatFollowers(authorInfo.follower_count)} 
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-24 rounded-lg bg-muted/20 animate-pulse border border-border/30" />
        )}
        <div>
          <h1 className="text-2xl font-black mb-2 flex items-center gap-2">
            <Activity className="text-primary" />
            粉丝团等级核验
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            输入抖音号或主页链接查询等级
          </p>

          <div className="space-y-4">
            <div className="relative flex items-center">
              <input
                data-slot="input"
                type="text"
                value={displayId}
                onChange={(e) => setDisplayId(e.target.value)}
                placeholder="支持抖音号sec_uid或主页链接"
                className="w-full px-4 py-3 pl-10 pr-10 outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
              />
              <Search className="absolute left-3 text-muted-foreground" size={18} />
              {displayId && (
                <button
                  onClick={() => setDisplayId("")}
                  className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                  title="清空输入"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <button
              data-slot="button"
              onClick={handleCheck}
              disabled={loading}
              className={`w-full py-3 flex items-center justify-center gap-2 ${
                loading 
                  ? "bg-muted text-muted-foreground cursor-not-allowed" 
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  核验中 / CHECKING...
                </>
              ) : (
                "立即核验 / VERIFY"
              )}
            </button>
          </div>
        </div>
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-md text-sm text-center font-bold animate-in fade-in zoom-in duration-300">
            {error}
          </div>
        )}

        {result && (
          <div className={`mt-2 p-6 rounded-lg border flex flex-col items-center justify-center text-center animate-in slide-in-from-bottom-4 fade-in duration-500 ${
            result.passed 
              ? "bg-green-500/10 border-green-500/30" 
              : "bg-destructive/10 border-destructive/30"
          }`}>
            <div className="flex items-center gap-3 mb-6 p-3 w-full bg-background/50 rounded-lg border border-border/50">
              <img
                src={result.avatar || "https://p3-webcast.douyinpic.com/img/webcast/mystery_man_thumb_avatar.png~tplv-obj.image"}
                alt="avatar"
                className="w-12 h-12 rounded-full object-cover border border-border"
              />
              <div className="text-left flex-1 overflow-hidden">
                <div className="font-bold truncate text-foreground">{result.nickname}</div>
                <div className="text-xs text-muted-foreground truncate">ID: {result.display_id}</div>
              </div>
            </div>

            <span className="text-sm text-muted-foreground mb-1 uppercase tracking-widest">
              Current Level
            </span>
            <span className={`text-6xl font-black mb-4 ${
              result.passed ? "text-green-500" : "text-destructive"
            }`}>
              {result.level}
            </span>
            
            {result.passed ? (
              <div className="flex flex-col items-center gap-2">
                <span className="flex items-center gap-2 text-green-500 font-bold text-lg">
                  <CheckCircle2 /> 等级符合 / ACCESS GRANTED
                </span>
                <p className="text-sm text-muted-foreground mt-2">
                  等级已达标。后续功能开发中...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="flex items-center gap-2 text-destructive font-bold text-lg">
                  <XCircle /> 不满足要求 / ACCESS DENIED
                </span>
                <p className="text-sm text-muted-foreground mt-2">
                  需达到 12 级粉丝团
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}