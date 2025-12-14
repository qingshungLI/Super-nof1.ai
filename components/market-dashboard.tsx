"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    DollarSign,
    BarChart3,
    Layers,
    Percent
} from "lucide-react";

interface KlineData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    trend: "bullish" | "bearish";
    change_percent: number;
}

interface MarketState {
    current_price: number;
    current_ema20: number;
    current_macd: number;
    current_rsi: number;
    open_interest: { latest: number; average: number };
    funding_rate: number;
    intraday: {
        mid_prices: number[];
        ema_20: number[];
        macd: number[];
        rsi_7: number[];
        rsi_14: number[];
    };
    longer_term: {
        ema_20: number;
        ema_50: number;
        atr_3: number;
        atr_14: number;
        current_volume: number;
        average_volume: number;
        macd: number[];
        rsi_14: number[];
    };
    kline_data: {
        minute_1: KlineData[];
        hour_4: KlineData[];
        minute_15: KlineData[];
    };
}

interface Position {
    symbol: string;
    side: string;
    contracts: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnl: number;
    percentage: number;
    leverage: number;
    liquidationPrice: number;
}

interface MarketData {
    markets: { symbol: string; state: MarketState }[];
    positions: Position[];
    timestamp: string;
}

const SYMBOL_ICONS: Record<string, string> = {
    "BTC/USDT": "₿",
    "ETH/USDT": "Ξ",
    "SOL/USDT": "◎",
    "BNB/USDT": "🔶",
    "DOGE/USDT": "🐕",
};

function formatNumber(num: number, decimals: number = 2): string {
    if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(decimals);
}

function formatPrice(price: number, symbol: string): string {
    if (symbol.includes("DOGE")) return price.toFixed(5);
    if (symbol.includes("SOL") || symbol.includes("BNB")) return price.toFixed(2);
    return price.toFixed(2);
}

// Mini K线图组件 - 改进版
function MiniKlineChart({ klines, height = 40 }: { klines: KlineData[]; height?: number }) {
    if (!klines || klines.length === 0) {
        return (
            <div className="flex items-center justify-center h-8 text-xs text-muted-foreground">
                无数据
            </div>
        );
    }

    // 获取最近12根K线
    const displayKlines = klines.slice(-12);
    const maxHigh = Math.max(...displayKlines.map(k => k.high));
    const minLow = Math.min(...displayKlines.map(k => k.low));
    const range = maxHigh - minLow || 1;

    // 计算整体趋势
    const firstClose = displayKlines[0]?.close || 0;
    const lastClose = displayKlines[displayKlines.length - 1]?.close || 0;
    const overallTrend = lastClose >= firstClose ? 'bullish' : 'bearish';

    return (
        <div className="flex items-end gap-[2px]" style={{ height: `${height}px` }}>
            {displayKlines.map((k, i) => {
                const bodyTop = Math.max(k.open, k.close);
                const bodyBottom = Math.min(k.open, k.close);
                const wickTop = k.high;
                const wickBottom = k.low;

                // 计算百分比位置
                const bodyHeight = Math.max(((bodyTop - bodyBottom) / range) * 100, 5);
                const bodyBottom_pct = ((bodyBottom - minLow) / range) * 100;
                const wickHeight = ((wickTop - wickBottom) / range) * 100;
                const wickBottom_pct = ((wickBottom - minLow) / range) * 100;

                const isBullish = k.close >= k.open;
                const isLastCandle = i === displayKlines.length - 1;

                return (
                    <div
                        key={i}
                        className={`relative flex-1 min-w-[3px] max-w-[6px] h-full ${isLastCandle ? 'opacity-100' : 'opacity-70'}`}
                    >
                        {/* Wick */}
                        <div
                            className={`absolute w-[1px] left-1/2 -translate-x-1/2 ${isBullish ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{
                                bottom: `${wickBottom_pct}%`,
                                height: `${wickHeight}%`,
                            }}
                        />
                        {/* Body */}
                        <div
                            className={`absolute w-full rounded-[1px] ${isBullish ? 'bg-green-500' : 'bg-red-500'} ${isLastCandle ? 'shadow-sm' : ''}`}
                            style={{
                                bottom: `${bodyBottom_pct}%`,
                                height: `${bodyHeight}%`,
                            }}
                        />
                    </div>
                );
            })}
            {/* 趋势指示器 */}
            <div className={`ml-1 flex items-center ${overallTrend === 'bullish' ? 'text-green-500' : 'text-red-500'}`}>
                {overallTrend === 'bullish' ? (
                    <TrendingUp className="w-3 h-3" />
                ) : (
                    <TrendingDown className="w-3 h-3" />
                )}
            </div>
        </div>
    );
}

// RSI 仪表组件
function RSIGauge({ value }: { value: number }) {
    const getColor = (val: number) => {
        if (val >= 70) return "text-red-500";
        if (val <= 30) return "text-green-500";
        return "text-yellow-500";
    };

    const getLabel = (val: number) => {
        if (val >= 70) return "超买";
        if (val <= 30) return "超卖";
        return "中性";
    };

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-12 h-12">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                        cx="18" cy="18" r="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-muted/20"
                    />
                    <circle
                        cx="18" cy="18" r="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${value * 0.94} 100`}
                        className={getColor(value)}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-xs font-bold ${getColor(value)}`}>
                        {value.toFixed(0)}
                    </span>
                </div>
            </div>
            <div className="text-xs text-muted-foreground">{getLabel(value)}</div>
        </div>
    );
}

// 单个市场卡片
function MarketCard({ symbol, state }: { symbol: string; state: MarketState }) {
    const priceChange = state.kline_data.minute_1.length > 1
        ? ((state.current_price - state.kline_data.minute_1[0].open) / state.kline_data.minute_1[0].open) * 100
        : 0;
    const isPositive = priceChange >= 0;

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{SYMBOL_ICONS[symbol] || "🪙"}</span>
                        <CardTitle className="text-base">{symbol.replace("/USDT", "")}</CardTitle>
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {priceChange.toFixed(2)}%
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Price */}
                <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold">${formatPrice(state.current_price, symbol)}</span>
                    <MiniKlineChart klines={state.kline_data.minute_15} />
                </div>

                {/* Indicators Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                        <Activity className="w-3 h-3 text-blue-500" />
                        <span className="text-muted-foreground">MACD</span>
                        <span className={`ml-auto font-medium ${state.current_macd >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {state.current_macd.toFixed(2)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                        <BarChart3 className="w-3 h-3 text-purple-500" />
                        <span className="text-muted-foreground">EMA20</span>
                        <span className="ml-auto font-medium">{formatNumber(state.current_ema20)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                        <Layers className="w-3 h-3 text-amber-500" />
                        <span className="text-muted-foreground">OI</span>
                        <span className="ml-auto font-medium">{formatNumber(state.open_interest.latest)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                        <Percent className="w-3 h-3 text-cyan-500" />
                        <span className="text-muted-foreground">资金费</span>
                        <span className={`ml-auto font-medium ${state.funding_rate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {(state.funding_rate * 100).toFixed(4)}%
                        </span>
                    </div>
                </div>

                {/* RSI */}
                <div className="flex items-center justify-between pt-2 border-t">
                    <RSIGauge value={state.current_rsi} />
                    <div className="text-right">
                        <div className="text-xs text-muted-foreground">ATR (14)</div>
                        <div className="text-sm font-medium">{state.longer_term.atr_14.toFixed(2)}</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// 持仓卡片
function PositionsCard({ positions }: { positions: Position[] }) {
    if (positions.length === 0) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        当前持仓
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-6 text-muted-foreground">
                        暂无持仓
                    </div>
                </CardContent>
            </Card>
        );
    }

    const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        当前持仓
                    </CardTitle>
                    <div className={`text-sm font-medium ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        总盈亏: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDT
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {positions.map((position) => (
                    <div
                        key={position.symbol}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`px-2 py-0.5 rounded text-xs font-medium ${position.side === 'long'
                                ? 'bg-green-500/20 text-green-500'
                                : 'bg-red-500/20 text-red-500'
                                }`}>
                                {position.side === 'long' ? '多' : '空'} {position.leverage}x
                            </div>
                            <div>
                                <div className="font-medium">{position.symbol}</div>
                                <div className="text-xs text-muted-foreground">
                                    {position.contracts} 张 @ {position.entryPrice.toFixed(2)}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`font-medium ${position.unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {position.unrealizedPnl >= 0 ? '+' : ''}{position.unrealizedPnl.toFixed(2)}
                            </div>
                            <div className={`text-xs ${position.percentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {position.percentage >= 0 ? '+' : ''}{position.percentage.toFixed(2)}%
                            </div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

export function MarketDashboard() {
    const [data, setData] = useState<MarketData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const response = await fetch("/api/market-data");
            if (!response.ok) return;

            const result = await response.json();
            if (result.success && result.data) {
                setData(result.data);
                setLastUpdate(new Date());
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching market data:", err);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // 每10秒刷新
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                无法加载市场数据
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    市场概览
                </h2>
                {lastUpdate && (
                    <span className="text-xs text-muted-foreground">
                        更新于 {lastUpdate.toLocaleTimeString()}
                    </span>
                )}
            </div>

            {/* Market Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {data.markets.map(({ symbol, state }) => (
                    <MarketCard key={symbol} symbol={symbol} state={state} />
                ))}
            </div>

            {/* Positions */}
            <PositionsCard positions={data.positions} />
        </div>
    );
}
