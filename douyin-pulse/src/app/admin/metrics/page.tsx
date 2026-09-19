"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Activity, Clock3, Database, Gauge, RefreshCw, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type MetricsItem = {
  timestamp: number;
  time: string;
  active_requests: number;
  peak_concurrency: number;
  total_requests: number;
  total_cost_ms: number;
  cache_hits: number;
  cache_misses: number;
  avg_cost_ms?: number;
  cache_hit_rate?: number;
  db_pool?: {
    size: number;
    idle: number;
    used: number;
    max: number;
  };
};

type RealtimeMetrics = {
  active_requests: number;
  peak_concurrency: number;
};

const RANGE_OPTIONS = [
  { label: "15 分钟", value: 15 },
  { label: "1 小时", value: 60 },
  { label: "6 小时", value: 360 },
  { label: "24 小时", value: 1440 },
] as const;

const POLLING_OPTIONS = [
  { label: "关闭轮询", value: 0 },
  { label: "10 秒", value: 10 },
  { label: "30 秒", value: 30 },
] as const;

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function average(items: MetricsItem[], picker: (item: MetricsItem) => number) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + picker(item), 0) / items.length;
}

export default function MetricsDashboardPage() {
  // 1. 持久化存储用户配置
  const [minutes, setMinutes] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("metrics_range_minutes");
      return saved ? Number(saved) : 60;
    }
    return 60;
  });

  const [pollingSeconds, setPollingSeconds] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("metrics_polling_seconds");
      return saved !== null ? Number(saved) : 10;
    }
    return 10;
  });

  // 2. 主题监听状态
  const [isPinkTheme, setIsPinkTheme] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsPinkTheme(document.documentElement.classList.contains("theme-pink"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const handleMinutesChange = (val: number) => {
    setMinutes(val);
    localStorage.setItem("metrics_range_minutes", String(val));
  };

  const handlePollingChange = (val: number) => {
    setPollingSeconds(val);
    localStorage.setItem("metrics_polling_seconds", String(val));
  };

  const [items, setItems] = useState<MetricsItem[]>([]);
  const [realtime, setRealtime] = useState<RealtimeMetrics>({ active_requests: 0, peak_concurrency: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [historyRes, realtimeRes] = await Promise.all([
        fetch(`/api/admin/metrics/history?minutes=${minutes}`),
        fetch("/api/admin/metrics/realtime"),
      ]);

      if (!historyRes.ok || !realtimeRes.ok) {
        throw new Error("metrics request failed");
      }

      const historyData = await historyRes.json();
      const realtimeData = await realtimeRes.json();

      const historyList: MetricsItem[] = historyData.data ?? historyData.items ?? (Array.isArray(historyData) ? historyData : []);
      const realtimeObj: RealtimeMetrics = realtimeData.data ?? realtimeData;

      setItems(historyList.sort((a, b) => a.timestamp - b.timestamp));
      setRealtime({
        active_requests: realtimeObj.active_requests ?? 0,
        peak_concurrency: realtimeObj.peak_concurrency ?? 0,
      });
      setLastUpdated(new Date().toLocaleTimeString("zh-CN"));
    } catch (e) {
      console.error(e);
      setError("监控数据读取失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [minutes]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (!pollingSeconds) return;
    const timer = window.setInterval(loadMetrics, pollingSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [loadMetrics, pollingSeconds]);

  // 3. 动态 ECharts 基础样式配置
  const chartBase = useMemo((): EChartsOption => {
    const textColor = isPinkTheme ? "#d946ef" : "rgba(125,255,189,0.72)";
    const lineColor = isPinkTheme ? "rgba(244,114,182,0.3)" : "rgba(125,255,189,0.35)";
    const splitLineColor = isPinkTheme ? "rgba(244,114,182,0.15)" : "rgba(125,255,189,0.12)";
    const palette = isPinkTheme
      ? ["#ec4899", "#f97316", "#8b5cf6", "#06b6d4"]
      : ["#00ff7f", "#ff8a00", "#45d5ff", "#ff4d6d"];

    return {
      color: palette,
      backgroundColor: "transparent",
      grid: { left: 48, right: 54, top: 40, bottom: 42 },
      tooltip: {
        trigger: "axis",
        borderWidth: 1,
        backgroundColor: isPinkTheme ? "rgba(255,255,255,0.9)" : "rgba(10,15,25,0.9)",
        borderColor: isPinkTheme ? "#f472b6" : "#00ff7f",
        textStyle: { color: isPinkTheme ? "#831843" : "#00ff7f" },
      },
      legend: { top: 0, textStyle: { color: textColor } },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLine: { lineStyle: { color: lineColor } },
        axisLabel: { color: textColor },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: splitLineColor } },
        axisLabel: { color: textColor },
      },
    };
  }, [isPinkTheme]);

  const labels = useMemo(() => items.map((item) => formatTime(item.timestamp)), [items]);
  
  // 4. 获取最新一周期快照
  const latestSnap = items.at(-1);

  // 👉 核心修复：计算当前图表时间范围内的历史最高峰值，并与实时峰值对比取最大者[cite: 9]
  const globalMaxPeak = Math.max(
    0,
    realtime.peak_concurrency || 0,
    ...(items.length > 0 ? items.map((item) => item.peak_concurrency) : [])
  );
  
  const totalRequests = items.reduce((sum, item) => sum + item.total_requests, 0);
  const totalHits = items.reduce((sum, item) => sum + item.cache_hits, 0);
  const totalMisses = items.reduce((sum, item) => sum + item.cache_misses, 0);
  const avgHitRate = totalHits + totalMisses ? totalHits / (totalHits + totalMisses) : 0;
  const avgLatency = totalRequests
    ? items.reduce((sum, item) => sum + item.total_cost_ms, 0) / totalRequests
    : average(items, (item) => item.avg_cost_ms ?? 0);

  // 5. 数据库连接池
  const dbPool = latestSnap?.db_pool ?? { used: 0, idle: 0, max: 30, size: 0 };
  const poolMax = dbPool.max > 0 ? dbPool.max : 30; 
  const usedConnections = dbPool.used ?? Math.max(0, dbPool.size - dbPool.idle);

  const qpsSeries = items.map((item) => Number((item.total_requests / 60).toFixed(2)));
  const requestSeries = items.map((item) => item.total_requests);
  const peakSeries = items.map((item) => item.peak_concurrency);
  const hitRateSeries = items.map((item) => Number(((item.cache_hit_rate ?? 0) * 100).toFixed(1)));
  const latencySeries = items.map((item) => Number((item.avg_cost_ms ?? 0).toFixed(1)));
  const usedSeries = items.map((item) => item.db_pool?.used ?? 0);
  const idleSeries = items.map((item) => item.db_pool?.idle ?? 0);

  const requestChart: EChartsOption = {
    ...chartBase,
    xAxis: { ...(chartBase.xAxis as object), data: labels },
    yAxis: [
      { ...(chartBase.yAxis as object), name: "QPS / 请求" },
      { ...(chartBase.yAxis as object), name: "并发", position: "right" },
    ],
    series: [
      { name: "QPS", type: "line", smooth: true, data: qpsSeries, areaStyle: { opacity: 0.08 } },
      { name: "请求数", type: "line", smooth: true, data: requestSeries },
      { name: "峰值并发", type: "line", smooth: true, yAxisIndex: 1, data: peakSeries },
    ],
  };

  const cacheChart: EChartsOption = {
    ...chartBase,
    xAxis: { ...(chartBase.xAxis as object), data: labels },
    yAxis: [
      { ...(chartBase.yAxis as object), name: "命中率 %", max: 100 },
      { ...(chartBase.yAxis as object), name: "ms", position: "right" },
    ],
    series: [
      { name: "缓存命中率", type: "line", smooth: true, data: hitRateSeries },
      { name: "平均延迟", type: "line", smooth: true, yAxisIndex: 1, data: latencySeries },
    ],
  };

  const dbChart: EChartsOption = {
    ...chartBase,
    xAxis: { ...(chartBase.xAxis as object), data: labels },
    yAxis: { ...(chartBase.yAxis as object), name: "连接数" },
    series: [
      { name: "Used Connections", type: "line", stack: "pool", smooth: true, areaStyle: { opacity: 0.16 }, data: usedSeries },
      { name: "Idle Connections", type: "line", stack: "pool", smooth: true, areaStyle: { opacity: 0.1 }, data: idleSeries },
    ],
  };

  const cards = [
    {
      title: "实时 / 周期峰值并发",
      value: `${realtime.active_requests} / ${globalMaxPeak}`, // 👉 使用新计算的全局峰值[cite: 9]
      meta: "Global Active & Peak",
      icon: Activity,
    },
    {
      title: "平均缓存命中率",
      value: percent(avgHitRate),
      meta: `${totalHits} hits / ${totalMisses} misses`,
      icon: Gauge,
    },
    {
      title: "平均响应延迟",
      value: `${avgLatency.toFixed(1)} ms`,
      meta: `${totalRequests} requests`,
      icon: Clock3,
    },
    {
      title: "数据库连接池",
      value: `${usedConnections} / ${poolMax}`,
      meta: `${dbPool.idle} idle (全局总连接: ${dbPool.size})`,
      icon: Database,
    },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-foreground md:text-3xl">
              <Wifi className="h-8 w-8 text-primary" />
              API 性能监控看板
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {lastUpdated ? `最后更新 ${lastUpdated}` : "等待首次采样"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={minutes}
              onChange={(event) => handleMinutesChange(Number(event.target.value))}
              className="h-10 border border-border bg-card px-3 text-sm font-bold text-foreground outline-none focus:border-primary transition-colors"
              aria-label="查询时间范围"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-card text-foreground">
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={pollingSeconds}
              onChange={(event) => handlePollingChange(Number(event.target.value))}
              className="h-10 border border-border bg-card px-3 text-sm font-bold text-foreground outline-none focus:border-primary transition-colors"
              aria-label="轮询间隔"
            >
              {POLLING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-card text-foreground">
                  {option.label}
                </option>
              ))}
            </select>
            <Button onClick={loadMetrics} disabled={loading} variant="outline" className="h-10">
              <RefreshCw className={`h-4 w-4 text-primary ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Link href="/admin" className="px-2 text-sm font-bold text-primary hover:underline">
              返回管理首页
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="min-h-[132px] border-border bg-card/80 shadow-lg">
                <CardContent className="flex h-full items-center justify-between gap-4 py-5">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-muted-foreground">{card.title}</p>
                    <p className="mt-3 text-3xl font-black text-foreground">{card.value}</p>
                    <p className="mt-2 truncate text-xs text-muted-foreground">{card.meta}</p>
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 rounded-md">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {error ? <div className="border border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</div> : null}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="border-border shadow-lg xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg font-black text-foreground">请求量与并发趋势</CardTitle>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ReactECharts option={requestChart} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
            </CardContent>
          </Card>

          <Card className="border-border shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-black text-foreground">缓存命中率与延迟</CardTitle>
            </CardHeader>
            <CardContent className="h-[340px]">
              <ReactECharts option={cacheChart} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
            </CardContent>
          </Card>

          <Card className="border-border shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-black text-foreground">数据库连接池</CardTitle>
            </CardHeader>
            <CardContent className="h-[340px]">
              <ReactECharts option={dbChart} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}