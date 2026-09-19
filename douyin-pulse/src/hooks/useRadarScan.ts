import { useState, useEffect, useCallback } from 'react';
import { HighLevelFanItem } from '@/types/tools';
import { triggerBlobDownload } from '@/lib/tools-utils';

export function useRadarScan(isActive: boolean) {
  const [scanTaskId, setScanTaskId] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [scanResults, setScanResults] = useState<HighLevelFanItem[]>([]);
  const [selectedFanIds, setSelectedFanIds] = useState<Set<string>>(new Set());
  const [radarLoading, setRadarLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scanMessage, setScanMessage] = useState('准备穿透全网并脱水，请稍候...');
  const [queryDate, setQueryDate] = useState(() => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
  });

  const fetchDailyNewFans = useCallback(async (dateStr: string) => {
    setRadarLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/tools/high-level/daily-new?query_date=${dateStr}`);
      if (!res.ok) throw new Error('获取按日数据失败');
      const result = await res.json();
      setScanResults(result.data || []);
      const allIds = (result.data || []).map((f: HighLevelFanItem) => f.user_id);
      setSelectedFanIds(new Set(allIds));
      setScanStatus('idle');
    } catch (e) {
      setErrorMessage('无法加载当天的新增数据');
    } finally {
      setRadarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) fetchDailyNewFans(queryDate);
  }, [queryDate, isActive, fetchDailyNewFans]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    const checkScanStatus = async () => {
      try {
        const res = await fetch(
          `/api/tools/high-level/scan/status?task_id=${scanTaskId}&_t=${Date.now()}`, 
          { cache: 'no-store' }
        );
        
        if (!res.ok) throw new Error('轮询接口异常');
        const data = await res.json();
        
        if (data.message) {
          setScanMessage(data.message);
        }
        
        if (data.status === 'completed') {
          setScanStatus('completed');
          setTimeout(() => fetchDailyNewFans(queryDate), 1000); 
        } else if (data.status === 'failed') {
          setScanStatus('failed');
          setErrorMessage(data.message || '扫描过程发生错误');
        }
      } catch (error) {
        console.error("状态轮询失败:", error);
      }
    };

    if (scanStatus === 'processing' && scanTaskId) {
      intervalId = setInterval(checkScanStatus, 2500);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [scanStatus, scanTaskId, queryDate, fetchDailyNewFans]);

  const handleStartRadarScan = async () => {
    setErrorMessage('');
    setScanStatus('idle');
    setScanResults([]);
    setScanMessage('正在初始化探测任务...'); // 重置消息
    try {
      const response = await fetch('/api/tools/high-level/scan/start', { method: 'POST' });
      if (!response.ok) throw new Error('启动扫描失败，请检查后端服务。');
      const data = await response.json();
      setScanTaskId(data.task_id);
      setScanStatus('processing');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '请求异常');
    }
  };

  const handleExportNewFans = async () => {
    if (selectedFanIds.size === 0) return setErrorMessage('请至少勾选一名新增用户');
    setRadarLoading(true);
    setErrorMessage('');
    try {
      const selectedFans = scanResults.filter(f => selectedFanIds.has(f.user_id));
      const response = await fetch('/api/tools/high-level/export-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: Array.from(selectedFanIds) }),
      });
      if (!response.ok) throw new Error('导出生成失败');
      triggerBlobDownload(response, `${queryDate}新增16级粉丝.html`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '下载失败');
    } finally {
      setRadarLoading(false);
    }
  };

  const handleExportAllFans = async () => {
    setRadarLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/tools/high-level/export-all');
      if (!response.ok) throw new Error('全量导出失败');
      triggerBlobDownload(response, '全量高等级粉丝报表.html');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '下载失败');
    } finally {
      setRadarLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedFanIds.size === scanResults.length) {
      setSelectedFanIds(new Set());
    } else {
      setSelectedFanIds(new Set(scanResults.map(f => f.user_id)));
    }
  };

  const toggleSelectOne = (userId: string) => {
    const nextSet = new Set(selectedFanIds);
    if (nextSet.has(userId)) nextSet.delete(userId);
    else nextSet.add(userId);
    setSelectedFanIds(nextSet);
  };

  return {
    queryDate, setQueryDate,
    scanStatus, scanResults, selectedFanIds, radarLoading, errorMessage,scanMessage,
    handleStartRadarScan, handleExportNewFans, handleExportAllFans,
    toggleSelectAll, toggleSelectOne
  };
}