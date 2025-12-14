/**
 * 回测 CLI 工具
 * 命令行运行回测
 * 
 * 使用方式:
 *   npx tsx scripts/run-backtest.ts
 *   npx tsx scripts/run-backtest.ts --strategy=ema_cross --symbol=BTC/USDT --days=30
 */

import { BacktestEngine } from '../lib/backtest/engine';
import { BacktestReporter } from '../lib/backtest/reporter';
import { createStrategy, BuiltInStrategies, StrategyType } from '../lib/backtest/strategy';
import { DataLoader } from '../lib/backtest/data-loader';
import { BacktestConfig } from '../lib/backtest/types';

// 解析命令行参数
function parseArgs(): {
    strategy: StrategyType;
    symbol: string;
    days: number;
    capital: number;
    leverage: number;
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
} {
    const args = process.argv.slice(2);
    const params: Record<string, string> = {};

    for (const arg of args) {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            params[key] = value;
        }
    }

    return {
        strategy: (params.strategy as StrategyType) || 'multi_indicator',
        symbol: params.symbol || 'BTC/USDT',
        days: parseInt(params.days || '30'),
        capital: parseInt(params.capital || '10000'),
        leverage: parseInt(params.leverage || '10'),
        timeframe: (params.timeframe as any) || '15m'
    };
}

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              🚀 Super-NOF1.AI 回测系统 v1.0                      ║
╚══════════════════════════════════════════════════════════════════╝
    `);

    const params = parseArgs();

    console.log('📋 回测参数:');
    console.log(`   策略:     ${params.strategy}`);
    console.log(`   交易对:   ${params.symbol}`);
    console.log(`   周期:     ${params.days} 天`);
    console.log(`   初始资金: $${params.capital.toLocaleString()}`);
    console.log(`   最大杠杆: ${params.leverage}x`);
    console.log(`   时间框架: ${params.timeframe}`);
    console.log('');

    // 可用策略列表
    console.log('📚 可用策略:');
    for (const [key, Strategy] of Object.entries(BuiltInStrategies)) {
        const s = new Strategy();
        console.log(`   - ${key}: ${s.description}`);
    }
    console.log('');

    // 计算时间范围
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - params.days);

    // 创建策略
    const strategy = createStrategy(params.strategy);
    console.log(`✅ 使用策略: ${strategy.name} v${strategy.version}`);
    console.log(`   ${strategy.description}\n`);

    // 配置回测
    const config: BacktestConfig = {
        startDate,
        endDate,
        symbols: [params.symbol],
        timeframe: params.timeframe,
        initialCapital: params.capital,
        makerFee: 0.0002,      // 0.02%
        takerFee: 0.0004,      // 0.04%
        slippageModel: 'fixed',
        slippagePercent: 0.0005, // 0.05%
        maxLeverage: params.leverage,
        marginCallLevel: 0.5,
        liquidationLevel: 0.2,
        strategy,
        strategyConfig: {
            symbols: [params.symbol],
            initialCapital: params.capital,
            maxPositionSize: 0.3,     // 最大使用30%资金
            maxLeverage: params.leverage,
            riskPerTrade: 0.02,       // 单笔风险2%
            stopLossPercent: 3,       // 3%止损
            takeProfitPercent: 6      // 6%止盈
        },
        dataSource: 'binance',
        onProgress: (progress) => {
            // 进度回调（引擎内部已处理输出）
        }
    };

    // 运行回测
    const engine = new BacktestEngine(config);
    const result = await engine.run();

    // 生成报告
    const reporter = new BacktestReporter(result);
    await reporter.generateAll();

    // 输出简要结果
    console.log('\n📊 关键指标:');
    console.log(`   总收益: ${result.performance.totalReturn >= 0 ? '+' : ''}$${result.performance.totalReturn.toFixed(2)} (${result.performance.totalReturnPercent.toFixed(2)}%)`);
    console.log(`   年化收益: ${result.performance.annualizedReturn.toFixed(2)}%`);
    console.log(`   夏普比率: ${result.performance.sharpeRatio.toFixed(2)}`);
    console.log(`   最大回撤: ${result.performance.maxDrawdownPercent.toFixed(2)}%`);
    console.log(`   胜率: ${result.tradeStatistics.winRate.toFixed(1)}%`);
    console.log(`   交易次数: ${result.tradeStatistics.totalTrades}`);

    // 评级
    const rating = rateStrategy(result);
    console.log(`\n🏆 策略评级: ${rating}`);
}

/**
 * 策略评级
 */
function rateStrategy(result: any): string {
    const { performance: perf, tradeStatistics: stats } = result;

    let score = 0;

    // 夏普比率评分
    if (perf.sharpeRatio >= 2) score += 3;
    else if (perf.sharpeRatio >= 1) score += 2;
    else if (perf.sharpeRatio >= 0.5) score += 1;

    // 胜率评分
    if (stats.winRate >= 60) score += 2;
    else if (stats.winRate >= 50) score += 1;

    // 最大回撤评分
    if (perf.maxDrawdownPercent <= 10) score += 2;
    else if (perf.maxDrawdownPercent <= 20) score += 1;

    // 盈亏比评分
    if (perf.profitFactor >= 2) score += 2;
    else if (perf.profitFactor >= 1.5) score += 1;

    // 收益评分
    if (perf.annualizedReturn >= 50) score += 2;
    else if (perf.annualizedReturn >= 20) score += 1;

    // 评级
    if (score >= 10) return '⭐⭐⭐⭐⭐ 卓越 (A+)';
    if (score >= 8) return '⭐⭐⭐⭐ 优秀 (A)';
    if (score >= 6) return '⭐⭐⭐ 良好 (B)';
    if (score >= 4) return '⭐⭐ 一般 (C)';
    if (score >= 2) return '⭐ 较差 (D)';
    return '❌ 不合格 (F)';
}

// 运行
main().catch(console.error);
