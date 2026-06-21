"use client";
import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-8">控制台仪表盘</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/admin/cookies" className="block p-6 bg-card border border-border rounded-xl hover:shadow-lg hover:border-primary/50 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-4xl">🍪</span>
              <span className="text-muted-foreground group-hover:text-primary text-2xl">→</span>
            </div>
            <h3 className="text-xl font-bold text-foreground group-hover:text-primary">账号池管理</h3>
            <p className="text-muted-foreground mt-2 text-sm">管理爬虫使用的抖音 Cookie，添加、更新或删除失效账号。</p>
          </Link>
          <Link href="/admin/qna" className="block p-6 bg-card border border-border rounded-xl hover:shadow-lg hover:border-accent/50 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-4xl">💡</span>
              <span className="text-muted-foreground group-hover:text-accent text-2xl">→</span>
            </div>
            <h3 className="text-xl font-bold text-foreground group-hover:text-accent">常见问题 (Q&A)</h3>
            <p className="text-muted-foreground mt-2 text-sm">编辑首页右下角弹出的常见问题解答内容。</p>
          </Link>

          <Link href="/admin/settings" className="block p-6 bg-card border border-border rounded-xl hover:shadow-lg hover:border-primary/50 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-4xl">⚙️</span>
              <span className="text-muted-foreground group-hover:text-primary text-2xl">→</span>
            </div>
            <h3 className="text-xl font-bold text-foreground group-hover:text-primary">系统控制面板</h3>
            <p className="text-muted-foreground mt-2 text-sm">控制 czlevel 接口联网开关、限流参数和业务盾牌策略。</p>
          </Link>
          <Link href="/" className="block p-6 bg-card border border-border rounded-xl hover:shadow-lg hover:border-primary transition-all group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-4xl">📺</span>
              <span className="text-muted-foreground group-hover:text-primary text-2xl">↗</span>
            </div>
            <h3 className="text-xl font-bold text-foreground group-hover:text-primary">返回前台首页</h3>
            <p className="text-muted-foreground mt-2 text-sm">查看当前的直播监控列表和数据统计。</p>
          </Link>

        </div>
      </div>
    </div>
  );
}