'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Card } from './ui/card';

interface BacktestResult {
    strategyName: string;
    period: string;
    totalReturn: number;
    totalReturnPercent: number;
    annualizedReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    profitFactor: number;
}

interface EquityPoint {
    time: string;
    equity: number;
    drawdown: number;
}

interface Strategy {
    id: string;
    name: string;
    description: string;
}

export function BacktestDashboard() {
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [selectedStrategy, setSelectedStrategy] = useState('multi_indicator');
    const [symbol, setSymbol] = useState('BTC/USDT');
    const [days, setDays] = useState(30);
    const [capital, setCapital] = useState(10000);
    const [leverage, setLeverage] = useState(10);
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 加载策略列表
    useEffect(() => {
        fetch('/api/backtest?action=strategies')
            .then(res => res.json())
            .then(data => setStrategies(data.strategies || []))
            .catch(console.error);
    }, []);

    // 运行回测
    const runBacktest = async () => {
        setIsRunning(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch('/api/backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    strategy: selectedStrategy,
                    symbol,
                    days,
                    capital,
                    leverage
                })
            });

            const data = await response.json();

            if (data.error) {
                setError(data.error);
            } else {
                setResult(data.summary);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* 配置面板 */}
            <Card className="p-6 bg-gray-900/50 border-gray-800">
                <h2 className="text-xl font-bold mb-4 text-white">📊 回测配置</h2>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">策略</label>
                        <select
                            value={selectedStrategy}
                            onChange={(e) => setSelectedStrategy(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                        >
                            {strategies.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">交易对</label>
                        <select
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                        >
                            <option value="BTC/USDT">BTC/USDT</option>
                            <option value="ETH/USDT">ETH/USDT</option>
                            <option value="SOL/USDT">SOL/USDT</option>
                            <option value="BNB/USDT">BNB/USDT</option>
                            <option value="DOGE/USDT">DOGE/USDT</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">天数</label>
                        <input
                            type="number"
                            value={days}
                            onChange={(e) => setDays(parseInt(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            min={7}
                            max={365}
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">初始资金</label>
                        <input
                            type="number"
                            value={capital}
                            onChange={(e) => setCapital(parseInt(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            min={100}
                            step={1000}
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">杠杆</label>
                        <input
                            type="number"
                            value={leverage}
                            onChange={(e) => setLeverage(parseInt(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            min={1}
                            max={30}
                        />
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={runBacktest}
                            disabled={isRunning}
                            className={`w-full py-2 px-4 rounded font-semibold transition-all ${isRunning
                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                                }`}
                        >
                            {isRunning ? '⏳ 运行中...' : '🚀 开始回测'}
                        </button>
                    </div>
                </div>

                {/* 策略描述 */}
                {selectedStrategy && strategies.length > 0 && (
                    <p className="mt-3 text-sm text-gray-500">
                        {strategies.find(s => s.id === selectedStrategy)?.description}
                    </p>
                )}
            </Card>

            {/* 错误提示 */}
            {error && (
                <Card className="p-4 bg-red-900/30 border-red-800">
                    <p className="text-red-400">❌ {error}</p>
                </Card>
            )}

            {/* 回测结果 */}
            {result && (
                <>
                    {/* 关键指标 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard
                            label="总收益"
                            value={`${result.totalReturn >= 0 ? '+' : ''}$${result.totalReturn.toFixed(2)}`}
                            subvalue={`${result.totalReturnPercent.toFixed(2)}%`}
                            positive={result.totalReturn >= 0}
                        />
                        <MetricCard
                            label="年化收益"
                            value={`${result.annualizedReturn.toFixed(2)}%`}
                            positive={result.annualizedReturn >= 0}
                        />
                        <MetricCard
                            label="夏普比率"
                            value={result.sharpeRatio.toFixed(2)}
                            subvalue={result.sharpeRatio >= 1 ? '良好' : result.sharpeRatio >= 0.5 ? '一般' : '较差'}
                            neutral
                        />
                        <MetricCard
                            label="最大回撤"
                            value={`${result.maxDrawdown.toFixed(2)}%`}
                            subvalue={result.maxDrawdown <= 10 ? '低风险' : result.maxDrawdown <= 20 ? '中风险' : '高风险'}
                            positive={false}
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard
                            label="胜率"
                            value={`${result.winRate.toFixed(1)}%`}
                            positive={result.winRate >= 50}
                        />
                        <MetricCard
                            label="交易次数"
                            value={result.totalTrades.toString()}
                            neutral
                        />
                        <MetricCard
                            label="盈亏比"
                            value={result.profitFactor.toFixed(2)}
                            positive={result.profitFactor >= 1}
                        />
                        <MetricCard
                            label="策略"
                            value={result.strategyName}
                            neutral
                            small
                        />
                    </div>

                    {/* 策略评级 */}
                    <Card className="p-6 bg-gray-900/50 border-gray-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-white">策略评级</h3>
                                <p className="text-gray-400 text-sm">{result.period}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-bold">
                                    {getStrategyRating(result)}
                                </div>
                                <p className="text-gray-400 text-sm">{getRatingDescription(result)}</p>
                            </div>
                        </div>
                    </Card>
                </>
            )}

            {/* 加载状态 */}
            {isRunning && (
                <Card className="p-8 bg-gray-900/50 border-gray-800">
                    <div className="flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-gray-400">正在运行回测...</p>
                        <p className="text-gray-500 text-sm mt-2">加载历史数据并执行策略中</p>
                    </div>
                </Card>
            )}
        </div>
    );
}

// 指标卡片组件
function MetricCard({
    label,
    value,
    subvalue,
    positive,
    neutral,
    small
}: {
    label: string;
    value: string;
    subvalue?: string;
    positive?: boolean;
    neutral?: boolean;
    small?: boolean;
}) {
    const valueColor = neutral
        ? 'text-blue-400'
        : positive
            ? 'text-green-400'
            : 'text-red-400';

    return (
        <Card className="p-4 bg-gray-900/50 border-gray-800">
            <p className="text-gray-400 text-sm mb-1">{label}</p>
            <p className={`${small ? 'text-lg' : 'text-2xl'} font-bold ${valueColor}`}>
                {value}
            </p>
            {subvalue && (
                <p className="text-gray-500 text-sm">{subvalue}</p>
            )}
        </Card>
    );
}

// 评级计算
function getStrategyRating(result: BacktestResult): string {
    let score = 0;
    if (result.sharpeRatio >= 2) score += 3;
    else if (result.sharpeRatio >= 1) score += 2;
    else if (result.sharpeRatio >= 0.5) score += 1;
    if (result.winRate >= 60) score += 2;
    else if (result.winRate >= 50) score += 1;
    if (result.maxDrawdown <= 10) score += 2;
    else if (result.maxDrawdown <= 20) score += 1;
    if (result.profitFactor >= 2) score += 2;
    else if (result.profitFactor >= 1.5) score += 1;

    if (score >= 8) return '⭐⭐⭐⭐⭐';
    if (score >= 6) return '⭐⭐⭐⭐';
    if (score >= 4) return '⭐⭐⭐';
    if (score >= 2) return '⭐⭐';
    return '⭐';
}

function getRatingDescription(result: BacktestResult): string {
    let score = 0;
    if (result.sharpeRatio >= 2) score += 3;
    else if (result.sharpeRatio >= 1) score += 2;
    else if (result.sharpeRatio >= 0.5) score += 1;
    if (result.winRate >= 60) score += 2;
    else if (result.winRate >= 50) score += 1;
    if (result.maxDrawdown <= 10) score += 2;
    else if (result.maxDrawdown <= 20) score += 1;
    if (result.profitFactor >= 2) score += 2;
    else if (result.profitFactor >= 1.5) score += 1;

    if (score >= 8) return '卓越策略 (A+)';
    if (score >= 6) return '优秀策略 (A)';
    if (score >= 4) return '良好策略 (B)';
    if (score >= 2) return '一般策略 (C)';
    return '需要优化 (D)';
}

export default BacktestDashboard;
