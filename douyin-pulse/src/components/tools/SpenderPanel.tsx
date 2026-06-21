'use client';

import { useState } from 'react';
import { Search, Download, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommonFilterPayload, SpenderPreviewResponse } from '@/types/tools';
import { triggerBlobDownload } from '@/lib/tools-utils';

export default function SpenderPanel({ commonPayload }: { commonPayload: CommonFilterPayload | null }) {
  const [minDiamond, setMinDiamond] = useState('1000');
  const [spenderPreview, setSpenderPreview] = useState<SpenderPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handlePreview = async () => {
    setErrorMessage('');
    setSpenderPreview(null);
    if (!commonPayload) return setErrorMessage('请先在左侧选择完整的主播、场次和时间范围');
    
    setPreviewLoading(true);
    try {
      const threshold = Number(minDiamond);
      if (!Number.isFinite(threshold) || threshold < 0) throw new Error('请输入有效的消费阈值');

      const response = await fetch('/api/tools/spender-threshold/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commonPayload, min_total_diamond: threshold }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || '阈值预览失败');
      setSpenderPreview(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    setErrorMessage('');
    if (!commonPayload) return setErrorMessage('请先在左侧选择完整条件');
    
    setDownloadLoading(true);
    try {
      const threshold = Number(minDiamond);
      if (!Number.isFinite(threshold) || threshold < 0) throw new Error('请输入有效的消费阈值');

      const response = await fetch('/api/tools/spender-threshold/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commonPayload, min_total_diamond: threshold }),
      });
      if (!response.ok) throw new Error('下载失败');

      await triggerBlobDownload(response, `spender_report.html`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '下载失败');
    } finally {
      setDownloadLoading(false);
    }
  };

  const previewMeta = spenderPreview?.meta;

  return (
    <div className="space-y-4 w-full">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">消费阈值（钻石）</label>
        <Input
          type="number"
          min="0"
          step="1"
          value={minDiamond}
          onChange={(event) => {
            setMinDiamond(event.target.value);
            setSpenderPreview(null);
          }}
          placeholder="例如 1000"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handlePreview} disabled={previewLoading || downloadLoading}>
          {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />} 预览
        </Button>
        <Button variant="outline" onClick={handleDownload} disabled={previewLoading || downloadLoading}>
          {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} 下载 HTML
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
          {errorMessage}
        </div>
      )}

      <div className="rounded-[1.75rem] border border-border bg-background/40 p-4 md:p-5 mt-6">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-foreground">预览结果</h2>
            <p className="text-sm text-muted-foreground">
              {previewMeta
                ? `${previewMeta.anchor_name} · ${previewMeta.room_title || '未命名场次'} · ${previewMeta.start_time} - ${previewMeta.end_time}`
                : '先进行一次预览，这里会展示导出前结果。'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary font-medium">
            <FileDown className="h-3.5 w-3.5" />
            阈值名单 {spenderPreview?.rows.length ?? 0} 人
          </div>
        </div>

        {!spenderPreview && !previewLoading && (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            还没有预览数据。先选择主播、场次和时间范围，再点击上方“预览”。
          </div>
        )}

        {spenderPreview && (
          <>
            <div className="text-sm text-muted-foreground font-medium mb-2">
              消费阈值：<span className="text-amber-500 font-bold">{spenderPreview.min_total_diamond} 钻石</span>
            </div>
            {spenderPreview.rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                该时间段内没有达到阈值的用户。
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[60px] text-center">序号</TableHead>
                      <TableHead>昵称</TableHead>
                      <TableHead>抖音号</TableHead>
                      <TableHead>主页链接</TableHead>
                      <TableHead>总消费(钻)</TableHead>
                      <TableHead>礼物清单</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spenderPreview.rows.map((row) => (
                      <TableRow key={`${row.rank}-${row.user_name}`}>
                        <TableCell className="text-center">{row.rank}</TableCell>
                        <TableCell className="font-semibold text-sm max-w-[150px] truncate" title={row.user_name}>{row.user_name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{row.display_id || '-'}</TableCell>
                        <TableCell>
                          {row.profile_url ? (
                            <a href={row.profile_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs font-medium">
                              查看主页
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">暂无主页</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded text-xs font-bold">
                            {row.total_diamond_count}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs whitespace-normal text-xs leading-5 text-muted-foreground">{row.gift_list.join('；') || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}