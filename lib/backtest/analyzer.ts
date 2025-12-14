/**
 * 性能分析器
 * 计算夏普比率、最大回撤、胜率、盈亏比等核心指标
 */

import {
    EquitySnapshot,
    ClosedTrade,
    PerformanceMetrics,
    RiskMetrics,
    TradeStatistics,
    MonthlyReturn,
    YearlyReturn
} from './types';

/**
 * 性能分析器
 */
export class PerformanceAnalyzer {
    private equityCurve: EquitySnapshot[];
    private trades: ClosedTrade[];
    private initialCapital: number;
    private riskFreeRate: number;

    constructor(
        equityCurve: EquitySnapshot[],
        trades: ClosedTrade[],
        initialCapital: number,
        riskFreeRate: number = 0.02 // 默认2%年化无风险利率
    ) {
        this.equityCurve = equityCurve;
        this.trades = trades;
        this.initialCapital = initialCapital;
        this.riskFreeRate = riskFreeRate;
    }

    /**
     * 计算核心性能指标
     */
    calculatePerformance(): PerformanceMetrics {
        const finalEquity = this.equityCurve.length > 0
            ? this.equityCurve[this.equityCurve.length - 1].equity
            : this.initialCapital;

        const totalReturn = finalEquity - this.initialCapital;
        const totalReturnPercent = (totalReturn / this.initialCapital) * 100;

        // 计算时间跨度（年）
        const startTime = this.equityCurve.length > 0 ? this.equityCurve[0].timestamp : Date.now();
        const endTime = this.equityCurve.length > 0 ? this.equityCurve[this.equityCurve.length - 1].timestamp : Date.now();
        const yearsElapsed = (endTime - startTime) / (365.25 * 24 * 60 * 60 * 1000);

        // 年化收益率
        const annualizedReturn = yearsElapsed > 0
            ? (Math.pow(finalEquity / this.initialCapital, 1 / yearsElapsed) - 1) * 100
            : totalReturnPercent;

        // 最大回撤
        const drawdownAnalysis = this.analyzeDrawdown();

        // 日收益率序列
        const dailyReturns = this.calculateDailyReturns();

        // 夏普比率
        const sharpeRatio = this.calculateSharpeRatio(dailyReturns);

        // 索提诺比率
        const sortinoRatio = this.calculateSortinoRatio(dailyReturns);

        // 卡尔玛比率
        const calmarRatio = drawdownAnalysis.maxDrawdownPercent !== 0
            ? annualizedReturn / drawdownAnalysis.maxDrawdownPercent
            : 0;

        // 盈亏比
        const profitFactor = this.calculateProfitFactor();

        // 恢复因子
        const recoveryFactor = drawdownAnalysis.maxDrawdown !== 0
            ? totalReturn / drawdownAnalysis.maxDrawdown
            : 0;

        return {
            totalReturn,
            totalReturnPercent,
            annualizedReturn,
            sharpeRatio,
            sortinoRatio,
            calmarRatio,
            maxDrawdown: drawdownAnalysis.maxDrawdown,
            maxDrawdownPercent: drawdownAnalysis.maxDrawdownPercent,
            maxDrawdownDuration: drawdownAnalysis.maxDrawdownDuration,
            maxDrawdownStart: drawdownAnalysis.maxDrawdownStart,
            maxDrawdownEnd: drawdownAnalysis.maxDrawdownEnd,
            profitFactor,
            recoveryFactor
        };
    }

    /**
     * 计算风险指标
     */
    calculateRiskMetrics(): RiskMetrics {
        const dailyReturns = this.calculateDailyReturns();

        // 波动率
        const dailyVolatility = this.calculateStdDev(dailyReturns);
        const annualizedVolatility = dailyVolatility * Math.sqrt(252);

        // 下行波动率（只考虑负收益）
        const negativeReturns = dailyReturns.filter(r => r < 0);
        const downsideVolatility = this.calculateStdDev(negativeReturns) * Math.sqrt(252);

        // VaR 计算
        const sortedReturns = [...dailyReturns].sort((a, b) => a - b);
        const var95Index = Math.floor(dailyReturns.length * 0.05);
        const var99Index = Math.floor(dailyReturns.length * 0.01);

        const var95 = sortedReturns[var95Index] || 0;
        const var99 = sortedReturns[var99Index] || 0;

        // CVaR (Expected Shortfall)
        const cvar95 = var95Index > 0
            ? sortedReturns.slice(0, var95Index).reduce((a, b) => a + b, 0) / var95Index
            : var95;

        // 回撤分析
        const drawdowns = this.equityCurve.map(e => e.drawdown);
        const avgDrawdown = drawdowns.length > 0
            ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length
            : 0;
        const drawdownStdDev = this.calculateStdDev(drawdowns);

        // 计算显著回撤次数（超过5%的回撤）
        let drawdownCount = 0;
        let inDrawdown = false;
        for (const snapshot of this.equityCurve) {
            if (snapshot.drawdownPercent > 5 && !inDrawdown) {
                drawdownCount++;
                inDrawdown = true;
            } else if (snapshot.drawdownPercent < 1) {
                inDrawdown = false;
            }
        }

        // 杠杆和敞口
        const leverages = this.equityCurve.map(e => e.leverage);
        const avgLeverage = leverages.length > 0
            ? leverages.reduce((a, b) => a + b, 0) / leverages.length
            : 0;
        const maxLeverage = Math.max(...leverages, 0);

        return {
            dailyVolatility: dailyVolatility * 100,
            annualizedVolatility: annualizedVolatility * 100,
            downsideVolatility: downsideVolatility * 100,
            var95: var95 * 100,
            var99: var99 * 100,
            cvar95: cvar95 * 100,
            avgDrawdown,
            drawdownStdDev,
            drawdownCount,
            avgLeverage,
            maxLeverage,
            avgExposure: avgLeverage, // 简化：敞口 ≈ 杠杆
            maxExposure: maxLeverage
        };
    }

    /**
     * 计算交易统计
     */
    calculateTradeStatistics(): TradeStatistics {
        const totalTrades = this.trades.length;
        if (totalTrades === 0) {
            return this.emptyTradeStatistics();
        }

        const winningTrades = this.trades.filter(t => t.pnl > 0);
        const losingTrades = this.trades.filter(t => t.pnl < 0);

        const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

        // 平均盈亏
        const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

        // 百分比
        const avgWinPercent = winningTrades.length > 0
            ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
            : 0;
        const avgLossPercent = losingTrades.length > 0
            ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length)
            : 0;

        // 最大单笔
        const largestWin = winningTrades.length > 0
            ? Math.max(...winningTrades.map(t => t.pnl))
            : 0;
        const largestLoss = losingTrades.length > 0
            ? Math.abs(Math.min(...losingTrades.map(t => t.pnl)))
            : 0;

        // 连续统计
        const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateConsecutive();

        // 平均持仓时间
        const avgHoldingPeriod = this.trades.reduce((sum, t) => sum + t.holdingPeriod, 0)
            / totalTrades / (60 * 60 * 1000); // 转换为小时

        // 按方向统计
        const longTrades = this.trades.filter(t => t.side === 'long');
        const shortTrades = this.trades.filter(t => t.side === 'short');
        const longWins = longTrades.filter(t => t.pnl > 0).length;
        const shortWins = shortTrades.filter(t => t.pnl > 0).length;

        // 按天统计
        const dailyPnL = this.calculateDailyPnL();
        const profitableDays = Object.values(dailyPnL).filter(pnl => pnl > 0).length;
        const losingDays = Object.values(dailyPnL).filter(pnl => pnl < 0).length;
        const totalDays = Object.keys(dailyPnL).length;

        // 费用分析
        const totalFees = this.trades.reduce((sum, t) => sum + t.fees, 0);
        const totalSlippage = this.trades.reduce((sum, t) => sum + t.slippage, 0);
        const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
        const feeImpact = totalPnL !== 0 ? (totalFees / Math.abs(totalPnL)) * 100 : 0;

        return {
            totalTrades,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: (winningTrades.length / totalTrades) * 100,
            avgWin,
            avgLoss,
            avgWinPercent,
            avgLossPercent,
            largestWin,
            largestLoss,
            maxConsecutiveWins,
            maxConsecutiveLosses,
            avgHoldingPeriod,
            longTrades: longTrades.length,
            shortTrades: shortTrades.length,
            longWinRate: longTrades.length > 0 ? (longWins / longTrades.length) * 100 : 0,
            shortWinRate: shortTrades.length > 0 ? (shortWins / shortTrades.length) * 100 : 0,
            tradesPerDay: totalDays > 0 ? totalTrades / totalDays : 0,
            profitableDays,
            losingDays,
            dayWinRate: totalDays > 0 ? (profitableDays / totalDays) * 100 : 0,
            totalFees,
            totalSlippage,
            feeImpact
        };
    }

    /**
     * 计算月度收益
     */
    calculateMonthlyReturns(): MonthlyReturn[] {
        const monthlyData = new Map<string, { trades: ClosedTrade[]; equityStart: number; equityEnd: number }>();

        // 按月分组交易
        for (const trade of this.trades) {
            const date = new Date(trade.exitTime);
            const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!monthlyData.has(key)) {
                monthlyData.set(key, { trades: [], equityStart: 0, equityEnd: 0 });
            }
            monthlyData.get(key)!.trades.push(trade);
        }

        // 计算每月权益变化
        let lastMonthEquity = this.initialCapital;
        for (const snapshot of this.equityCurve) {
            const date = new Date(snapshot.timestamp);
            const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!monthlyData.has(key)) {
                monthlyData.set(key, { trades: [], equityStart: lastMonthEquity, equityEnd: snapshot.equity });
            }

            const data = monthlyData.get(key)!;
            if (data.equityStart === 0) {
                data.equityStart = lastMonthEquity;
            }
            data.equityEnd = snapshot.equity;
            lastMonthEquity = snapshot.equity;
        }

        // 生成月度报告
        const result: MonthlyReturn[] = [];
        const sortedKeys = Array.from(monthlyData.keys()).sort();

        for (const key of sortedKeys) {
            const [year, month] = key.split('-').map(Number);
            const data = monthlyData.get(key)!;

            const returnAmount = data.equityEnd - data.equityStart;
            const returnPercent = data.equityStart > 0
                ? (returnAmount / data.equityStart) * 100
                : 0;

            // 计算当月最大回撤
            const monthSnapshots = this.equityCurve.filter(s => {
                const d = new Date(s.timestamp);
                return d.getFullYear() === year && d.getMonth() + 1 === month;
            });
            const maxDrawdown = monthSnapshots.length > 0
                ? Math.max(...monthSnapshots.map(s => s.drawdownPercent))
                : 0;

            result.push({
                year,
                month,
                return: returnAmount,
                returnPercent,
                trades: data.trades.length,
                maxDrawdown
            });
        }

        return result;
    }

    /**
     * 计算年度收益
     */
    calculateYearlyReturns(): YearlyReturn[] {
        const yearlyData = new Map<number, { trades: ClosedTrade[]; dailyReturns: number[]; equityStart: number; equityEnd: number }>();

        // 初始化年度数据
        for (const trade of this.trades) {
            const year = new Date(trade.exitTime).getFullYear();
            if (!yearlyData.has(year)) {
                yearlyData.set(year, { trades: [], dailyReturns: [], equityStart: 0, equityEnd: 0 });
            }
            yearlyData.get(year)!.trades.push(trade);
        }

        // 计算每年的日收益率和权益
        let lastEquity = this.initialCapital;
        let lastYear = -1;

        for (const snapshot of this.equityCurve) {
            const year = new Date(snapshot.timestamp).getFullYear();

            if (!yearlyData.has(year)) {
                yearlyData.set(year, { trades: [], dailyReturns: [], equityStart: lastEquity, equityEnd: snapshot.equity });
            }

            const data = yearlyData.get(year)!;

            if (lastYear !== year) {
                data.equityStart = lastEquity;
            }

            if (lastEquity > 0) {
                const dailyReturn = (snapshot.equity - lastEquity) / lastEquity;
                data.dailyReturns.push(dailyReturn);
            }

            data.equityEnd = snapshot.equity;
            lastEquity = snapshot.equity;
            lastYear = year;
        }

        // 生成年度报告
        const result: YearlyReturn[] = [];
        const sortedYears = Array.from(yearlyData.keys()).sort();

        for (const year of sortedYears) {
            const data = yearlyData.get(year)!;

            const returnAmount = data.equityEnd - data.equityStart;
            const returnPercent = data.equityStart > 0
                ? (returnAmount / data.equityStart) * 100
                : 0;

            // 计算年度夏普比率
            const sharpeRatio = this.calculateSharpeRatio(data.dailyReturns);

            // 计算年度最大回撤
            const yearSnapshots = this.equityCurve.filter(s =>
                new Date(s.timestamp).getFullYear() === year
            );
            const maxDrawdown = yearSnapshots.length > 0
                ? Math.max(...yearSnapshots.map(s => s.drawdownPercent))
                : 0;

            result.push({
                year,
                return: returnAmount,
                returnPercent,
                trades: data.trades.length,
                maxDrawdown,
                sharpeRatio
            });
        }

        return result;
    }

    // ============================================
    // 辅助方法
    // ============================================

    private calculateDailyReturns(): number[] {
        const dailyReturns: number[] = [];
        const dailyEquity = new Map<string, number>();

        // 按天取最后一个权益值
        for (const snapshot of this.equityCurve) {
            const date = new Date(snapshot.timestamp).toISOString().split('T')[0];
            dailyEquity.set(date, snapshot.equity);
        }

        // 计算日收益率
        const dates = Array.from(dailyEquity.keys()).sort();
        for (let i = 1; i < dates.length; i++) {
            const prevEquity = dailyEquity.get(dates[i - 1])!;
            const currEquity = dailyEquity.get(dates[i])!;
            if (prevEquity > 0) {
                dailyReturns.push((currEquity - prevEquity) / prevEquity);
            }
        }

        return dailyReturns;
    }

    private calculateSharpeRatio(returns: number[]): number {
        if (returns.length < 2) return 0;

        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = this.calculateStdDev(returns);

        if (stdDev === 0) return 0;

        // 年化
        const annualizedReturn = avgReturn * 252;
        const annualizedStdDev = stdDev * Math.sqrt(252);

        return (annualizedReturn - this.riskFreeRate) / annualizedStdDev;
    }

    private calculateSortinoRatio(returns: number[]): number {
        if (returns.length < 2) return 0;

        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const negativeReturns = returns.filter(r => r < 0);

        if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;

        const downsideDeviation = this.calculateStdDev(negativeReturns);
        if (downsideDeviation === 0) return 0;

        // 年化
        const annualizedReturn = avgReturn * 252;
        const annualizedDownside = downsideDeviation * Math.sqrt(252);

        return (annualizedReturn - this.riskFreeRate) / annualizedDownside;
    }

    private calculateStdDev(values: number[]): number {
        if (values.length < 2) return 0;

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);

        return Math.sqrt(variance);
    }

    private analyzeDrawdown(): {
        maxDrawdown: number;
        maxDrawdownPercent: number;
        maxDrawdownDuration: number;
        maxDrawdownStart: Date;
        maxDrawdownEnd: Date;
    } {
        let maxDrawdown = 0;
        let maxDrawdownPercent = 0;
        let maxDrawdownDuration = 0;
        let maxDrawdownStart = new Date();
        let maxDrawdownEnd = new Date();

        let peak = this.initialCapital;
        let peakTime = this.equityCurve.length > 0 ? this.equityCurve[0].timestamp : Date.now();
        let currentDrawdownStart = peakTime;

        for (const snapshot of this.equityCurve) {
            if (snapshot.equity > peak) {
                peak = snapshot.equity;
                peakTime = snapshot.timestamp;
                currentDrawdownStart = snapshot.timestamp;
            }

            const drawdown = peak - snapshot.equity;
            const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownPercent = drawdownPercent;
                maxDrawdownStart = new Date(currentDrawdownStart);
                maxDrawdownEnd = new Date(snapshot.timestamp);
                maxDrawdownDuration = (snapshot.timestamp - currentDrawdownStart) / (24 * 60 * 60 * 1000);
            }
        }

        return {
            maxDrawdown,
            maxDrawdownPercent,
            maxDrawdownDuration,
            maxDrawdownStart,
            maxDrawdownEnd
        };
    }

    private calculateProfitFactor(): number {
        const totalWins = this.trades
            .filter(t => t.pnl > 0)
            .reduce((sum, t) => sum + t.pnl, 0);

        const totalLosses = Math.abs(
            this.trades
                .filter(t => t.pnl < 0)
                .reduce((sum, t) => sum + t.pnl, 0)
        );

        return totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    }

    private calculateConsecutive(): { maxConsecutiveWins: number; maxConsecutiveLosses: number } {
        let maxWins = 0;
        let maxLosses = 0;
        let currentWins = 0;
        let currentLosses = 0;

        for (const trade of this.trades) {
            if (trade.pnl > 0) {
                currentWins++;
                currentLosses = 0;
                maxWins = Math.max(maxWins, currentWins);
            } else if (trade.pnl < 0) {
                currentLosses++;
                currentWins = 0;
                maxLosses = Math.max(maxLosses, currentLosses);
            }
        }

        return { maxConsecutiveWins: maxWins, maxConsecutiveLosses: maxLosses };
    }

    private calculateDailyPnL(): Record<string, number> {
        const dailyPnL: Record<string, number> = {};

        for (const trade of this.trades) {
            const date = new Date(trade.exitTime).toISOString().split('T')[0];
            dailyPnL[date] = (dailyPnL[date] || 0) + trade.pnl;
        }

        return dailyPnL;
    }

    private emptyTradeStatistics(): TradeStatistics {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            winRate: 0,
            avgWin: 0,
            avgLoss: 0,
            avgWinPercent: 0,
            avgLossPercent: 0,
            largestWin: 0,
            largestLoss: 0,
            maxConsecutiveWins: 0,
            maxConsecutiveLosses: 0,
            avgHoldingPeriod: 0,
            longTrades: 0,
            shortTrades: 0,
            longWinRate: 0,
            shortWinRate: 0,
            tradesPerDay: 0,
            profitableDays: 0,
            losingDays: 0,
            dayWinRate: 0,
            totalFees: 0,
            totalSlippage: 0,
            feeImpact: 0
        };
    }
}
