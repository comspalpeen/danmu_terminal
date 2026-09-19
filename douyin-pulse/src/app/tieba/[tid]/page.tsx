"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { TiebaThreadDetail } from "@/types/tieba";

import { ArrowLeft, Target, ExternalLink } from "lucide-react";
// 高亮组件 (沿用全局色)
const HighlightText = ({ text, keyword }: { text: string; keyword: string }) => {
  if (!keyword) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${keyword})`, "gi"));
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <span key={i} className="text-primary font-bold bg-primary/20 px-1 rounded-sm">{part}</span>
        ) : (
          part
        )
      )}
    </span>
  );
};
// 富文本与多媒体渲染引擎
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
export default function ThreadDetailPage() {
  const router = useRouter();
  const { tid } = useParams();
  const searchParams = useSearchParams();
  const keyword = searchParams.get("keyword") || "";

  const [detail, setDetail] = useState<TiebaThreadDetail | null>(null);
  const [showOnlyKeyword, setShowOnlyKeyword] = useState(false);

  useEffect(() => {
    if (tid) {
      fetch(`/api/tieba/thread/${tid}`)
        .then(async res => {
          if (!res.ok) throw new Error(await res.text());
          return res.json();
        })
        .then(data => setDetail(data))
        .catch(err => setDetail({ error: "无法加载详情：" + err.message } as any));
    }
  }, [tid]);

  if (!detail) return <div className="p-10 text-center text-muted-foreground animate-pulse">正在加载详情...</div>;
  if ("error" in detail) return <div className="p-10 text-center text-destructive">{detail.error as string}</div>;

  // 只要主回复或者任何一个子评论命中了关键词，这层楼就予以保留！
  // 并且如果是“只看关键字”模式，我们会把未命中关键字的子评论隐藏，保持界面极度干净。
  const displayedPosts = showOnlyKeyword && keyword
    ? detail.posts.reduce((acc, post) => {
        const postMatches = post.content.includes(keyword);
        const matchingComments = post.comments?.filter(c => c.content.includes(keyword)) || [];
        
        // 如果主楼层命中，或者有任何子评论命中，则保留这层楼
        if (postMatches || matchingComments.length > 0) {
          acc.push({
            ...post,
            // 如果主楼层命中，保留所有子评论提供上下文；如果主楼层没命中，只保留命中的子评论！
            comments: postMatches ? post.comments : matchingComments
          });
        }
        return acc;
      }, [] as typeof detail.posts)
    : detail.posts;

  return (
    <div className="max-w-5xl mx-auto min-h-screen bg-background pb-20 border-x border-border/30 shadow-2xl">
      <div className="bg-card border-b border-border sticky top-0 z-20 shadow-sm p-4 md:px-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button 
            onClick={() => router.back()}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title="主页"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <h1 className="text-xl font-bold text-card-foreground line-clamp-2 leading-tight">
            {detail.thread.title}
          </h1>
          <a
            href={`https://tieba.baidu.com/p/${tid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-primary shrink-0"
            title="在百度贴吧中打开原贴"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
        
        {keyword && (
          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border shrink-0">
            <div className="text-sm font-medium text-muted-foreground flex items-center">
              <Target className="w-4 h-4 mr-1 text-primary"/> 锁定: 
              <span className="text-primary bg-primary/10 px-1.5 ml-1 border border-primary/20 rounded">{keyword}</span>
            </div>
            
            <div className="flex items-center space-x-2 border-l border-border pl-4">
              <label className="flex items-center cursor-pointer gap-2">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 accent-primary"
                  checked={showOnlyKeyword}
                  onChange={(e) => setShowOnlyKeyword(e.target.checked)}
                />
                <span className="font-medium text-sm text-foreground/80">只看关键字</span>
              </label>
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 px-2 md:px-6 space-y-3">
        <PostRow 
          post={{
            ...detail.thread, 
            // 核心改动：如果有正文，就把标题和正文拼起来；如果没有，就只显示标题
            content: detail.thread.content 
              ? `${detail.thread.title}\n\n${detail.thread.content}` 
              : detail.thread.title
          }}
          
          floor={1} 
          keyword={keyword} 
          isHost={true}
        />
        {displayedPosts.length > 0 ? (
          displayedPosts.map((post, index) => (
            <PostRow 
              key={post.pid} 
              post={post} 
              floor={detail.posts.findIndex(p => p.pid === post.pid) + 2} 
              keyword={keyword} 
            />
          ))
        ) : (
          <div className="bg-card p-10 text-center text-muted-foreground border border-dashed border-border mt-4 rounded-md mx-2">
            该帖子的其他楼层及楼中楼均未提及目标关键字。
          </div>
        )}
      </div>
    </div>
  );
}

// 经典的单层楼组件 (包含嵌套楼中楼)
function PostRow({ post, floor, keyword, isHost = false }: { post: any, floor: number, keyword: string, isHost?: boolean }) {
  const avatarUrl = post.portrait ? `https://gss0.baidu.com/7Ls0a8Sm2Q5IlBGlnYG/sys/portrait/item/${post.portrait}` : '/favicon.ico';
  const userUrl = `https://tieba.baidu.com/home/main?id=${post.portrait}`; // 用户主页链接
  
  return (
    <div className="flex flex-col sm:flex-row bg-card border border-border shadow-sm rounded-md overflow-hidden">
      <div className="sm:w-36 bg-muted/20 border-b sm:border-b-0 sm:border-r border-border p-4 flex sm:flex-col items-center sm:items-center gap-3 shrink-0">
        <a href={userUrl} target="_blank" rel="noopener noreferrer" className="relative block hover:opacity-80 transition-opacity">
          <img 
            src={avatarUrl} 
            alt="头像" 
            className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-border/50 p-0.5 object-cover bg-background rounded-sm"
            referrerPolicy="no-referrer"
          />
          {isHost && (
            <span className="absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] sm:text-xs px-1.5 py-0.5 rounded-sm whitespace-nowrap font-bold">
              楼主
            </span>
          )}
        </a>
        <a 
          href={userUrl} 
          target="_blank"
          className="text-sm text-muted-foreground hover:text-primary transition-colors text-center break-all line-clamp-2"
        >
          {post.nick_name}
        </a>
      </div>
      <div className="flex-1 p-5 flex flex-col min-w-0">
        <div className="text-foreground text-base leading-relaxed">
          <RichTextRenderer 
            rawContents={post.raw_contents}
            fallbackText={post.content}
            keyword={keyword} 
          />
        </div>
        {post.comments && post.comments.length > 0 && (
          <div className="mt-4 bg-muted/40 rounded-md p-3 border border-border/50 space-y-3">
            {post.comments.map((comment: any, idx: number) => {
              const commentUserUrl = `https://tieba.baidu.com/home/main?id=${comment.portrait}`;
              return (
                <div key={comment.cid || idx} className="flex gap-2 text-sm leading-relaxed group">
                  <a href={commentUserUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5 hover:opacity-80 transition-opacity">
                    <img 
                      src={comment.portrait ? `https://gss0.baidu.com/7Ls0a8Sm2Q5IlBGlnYG/sys/portrait/item/${comment.portrait}` : '/favicon.ico'} 
                      alt="avatar" 
                      className="w-6 h-6 rounded-full border border-border/50 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </a>
                  <div className="flex-1 min-w-0">
                    <a href={commentUserUrl} target="_blank" className="text-primary/90 font-bold mr-2 hover:underline">
                      {comment.nick_name}:
                    </a>
                    <span className="text-foreground/90 break-words">
                      <HighlightText text={comment.content} keyword={keyword} />
                    </span>
                    <span className="text-muted-foreground/60 text-xs ml-3 group-hover:text-muted-foreground transition-colors">
                      {new Date(comment.create_time).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end items-center gap-4 mt-6 text-xs text-muted-foreground">
          <span>{floor} 楼</span>
          <span>{new Date(post.create_time).toLocaleString('zh-CN', { hour12: false })}</span>
        </div>
      </div>
    </div>
  );
}
