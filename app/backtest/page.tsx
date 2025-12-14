'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Loader2, TrendingUp, TrendingDown, Activity, BarChart3, ArrowLeft } from 'lucide-react';

interface BacktestResult {
    config: {
        symbol: string;
        timeframe: string;
        startDate: string;
        endDate: string;
        initialCapital: number;
        maxLeverage: number;
    };
    performance: {
        totalReturn: number;
        totalReturnPercent: number;
        annualizedReturn: number;
        sharpeRatio: number;
        sortinoRatio: number;
        maxDrawdown: number;
        maxDrawdownPercent: number;
        winRate: number;
        profitFactor: number;
        totalTrades: number;
        totalFees: number;
    };
    equityCurve: Array<{ timestamp: number; equity: number; drawdown: number }>;
    trades: Array<{
        entryTime: number;
        exitTime: number;
        side: string;
        entryPrice: number;
        exitPrice: number;
        pnl: number;
        pnlPercent: number;
    }>;
    strategy: {
        name: string;
        description: string;
    };
}

const STRATEGIES = [
    { id: 'ema_cross', name: 'EMA 金叉死叉', description: 'EMA20/50 趋势追踪' },
    { id: 'rsi', name: 'RSI 超买超卖', description: 'RSI<30买入, RSI>70卖出' },
    { id: 'macd', name: 'MACD 信号', description: 'MACD 金叉死叉策略' },
    { id: 'bollinger', name: '布林带策略', description: '布林带突破回归' },
    { id: 'multi_indicator', name: '多指标组合', description: 'EMA + RSI + MACD' },
    { id: 'multi_agent', name: '多Agent系统', description: '多Agent投票决策' },
];

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
const TIMEFRAMES = [
    { value: '1h', label: '1小时' },
    { value: '4h', label: '4小时' },
    { value: '1d', label: '1天' },
];

export default function BacktestPage() {
    const [strategy, setStrategy] = useState('ema_cross');
    const [symbol, setSymbol] = useState('BTC/USDT');
    const [timeframe, setTimeframe] = useState('1h');
    const [days, setDays] = useState(30);
    const [initialCapital, setInitialCapital] = useState(10000);
    const [maxLeverage, setMaxLeverage] = useState(10);

    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runBacktest = async () => {
        setIsRunning(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch('/api/backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    strategy,
                    symbol,
                    timeframe,
                    days,
                    initialCapital,
                    maxLeverage,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '回测失败');
            }

            const data = await response.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsRunning(false);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
        }).format(value);
    };

    const formatPercent = (value: number) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
            {/* Background effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            <div className="relative max-w-[1400px] mx-auto p-4 md:p-8 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
                            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">策略回测</h1>
                            <p className="text-sm text-muted-foreground">使用历史数据验证交易策略</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex gap-6 border-b border-border/50">
                    <Link href="/" className="group relative pb-3 px-2 hover:opacity-80 transition-opacity">
                        <span className="text-sm font-semibold tracking-wide text-muted-foreground">LIVE</span>
                    </Link>
                    <Link href="/dashboard" className="group relative pb-3 px-2 hover:opacity-80 transition-opacity">
                        <span className="text-sm font-semibold tracking-wide text-muted-foreground">TRADING DASHBOARD</span>
                    </Link>
                    <button className="group relative pb-3 px-2">
                        <span className="text-sm font-bold tracking-wide bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">BACKTEST</span>
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" />
                    </button>
                </div>

                {/* Config Panel */}
                <Card className="p-6 border-border/50 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-500" />
                        回测配置
                    </h2>

                    {/* Strategy Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-muted-foreground mb-3">选择策略</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {STRATEGIES.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setStrategy(s.id)}
                                    className={`p-3 rounded-lg border text-left transition-all ${strategy === s.id
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                            : 'border-border hover:border-blue-300 hover:bg-muted/50'
                                        }`}
                                >
                                    <div className={`font-medium text-sm ${strategy === s.id ? 'text-blue-600' : ''}`}>{s.name}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Parameters */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-2">交易对</label>
                            <select
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {SYMBOLS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-2">时间框架</label>
                            <select
                                value={timeframe}
                                onChange={(e) => setTimeframe(e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {TIMEFRAMES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-2">回测天数</label>
                            <input
                                type="number"
                                value={days}
                                onChange={(e) => setDays(Number(e.target.value))}
                                min={7}
                                max={365}
                                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-2">初始资金</label>
                            <input
                                type="number"
                                value={initialCapital}
                                onChange={(e) => setInitialCapital(Number(e.target.value))}
                                min={1000}
                                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-2">最大杠杆</label>
                            <input
                                type="number"
                                value={maxLeverage}
                                onChange={(e) => setMaxLeverage(Number(e.target.value))}
                                min={1}
                                max={20}
                                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Run Button */}
                    <div className="flex justify-center">
                        <Button
                            onClick={runBacktest}
                            disabled={isRunning}
                            className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-8 py-2 shadow-lg shadow-blue-500/25"
                        >
                            {isRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    回测中...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 mr-2" />
                                    开始回测
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mt-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </Card>

                {/* Results */}
                {result && (
                    <>
                        {/* Strategy Info */}
                        <Card className="p-6 border-border/50 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">{result.strategy.name}</h2>
                                    <p className="text-sm text-muted-foreground">{result.strategy.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className={`text-2xl font-bold ${result.performance.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(result.performance.totalReturn)}
                                    </div>
                                    <div className={`text-sm ${result.performance.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatPercent(result.performance.totalReturnPercent)}
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Key Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard
                                title="总收益"
                                value={formatCurrency(result.performance.totalReturn)}
                                subValue={formatPercent(result.performance.totalReturnPercent)}
                                icon={<TrendingUp className="w-4 h-4" />}
                                positive={result.performance.totalReturn >= 0}
                            />
                            <MetricCard
                                title="年化收益"
                                value={formatPercent(result.performance.annualizedReturn)}
                                icon={<BarChart3 className="w-4 h-4" />}
                                positive={result.performance.annualizedReturn >= 0}
                            />
                            <MetricCard
                                title="最大回撤"
                                value={formatPercent(result.performance.maxDrawdownPercent)}
                                icon={<TrendingDown className="w-4 h-4" />}
                                positive={false}
                            />
                            <MetricCard
                                title="胜率"
                                value={formatPercent(result.performance.winRate)}
                                icon={<Activity className="w-4 h-4" />}
                                positive={result.performance.winRate >= 50}
                            />
                        </div>

                        {/* Stats Cards */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <Card className="p-6 border-border/50 shadow-sm">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-blue-500" />
                                    收益指标
                                </h3>
                                <div className="space-y-3">
                                    <StatRow label="总收益" value={`${formatCurrency(result.performance.totalReturn)} (${formatPercent(result.performance.totalReturnPercent)})`} />
                                    <StatRow label="年化收益" value={formatPercent(result.performance.annualizedReturn)} />
                                    <StatRow label="夏普比率" value={result.performance.sharpeRatio.toFixed(2)} />
                                    <StatRow label="索提诺比率" value={result.performance.sortinoRatio.toFixed(2)} />
                                    <StatRow label="盈亏比" value={result.performance.profitFactor.toFixed(2)} />
                                </div>
                            </Card>

                            <Card className="p-6 border-border/50 shadow-sm">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-blue-500" />
                                    交易统计
                                </h3>
                                <div className="space-y-3">
                                    <StatRow label="总交易次数" value={result.performance.totalTrades.toString()} />
                                    <StatRow label="胜率" value={formatPercent(result.performance.winRate)} />
                                    <StatRow label="最大回撤" value={`${formatCurrency(result.performance.maxDrawdown)} (${formatPercent(result.performance.maxDrawdownPercent)})`} />
                                    <StatRow label="总手续费" value={formatCurrency(result.performance.totalFees)} />
                                </div>
                            </Card>
                        </div>

                        {/* Trade List */}
                        {result.trades.length > 0 && (
                            <Card className="p-6 border-border/50 shadow-sm">
                                <h3 className="font-semibold mb-4">交易明细 ({result.trades.length} 笔)</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-muted-foreground">
                                                <th className="text-left py-2 px-3 font-medium">#</th>
                                                <th className="text-left py-2 px-3 font-medium">方向</th>
                                                <th className="text-left py-2 px-3 font-medium">开仓时间</th>
                                                <th className="text-right py-2 px-3 font-medium">开仓价</th>
                                                <th className="text-right py-2 px-3 font-medium">平仓价</th>
                                                <th className="text-right py-2 px-3 font-medium">盈亏</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.trades.slice(0, 20).map((trade, i) => (
                                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                                                    <td className="py-2 px-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${trade.side === 'long'
                                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                            }`}>
                                                            {trade.side === 'long' ? '做多' : '做空'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-muted-foreground">
                                                        {new Date(trade.entryTime).toLocaleString('zh-CN')}
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-mono">
                                                        ${trade.entryPrice.toFixed(2)}
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-mono">
                                                        ${trade.exitPrice.toFixed(2)}
                                                    </td>
                                                    <td className={`py-2 px-3 text-right font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                                                        }`}>
                                                        {formatCurrency(trade.pnl)} ({formatPercent(trade.pnlPercent)})
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {result.trades.length > 20 && (
                                        <div className="text-center text-muted-foreground py-3 text-sm">
                                            ... 还有 {result.trades.length - 20} 笔交易
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* Equity Curve */}
                        {result.equityCurve.length > 0 && (
                            <Card className="p-6 border-border/50 shadow-sm">
                                <h3 className="font-semibold mb-4">权益曲线</h3>
                                <EquityChart data={result.equityCurve} initialCapital={result.config.initialCapital} />
                            </Card>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function MetricCard({
    title,
    value,
    subValue,
    icon,
    positive
}: {
    title: string;
    value: string;
    subValue?: string;
    icon: React.ReactNode;
    positive: boolean;
}) {
    return (
        <Card className="p-4 border-border/50 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                {icon}
                <span className="text-sm font-medium">{title}</span>
            </div>
            <div className={`text-xl font-bold ${positive ? 'text-green-600' : 'text-red-600'}`}>
                {value}
            </div>
            {subValue && (
                <div className={`text-sm ${positive ? 'text-green-600' : 'text-red-600'}`}>{subValue}</div>
            )}
        </Card>
    );
}

function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
            <span className="text-muted-foreground text-sm">{label}</span>
            <span className="font-medium text-sm">{value}</span>
        </div>
    );
}

function EquityChart({
    data,
    initialCapital
}: {
    data: Array<{ timestamp: number; equity: number; drawdown: number }>;
    initialCapital: number;
}) {
    if (data.length === 0) return null;

    const maxEquity = Math.max(...data.map(d => d.equity));
    const minEquity = Math.min(...data.map(d => d.equity));
    const range = maxEquity - minEquity || 1;

    const step = Math.max(1, Math.floor(data.length / 100));
    const simplifiedData = data.filter((_, i) => i % step === 0);

    const points = simplifiedData.map((d, i) => {
        const x = (i / (simplifiedData.length - 1)) * 100;
        const y = 100 - ((d.equity - minEquity) / range) * 100;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="relative h-48">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                {/* Grid */}
                {[0, 25, 50, 75, 100].map(y => (
                    <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.2" />
                ))}

                {/* Initial capital line */}
                <line
                    x1="0"
                    y1={100 - ((initialCapital - minEquity) / range) * 100}
                    x2="100"
                    y2={100 - ((initialCapital - minEquity) / range) * 100}
                    stroke="currentColor"
                    strokeOpacity="0.3"
                    strokeWidth="0.3"
                    strokeDasharray="2,2"
                />

                {/* Equity curve */}
                <polyline
                    fill="none"
                    stroke="url(#equityGradient)"
                    strokeWidth="0.5"
                    points={points}
                />

                <defs>
                    <linearGradient id="equityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Labels */}
            <div className="absolute top-0 right-0 text-xs text-muted-foreground">
                ${maxEquity.toFixed(0)}
            </div>
            <div className="absolute bottom-0 right-0 text-xs text-muted-foreground">
                ${minEquity.toFixed(0)}
            </div>
        </div>
    );
}
