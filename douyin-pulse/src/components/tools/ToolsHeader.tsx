import { useRouter } from 'next/navigation';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ToolsHeader() {
  const router = useRouter();
  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-card/80 px-5 py-6 shadow-[0_20px_60px_rgba(0,0,0,0.15)] backdrop-blur md:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(18,57,85,0.22),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent)]" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-[0.24em] text-primary uppercase">
            <Wrench className="h-3.5 w-3.5" /> Tools Export
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">导出工具页</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">囊括场次筛选导出与全网高等级粉丝动态捕获系统。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" /> 返回首页
          </Button>
        </div>
      </div>
    </header>
  );
}