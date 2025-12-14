"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, RefreshCw, Wifi } from "lucide-react";

interface PnLDataPoint {
    timestamp: number;
    value: number;
    change: number;
    isOnline?: boolean;
}

interface TradeMarker {
    timestamp: number;
    type: 'buy' | 'sell' | 'close';
    symbol: string;
    price: number;
    pnl?: number;
}

interface PnLData {
    history: PnLDataPoint[];
    trades: TradeMarker[];
    totalPnL: number;
    currentValue: number;
    startValue: number;
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
    maxDrawdown: number;
    onlineRate: number;
    dataPoints: number;
}

type TimeRange = '1H' | '4H' | '1D' | '7D' | 'ALL';

const TIME_RANGES: { label: TimeRange; ms: number }[] = [
    { label: '1H', ms: 60 * 60 * 1000 },
    { label: '4H', ms: 4 * 60 * 60 * 1000 },
    { label: '1D', ms: 24 * 60 * 60 * 1000 },
    { label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'ALL', ms: Infinity },
];

export function PnLCurve() {
    const [data, setData] = useState<PnLData | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');

    const fetchData = useCallback(async () => {
        try {
            const response = await fetch('/api/pnl-history');
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    setData(result.data);
                }
            }
        } catch (err) {
            console.error("Error fetching PnL data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // 根据时间范围过滤数据
    const filteredHistory = useMemo(() => {
        if (!data) return [];
        const range = TIME_RANGES.find(r => r.label === timeRange);
        if (!range || range.ms === Infinity) return data.history;
        const cutoff = Date.now() - range.ms;
        return data.history.filter(p => p.timestamp >= cutoff);
    }, [data, timeRange]);

    // 计算统计数据
    const stats = useMemo(() => {
        if (filteredHistory.length === 0) return null;

        const values = filteredHistory.map(p => p.value);
        const startValue = values[0] || 0;
        const currentValue = values[values.length - 1] || 0;
        const change = currentValue - startValue;
        const changePercent = startValue > 0 ? (change / startValue) * 100 : 0;

        // 计算最大回撤
        let maxDrawdown = 0;
        let peak = values[0];
        for (const value of values) {
            if (value > peak) peak = value;
            const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        return { startValue, currentValue, change, changePercent, maxDrawdown };
    }, [filteredHistory]);

    // 生成 SVG 路径
    const chartPath = useMemo(() => {
        if (filteredHistory.length < 2) return '';

        const values = filteredHistory.map(p => p.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        const points = values.map((v, i) => {
            const x = (i / (values.length - 1)) * 100;
            const y = 100 - ((v - min) / range) * 100;
            return `${x},${y}`;
        });

        return `M ${points.join(' L ')}`;
    }, [filteredHistory]);

    // 生成填充区域路径
    const areaPath = useMemo(() => {
        if (!chartPath) return '';
        return `${chartPath} L 100,100 L 0,100 Z`;
    }, [chartPath]);

    const isPositive = (stats?.change || 0) >= 0;

    if (loading && !data) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4">
                {/* 头部：标题 + 时间选择器 */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        {isPositive ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm font-semibold">收益曲线</span>
                        {data && (
                            <span className="text-xs text-muted-foreground">
                                {data.dataPoints} 点
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="flex bg-muted/50 rounded p-0.5">
                            {TIME_RANGES.map(({ label }) => (
                                <button
                                    key={label}
                                    onClick={() => setTimeRange(label)}
                                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${timeRange === label
                                            ? 'bg-background shadow-sm text-foreground font-medium'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* 统计数据行 */}
                <div className="flex items-center gap-4 mb-3 text-xs">
                    <div>
                        <span className="text-muted-foreground">当前余额 </span>
                        <span className="font-bold">${(stats?.currentValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">盈亏 </span>
                        <span className={`font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}${(stats?.change || 0).toFixed(2)}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">收益率 </span>
                        <span className={`font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{(stats?.changePercent || 0).toFixed(2)}%
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">回撤 </span>
                        <span className="font-bold text-amber-500">-{(stats?.maxDrawdown || 0).toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Wifi className="w-3 h-3 text-muted-foreground" />
                        <span className="font-bold">{(data?.onlineRate || 0).toFixed(0)}%</span>
                    </div>
                </div>

                {/* 图表 */}
                {filteredHistory.length > 1 ? (
                    <div className="relative h-24 rounded-lg overflow-hidden bg-muted/20">
                        <svg
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            className="w-full h-full"
                        >
                            <defs>
                                <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0.25" />
                                    <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0.02" />
                                </linearGradient>
                            </defs>

                            {/* 水平网格线 */}
                            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" strokeDasharray="2,2" />

                            {/* 填充区域 */}
                            <path d={areaPath} fill="url(#pnlFill)" />

                            {/* 曲线 */}
                            <path
                                d={chartPath}
                                fill="none"
                                stroke={isPositive ? "#22c55e" : "#ef4444"}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                            />

                            {/* 最后一个点 */}
                            {filteredHistory.length > 0 && (
                                <circle
                                    cx="100"
                                    cy={(() => {
                                        const values = filteredHistory.map(p => p.value);
                                        const min = Math.min(...values);
                                        const max = Math.max(...values);
                                        const range = max - min || 1;
                                        const lastValue = values[values.length - 1];
                                        return 100 - ((lastValue - min) / range) * 100;
                                    })()}
                                    r="2"
                                    fill={isPositive ? "#22c55e" : "#ef4444"}
                                    className="animate-pulse"
                                />
                            )}
                        </svg>

                        {/* Y轴标签 */}
                        <div className="absolute left-1 top-1 text-[9px] text-muted-foreground font-mono">
                            ${Math.max(...filteredHistory.map(p => p.value)).toFixed(0)}
                        </div>
                        <div className="absolute left-1 bottom-1 text-[9px] text-muted-foreground font-mono">
                            ${Math.min(...filteredHistory.map(p => p.value)).toFixed(0)}
                        </div>
                    </div>
                ) : (
                    <div className="h-24 flex items-center justify-center text-muted-foreground text-sm bg-muted/20 rounded-lg">
                        暂无足够数据
                    </div>
                )}

                {/* 底部统计 */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                        <span>交易 <strong className="text-foreground">{data?.totalTrades || 0}</strong></span>
                        <span>盈 <strong className="text-green-500">{data?.wins || 0}</strong></span>
                        <span>亏 <strong className="text-red-500">{data?.losses || 0}</strong></span>
                        <span>胜率 <strong className="text-foreground">{(data?.winRate || 0).toFixed(0)}%</strong></span>
                    </div>
                    <div className="text-muted-foreground/70">
                        更新于 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
