'use client';

import { useState } from 'react';
import { Search, Download, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommonFilterPayload, GiftPreviewResponse } from '@/types/tools';
import { splitKeywords, triggerBlobDownload } from '@/lib/tools-utils';

export default function GiftPanel({ commonPayload }: { commonPayload: CommonFilterPayload | null }) {
  const [giftKeywordsInput, setGiftKeywordsInput] = useState('');
  const [giftPreview, setGiftPreview] = useState<GiftPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handlePreview = async () => {
    setErrorMessage('');
    setGiftPreview(null);
    if (!commonPayload) return setErrorMessage('请先在左侧选择完整的主播、场次和时间范围');
    
    setPreviewLoading(true);
    try {
      const giftKeywords = splitKeywords(giftKeywordsInput);
      if (giftKeywords.length === 0) throw new Error('请至少输入一个礼物关键词');

      const response = await fetch('/api/tools/gift-report/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commonPayload, gift_keywords: giftKeywords }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || '礼物预览失败');
      setGiftPreview(data);
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
      const giftKeywords = splitKeywords(giftKeywordsInput);
      if (giftKeywords.length === 0) throw new Error('请至少输入一个礼物关键词');

      const response = await fetch('/api/tools/gift-report/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commonPayload, gift_keywords: giftKeywords }),
      });
      if (!response.ok) throw new Error('下载失败');

      await triggerBlobDownload(response, `gift_report.html`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '下载失败');
    } finally {
      setDownloadLoading(false);
    }
  };

  const previewMeta = giftPreview?.meta;

  return (
    <div className="space-y-4 w-full">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">礼物关键词</label>
        <textarea
          value={giftKeywordsInput}
          onChange={(event) => {
            setGiftKeywordsInput(event.target.value);
            setGiftPreview(null);
          }}
          placeholder="每行一个，或使用分号分隔。多个词按任一命中处理。"
          className="min-h-[8rem] w-full rounded-[1.5rem] border border-primary/20 bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary"
        />
        <p className="text-xs text-muted-foreground">当前解析：{splitKeywords(giftKeywordsInput).join('、') || '暂无关键词'}</p>
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
            礼物名单 {giftPreview?.rows.length ?? 0} 人
          </div>
        </div>

        {!giftPreview && !previewLoading && (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            还没有预览数据。先选择主播、场次和时间范围，再点击上方“预览”。
          </div>
        )}

        {giftPreview && (
          <>
            <div className="text-sm text-muted-foreground font-medium mb-2">
              礼物关键词：{giftPreview.gift_keywords.join('；')}
            </div>
            {giftPreview.rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                该时间段内没有命中礼物关键词的用户。
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
                      <TableHead>赠送数量</TableHead>
                      <TableHead>赠送时间</TableHead>
                      <TableHead>礼物清单</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {giftPreview.rows.map((row) => (
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
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">
                            {row.total_count}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-xs leading-5 text-muted-foreground">{row.send_times.join('；') || '-'}</TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-xs leading-5">{row.gift_list.join('；') || '-'}</TableCell>
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