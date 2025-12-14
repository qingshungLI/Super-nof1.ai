/**
 * 回测 API 端点
 */

import { NextRequest, NextResponse } from 'next/server';
import { BacktestEngine } from '@/lib/backtest/engine';
import { BacktestReporter } from '@/lib/backtest/reporter';
import { createStrategy, StrategyType, BuiltInStrategies } from '@/lib/backtest/strategy';
import { BacktestConfig, BacktestResult } from '@/lib/backtest/types';

// 存储回测结果（简易缓存）
const backtestResults = new Map<string, BacktestResult>();

/**
 * GET - 获取可用策略列表或回测结果
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // 获取可用策略
    if (action === 'strategies') {
        const strategies = Object.entries(BuiltInStrategies).map(([key, Strategy]) => {
            const s = new Strategy();
            return {
                id: key,
                name: s.name,
                description: s.description,
                version: s.version
            };
        });

        return NextResponse.json({ strategies });
    }

    // 获取历史回测结果
    if (action === 'results') {
        const results = Array.from(backtestResults.entries()).map(([id, result]) => ({
            id,
            strategyName: result.strategyName,
            startDate: result.startDate,
            endDate: result.endDate,
            totalReturn: result.performance.totalReturnPercent,
            sharpeRatio: result.performance.sharpeRatio,
            trades: result.tradeStatistics.totalTrades
        }));

        return NextResponse.json({ results });
    }

    // 获取单个回测结果
    const resultId = searchParams.get('id');
    if (resultId) {
        const result = backtestResults.get(resultId);
        if (result) {
            return NextResponse.json({ result });
        }
        return NextResponse.json({ error: '未找到回测结果' }, { status: 404 });
    }

    return NextResponse.json({
        message: '回测 API',
        endpoints: {
            'GET ?action=strategies': '获取可用策略列表',
            'GET ?action=results': '获取历史回测结果',
            'GET ?id=xxx': '获取单个回测结果',
            'POST': '启动新的回测'
        }
    });
}

/**
 * POST - 启动回测
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const {
            strategy = 'multi_indicator',
            symbol = 'BTC/USDT',
            days = 30,
            initialCapital = 10000,
            maxLeverage = 10,
            timeframe = '1h'
        } = body;

        // 验证策略
        if (!Object.keys(BuiltInStrategies).includes(strategy)) {
            return NextResponse.json({
                error: `未知策略: ${strategy}`,
                available: Object.keys(BuiltInStrategies)
            }, { status: 400 });
        }

        // 计算时间范围
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // 创建策略
        const strategyInstance = createStrategy(strategy as StrategyType);

        // 配置回测
        const config: BacktestConfig = {
            startDate,
            endDate,
            symbols: [symbol],
            timeframe: timeframe as any,
            initialCapital: initialCapital,
            makerFee: 0.0002,
            takerFee: 0.0004,
            slippageModel: 'fixed',
            slippagePercent: 0.0005,
            maxLeverage: maxLeverage,
            marginCallLevel: 0.5,
            liquidationLevel: 0.2,
            strategy: strategyInstance,
            strategyConfig: {
                symbols: [symbol],
                initialCapital: initialCapital,
                maxPositionSize: 0.3,
                maxLeverage: maxLeverage,
                riskPerTrade: 0.02,
                stopLossPercent: 3,
                takeProfitPercent: 6
            },
            dataSource: 'binance'
        };

        // 运行回测
        console.log(`🚀 启动回测: ${strategy} on ${symbol}`);
        const engine = new BacktestEngine(config);
        const result = await engine.run();

        // 生成报告
        const reporter = new BacktestReporter(result);
        const reports = await reporter.generateAll();

        // 保存结果
        const resultId = `backtest_${Date.now()}`;
        backtestResults.set(resultId, result);

        // 限制缓存大小
        if (backtestResults.size > 10) {
            const firstKey = backtestResults.keys().next().value;
            if (firstKey) backtestResults.delete(firstKey);
        }

        // 返回前端需要的格式
        // 计算已平仓交易的实际总盈亏（确保和明细一致）
        const actualTotalPnl = result.trades.reduce((sum: number, t: any) => sum + t.pnl, 0);
        const actualTotalPnlPercent = (actualTotalPnl / initialCapital) * 100;

        return NextResponse.json({
            config: {
                symbol,
                timeframe,
                startDate: result.startDate,
                endDate: result.endDate,
                initialCapital: initialCapital,
                maxLeverage: maxLeverage
            },
            strategy: {
                name: result.strategyName,
                description: strategyInstance.description
            },
            performance: {
                totalReturn: actualTotalPnl,  // 使用实际交易总和
                totalReturnPercent: actualTotalPnlPercent,
                annualizedReturn: result.performance.annualizedReturn,
                sharpeRatio: result.performance.sharpeRatio,
                sortinoRatio: result.performance.sortinoRatio,
                maxDrawdown: result.performance.maxDrawdown,
                maxDrawdownPercent: result.performance.maxDrawdownPercent,
                winRate: result.tradeStatistics.winRate,
                profitFactor: result.performance.profitFactor,
                totalTrades: result.tradeStatistics.totalTrades,
                totalFees: result.tradeStatistics.totalFees
            },
            equityCurve: result.equityCurve.map(e => ({
                timestamp: e.timestamp,
                equity: e.equity,
                drawdown: e.drawdown
            })),
            trades: result.trades.map((t: any) => ({
                entryTime: t.entryTime,
                exitTime: t.exitTime,
                side: t.side,
                entryPrice: t.entryPrice,
                exitPrice: t.exitPrice,
                pnl: t.pnl,
                pnlPercent: t.pnlPercent
            })),
            reports: {
                json: reports.json,
                html: reports.html
            }
        });

    } catch (error: any) {
        console.error('回测错误:', error);
        return NextResponse.json({
            error: '回测执行失败',
            message: error.message
        }, { status: 500 });
    }
}
