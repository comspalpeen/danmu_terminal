'use client';

import { Radar, Database, Search, Loader2, Calendar, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HighLevelFanItem } from '@/types/tools';
import { formatDisplayTime } from '@/lib/tools-utils';

interface RadarPanelProps {
  queryDate: string;
  setQueryDate: (val: string) => void;
  scanStatus: 'idle' | 'processing' | 'completed' | 'failed';
  scanResults: HighLevelFanItem[];
  selectedFanIds: Set<string>;
  radarLoading: boolean;
  errorMessage: string;
  handleStartRadarScan: () => void;
  handleExportNewFans: () => void;
  handleExportAllFans: () => void;
  toggleSelectAll: () => void;
  toggleSelectOne: (id: string) => void;
  scanMessage: string;
}

export default function RadarPanel(props: RadarPanelProps) {
  const {
    queryDate, setQueryDate,
    scanStatus, scanResults, selectedFanIds, radarLoading, errorMessage, scanMessage, 
    handleStartRadarScan, handleExportNewFans, handleExportAllFans,
    toggleSelectAll, toggleSelectOne
  } = props;

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col gap-4 p-5 bg-card rounded-[1.5rem] border border-border shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Radar className="h-5 w-5 text-primary" /> 全频段数据同步
            </h3>
            <p className="text-xs text-muted-foreground">执行全量探测并更新数据库，保持粉丝池数据鲜活。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="default"
              onClick={handleStartRadarScan}
              disabled={scanStatus === 'processing'}
            >
              {scanStatus === 'processing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              {scanStatus === 'processing' ? '同步深网数据中...' : '启动全局更新'}
            </Button>
            <Button variant="outline" onClick={handleExportAllFans} disabled={radarLoading || scanStatus === 'processing'}>
              <Database className="h-4 w-4 mr-2 text-primary" />
              全量档案备份
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" /> 查询新增日期
            </label>
            <Input
              type="date"
              value={queryDate}
              onChange={(e) => setQueryDate(e.target.value)}
              className="w-auto h-9 font-mono"
            />
          </div>
          <div className="text-xs text-muted-foreground bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10">
            当前面板锁定于 {queryDate}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
          {errorMessage}
        </div>
      )}
      <div className="rounded-[1.75rem] border border-border bg-background/40 p-4 md:p-5 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
            <span className="text-primary underline decoration-primary/30 underline-offset-4">{queryDate}</span> 新增结果池
            {scanStatus === 'processing' && (
              <span className="flex h-2 w-2 relative ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            )}
          </h2>

          {scanResults.length > 0 && (
            <Button size="sm" variant="default" onClick={handleExportNewFans} disabled={radarLoading || selectedFanIds.size === 0} className="shadow-md">
              {radarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileDown className="h-4 w-4 mr-1" />}
              导出已勾选 ({selectedFanIds.size})
            </Button>
          )}
        </div>

        {scanStatus === 'processing' && (
          <div className="flex flex-col items-center justify-center py-12 text-primary/60 bg-primary/5 rounded-2xl border border-primary/10">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-sm font-medium animate-pulse max-w-md text-center">{props.scanMessage}</p>
          </div>
        )}

        {scanStatus !== 'processing' && scanResults.length === 0 && (
          <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 px-4 py-12 text-center text-sm text-primary/80">
            {queryDate} 当日数据库中未找到新增的高等级粉丝记录。
          </div>
        )}

        {scanStatus !== 'processing' && scanResults.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[50px] text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-primary cursor-pointer accent-primary"
                      checked={selectedFanIds.size === scanResults.length}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[60px]">头像</TableHead>
                  <TableHead>昵称 / 抖音号</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>亲密度</TableHead>
                  <TableHead>首次捕获时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanResults.map((user) => (
                  <TableRow key={user.user_id} className={selectedFanIds.has(user.user_id) ? "bg-primary/5" : ""}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-primary cursor-pointer accent-primary"
                        checked={selectedFanIds.has(user.user_id)}
                        onChange={() => toggleSelectOne(user.user_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <img src={user.avatar_url || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"} alt="avatar" className="w-9 h-9 rounded-full border border-border object-cover shadow-sm" />
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm max-w-[150px] truncate text-foreground" title={user.nickname}>{user.nickname}</div>
                      <div className="text-xs text-muted-foreground max-w-[150px] truncate mt-0.5" title={user.display_id}>{user.display_id}</div>
                    </TableCell>
                    <TableCell>
                      <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap shadow-sm">
                        Lv.{user.club_level}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {user.intimacy >= 10000 ? `${(user.intimacy / 10000).toFixed(1)}万` : user.intimacy}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground font-medium">
                        {formatDisplayTime(user.recorded_at)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}