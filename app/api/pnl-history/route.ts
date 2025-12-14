import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PnLDataPoint {
    timestamp: number;
    value: number;
    change: number;
    isOnline: boolean; // 标记系统是否在线
}

interface TradeMarker {
    timestamp: number;
    type: 'buy' | 'sell' | 'close';
    symbol: string;
    price: number;
    pnl?: number;
    side?: 'long' | 'short';
}

export async function GET(): Promise<NextResponse> {
    try {
        // 1. 从 Metrics 表获取真实账户余额历史
        const metricsRecord = await prisma.metrics.findFirst({
            where: { model: ModelType.Deepseek },
        });

        const history: PnLDataPoint[] = [];
        let previousValue: number | null = null;
        let previousTimestamp: number | null = null;

        if (metricsRecord && Array.isArray(metricsRecord.metrics)) {
            const metrics = metricsRecord.metrics as any[];

            for (let i = 0; i < metrics.length; i++) {
                const m = metrics[i];
                const perf = m.accountInformationAndPerformance;
                const timestamp = new Date(m.createdAt).getTime();

                // 账户总价值 = totalCashValue (钱包余额，已包含未实现盈亏)
                const value = perf?.totalCashValue || 0;

                // 检查是否有离线间隙 (超过5分钟没有数据则认为离线)
                const isOnline = previousTimestamp === null ||
                    (timestamp - previousTimestamp) < 5 * 60 * 1000;

                // 计算变化
                const change = previousValue !== null ? value - previousValue : 0;

                history.push({
                    timestamp,
                    value,
                    change,
                    isOnline,
                });

                previousValue = value;
                previousTimestamp = timestamp;
            }
        }

        // 2. 从 TradingDecision 表获取交易标记
        const decisions = await prisma.tradingDecision.findMany({
            take: 200,
            orderBy: { createdAt: "desc" },
        });

        const trades: TradeMarker[] = decisions
            .filter(d => {
                const fd = d.finalDecision as any;
                return fd?.decision && fd.decision !== 'Hold';
            })
            .map(d => {
                const fd = d.finalDecision as any;
                const tradeParams = fd.tradeParams || {};
                return {
                    timestamp: new Date(d.createdAt).getTime(),
                    type: fd.decision === 'Buy' ? 'buy' as const : 'sell' as const,
                    symbol: tradeParams.symbol || fd.analyzed_coin || 'BTC',
                    price: tradeParams.entryPrice || 0,
                    pnl: d.actualProfitLoss || undefined,
                    side: fd.decision === 'Buy' ? 'long' as const : 'short' as const,
                };
            });

        // 3. 从 Trading 表补充交易信息
        const tradingRecords = await prisma.trading.findMany({
            take: 100,
            orderBy: { createdAt: "desc" },
            where: {
                opeartion: { not: 'Hold' }
            }
        });

        for (const t of tradingRecords) {
            // 避免重复添加
            const existingTrade = trades.find(
                tr => Math.abs(tr.timestamp - new Date(t.createdAt).getTime()) < 60000
            );
            if (!existingTrade) {
                trades.push({
                    timestamp: new Date(t.createdAt).getTime(),
                    type: t.opeartion === 'Buy' ? 'buy' : 'sell',
                    symbol: t.symbol,
                    price: t.pricing || 0,
                    side: t.opeartion === 'Buy' ? 'long' : 'short',
                });
            }
        }

        // 按时间排序
        trades.sort((a, b) => a.timestamp - b.timestamp);

        // 4. 计算统计数据
        const wins = trades.filter(t => (t.pnl || 0) > 0).length;
        const losses = trades.filter(t => (t.pnl || 0) < 0).length;

        // 计算总盈亏
        const startValue = history.length > 0 ? history[0].value : 0;
        const endValue = history.length > 0 ? history[history.length - 1].value : 0;
        const totalPnL = endValue - startValue;

        // 计算最大回撤
        let peak = startValue;
        let maxDrawdown = 0;
        for (const point of history) {
            if (point.value > peak) peak = point.value;
            if (peak > 0) {
                const drawdown = (peak - point.value) / peak * 100;
                if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            }
        }

        // 5. 计算在线时长
        const onlinePoints = history.filter(p => p.isOnline).length;
        const totalPoints = history.length;
        const onlineRate = totalPoints > 0 ? (onlinePoints / totalPoints) * 100 : 0;

        return NextResponse.json({
            success: true,
            data: {
                history,
                trades,
                totalPnL,
                currentValue: endValue,
                startValue,
                winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
                totalTrades: trades.length,
                wins,
                losses,
                maxDrawdown,
                onlineRate,
                dataPoints: history.length,
            },
        });
    } catch (error) {
        console.error("Error in pnl-history API:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
