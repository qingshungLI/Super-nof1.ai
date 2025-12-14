/**
 * 回测报告生成器
 * 生成 JSON 和 HTML 格式的详细报告
 */

import { BacktestResult } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 报告生成器
 */
export class BacktestReporter {
    private result: BacktestResult;
    private outputDir: string;

    constructor(result: BacktestResult, outputDir: string = './backtest-reports') {
        this.result = result;
        this.outputDir = outputDir;
    }

    /**
     * 生成所有格式的报告
     */
    async generateAll(): Promise<{ json: string; html: string; console: string }> {
        // 确保输出目录存在
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const baseFileName = `backtest_${this.result.strategyName.replace(/\s+/g, '_')}_${timestamp}`;

        // 生成 JSON 报告
        const jsonPath = path.join(this.outputDir, `${baseFileName}.json`);
        const jsonReport = this.generateJSON();
        fs.writeFileSync(jsonPath, jsonReport);

        // 生成 HTML 报告
        const htmlPath = path.join(this.outputDir, `${baseFileName}.html`);
        const htmlReport = this.generateHTML();
        fs.writeFileSync(htmlPath, htmlReport);

        // 生成控制台报告
        const consoleReport = this.generateConsole();

        console.log(`\n📁 报告已生成:`);
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   HTML: ${htmlPath}`);

        return {
            json: jsonPath,
            html: htmlPath,
            console: consoleReport
        };
    }

    /**
     * 生成 JSON 报告
     */
    generateJSON(): string {
        return JSON.stringify(this.result, null, 2);
    }

    /**
     * 生成控制台报告
     */
    generateConsole(): string {
        const { performance: perf, tradeStatistics: stats, riskMetrics: risk } = this.result;

        const lines = [
            '',
            '╔══════════════════════════════════════════════════════════════════╗',
            '║                       📊 回测报告摘要                            ║',
            '╠══════════════════════════════════════════════════════════════════╣',
            '',
            `  策略名称: ${this.result.strategyName}`,
            `  回测周期: ${this.result.startDate.toLocaleDateString()} - ${this.result.endDate.toLocaleDateString()}`,
            `  初始资金: $${this.result.config.initialCapital.toLocaleString()}`,
            '',
            '┌──────────────────────────────────────────────────────────────────┐',
            '│                         💰 收益指标                              │',
            '├──────────────────────────────────────────────────────────────────┤',
            `│  总收益:        ${this.formatValue(perf.totalReturn, '$')}  (${this.formatPercent(perf.totalReturnPercent)})`,
            `│  年化收益:      ${this.formatPercent(perf.annualizedReturn)}`,
            `│  夏普比率:      ${perf.sharpeRatio.toFixed(2)}`,
            `│  索提诺比率:    ${perf.sortinoRatio.toFixed(2)}`,
            `│  卡尔玛比率:    ${perf.calmarRatio.toFixed(2)}`,
            `│  盈亏比:        ${perf.profitFactor.toFixed(2)}`,
            '└──────────────────────────────────────────────────────────────────┘',
            '',
            '┌──────────────────────────────────────────────────────────────────┐',
            '│                         ⚠️ 风险指标                              │',
            '├──────────────────────────────────────────────────────────────────┤',
            `│  最大回撤:      ${this.formatValue(perf.maxDrawdown, '$')}  (${this.formatPercent(perf.maxDrawdownPercent)})`,
            `│  回撤持续:      ${perf.maxDrawdownDuration.toFixed(1)} 天`,
            `│  年化波动率:    ${this.formatPercent(risk.annualizedVolatility)}`,
            `│  VaR (95%):     ${this.formatPercent(Math.abs(risk.var95))}`,
            `│  CVaR (95%):    ${this.formatPercent(Math.abs(risk.cvar95))}`,
            `│  平均杠杆:      ${risk.avgLeverage.toFixed(2)}x`,
            '└──────────────────────────────────────────────────────────────────┘',
            '',
            '┌──────────────────────────────────────────────────────────────────┐',
            '│                         📈 交易统计                              │',
            '├──────────────────────────────────────────────────────────────────┤',
            `│  总交易次数:    ${stats.totalTrades}`,
            `│  胜率:          ${this.formatPercent(stats.winRate)}`,
            `│  平均盈利:      ${this.formatValue(stats.avgWin, '$')}  (${this.formatPercent(stats.avgWinPercent)})`,
            `│  平均亏损:      ${this.formatValue(stats.avgLoss, '$')}  (${this.formatPercent(stats.avgLossPercent)})`,
            `│  最大单笔盈利:  ${this.formatValue(stats.largestWin, '$')}`,
            `│  最大单笔亏损:  ${this.formatValue(stats.largestLoss, '$')}`,
            `│  最大连胜:      ${stats.maxConsecutiveWins}`,
            `│  最大连败:      ${stats.maxConsecutiveLosses}`,
            `│  平均持仓时间:  ${stats.avgHoldingPeriod.toFixed(1)} 小时`,
            `│  总手续费:      ${this.formatValue(stats.totalFees, '$')}`,
            '└──────────────────────────────────────────────────────────────────┘',
            '',
            '╚══════════════════════════════════════════════════════════════════╝',
            ''
        ];

        const report = lines.join('\n');
        console.log(report);
        return report;
    }

    /**
     * 生成 HTML 报告
     */
    generateHTML(): string {
        const { performance: perf, tradeStatistics: stats, riskMetrics: risk, monthlyReturns, equityCurve, trades } = this.result;

        // 准备图表数据
        const equityData = equityCurve.map(e => ({
            time: new Date(e.timestamp).toLocaleDateString(),
            equity: e.equity,
            drawdown: -e.drawdownPercent
        }));

        // 月度热力图数据
        const monthlyHeatmap = this.prepareMonthlyHeatmap();

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>回测报告 - ${this.result.strategyName}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            padding: 30px;
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5rem;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        .header .subtitle {
            color: #888;
            font-size: 1.1rem;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .metric-card h3 {
            font-size: 0.9rem;
            color: #888;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .metric-card .value {
            font-size: 2rem;
            font-weight: bold;
        }
        .metric-card .value.positive { color: #00d395; }
        .metric-card .value.negative { color: #ff6b6b; }
        .metric-card .value.neutral { color: #667eea; }
        .metric-card .subvalue {
            font-size: 0.9rem;
            color: #888;
            margin-top: 5px;
        }
        .chart-container {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .chart-container h2 {
            margin-bottom: 20px;
            color: #fff;
        }
        .chart-wrapper {
            height: 400px;
        }
        .stats-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stats-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .stats-card h3 {
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .stats-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .stats-row:last-child {
            border-bottom: none;
        }
        .stats-label {
            color: #888;
        }
        .stats-value {
            font-weight: 600;
        }
        .trades-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        .trades-table th,
        .trades-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .trades-table th {
            background: rgba(255,255,255,0.05);
            font-weight: 600;
            color: #888;
            text-transform: uppercase;
            font-size: 0.8rem;
            letter-spacing: 1px;
        }
        .trades-table tr:hover {
            background: rgba(255,255,255,0.03);
        }
        .pnl-positive { color: #00d395; }
        .pnl-negative { color: #ff6b6b; }
        .monthly-grid {
            display: grid;
            grid-template-columns: repeat(13, 1fr);
            gap: 2px;
            margin-top: 15px;
        }
        .monthly-cell {
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .monthly-header {
            background: transparent;
            color: #888;
        }
        @media (max-width: 768px) {
            .header h1 { font-size: 1.8rem; }
            .metric-card .value { font-size: 1.5rem; }
            .stats-section { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 ${this.result.strategyName}</h1>
            <div class="subtitle">
                ${this.result.startDate.toLocaleDateString()} - ${this.result.endDate.toLocaleDateString()} | 
                初始资金: $${this.result.config.initialCapital.toLocaleString()}
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <h3>总收益</h3>
                <div class="value ${perf.totalReturn >= 0 ? 'positive' : 'negative'}">
                    ${this.formatValue(perf.totalReturn, '$')}
                </div>
                <div class="subvalue">${this.formatPercent(perf.totalReturnPercent)}</div>
            </div>
            <div class="metric-card">
                <h3>年化收益</h3>
                <div class="value ${perf.annualizedReturn >= 0 ? 'positive' : 'negative'}">
                    ${this.formatPercent(perf.annualizedReturn)}
                </div>
            </div>
            <div class="metric-card">
                <h3>夏普比率</h3>
                <div class="value neutral">${perf.sharpeRatio.toFixed(2)}</div>
                <div class="subvalue">索提诺: ${perf.sortinoRatio.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <h3>最大回撤</h3>
                <div class="value negative">${this.formatPercent(perf.maxDrawdownPercent)}</div>
                <div class="subvalue">${this.formatValue(perf.maxDrawdown, '$')}</div>
            </div>
            <div class="metric-card">
                <h3>胜率</h3>
                <div class="value neutral">${this.formatPercent(stats.winRate)}</div>
                <div class="subvalue">${stats.winningTrades}/${stats.totalTrades} 笔盈利</div>
            </div>
            <div class="metric-card">
                <h3>盈亏比</h3>
                <div class="value neutral">${perf.profitFactor.toFixed(2)}</div>
                <div class="subvalue">平均盈利/平均亏损</div>
            </div>
        </div>

        <div class="chart-container">
            <h2>📈 权益曲线</h2>
            <div class="chart-wrapper">
                <canvas id="equityChart"></canvas>
            </div>
        </div>

        <div class="chart-container">
            <h2>📉 回撤曲线</h2>
            <div class="chart-wrapper">
                <canvas id="drawdownChart"></canvas>
            </div>
        </div>

        <div class="stats-section">
            <div class="stats-card">
                <h3>💰 收益指标</h3>
                <div class="stats-row">
                    <span class="stats-label">总收益</span>
                    <span class="stats-value">${this.formatValue(perf.totalReturn, '$')} (${this.formatPercent(perf.totalReturnPercent)})</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">年化收益</span>
                    <span class="stats-value">${this.formatPercent(perf.annualizedReturn)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">夏普比率</span>
                    <span class="stats-value">${perf.sharpeRatio.toFixed(3)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">索提诺比率</span>
                    <span class="stats-value">${perf.sortinoRatio.toFixed(3)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">卡尔玛比率</span>
                    <span class="stats-value">${perf.calmarRatio.toFixed(3)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">盈亏比</span>
                    <span class="stats-value">${perf.profitFactor.toFixed(3)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">恢复因子</span>
                    <span class="stats-value">${perf.recoveryFactor.toFixed(3)}</span>
                </div>
            </div>

            <div class="stats-card">
                <h3>⚠️ 风险指标</h3>
                <div class="stats-row">
                    <span class="stats-label">最大回撤</span>
                    <span class="stats-value">${this.formatPercent(perf.maxDrawdownPercent)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">回撤持续时间</span>
                    <span class="stats-value">${perf.maxDrawdownDuration.toFixed(1)} 天</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">年化波动率</span>
                    <span class="stats-value">${this.formatPercent(risk.annualizedVolatility)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">下行波动率</span>
                    <span class="stats-value">${this.formatPercent(risk.downsideVolatility)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">VaR (95%)</span>
                    <span class="stats-value">${this.formatPercent(Math.abs(risk.var95))}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">CVaR (95%)</span>
                    <span class="stats-value">${this.formatPercent(Math.abs(risk.cvar95))}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">平均杠杆</span>
                    <span class="stats-value">${risk.avgLeverage.toFixed(2)}x</span>
                </div>
            </div>

            <div class="stats-card">
                <h3>📈 交易统计</h3>
                <div class="stats-row">
                    <span class="stats-label">总交易次数</span>
                    <span class="stats-value">${stats.totalTrades}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">胜率</span>
                    <span class="stats-value">${this.formatPercent(stats.winRate)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">平均盈利</span>
                    <span class="stats-value">${this.formatValue(stats.avgWin, '$')}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">平均亏损</span>
                    <span class="stats-value">${this.formatValue(stats.avgLoss, '$')}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">最大单笔盈利</span>
                    <span class="stats-value">${this.formatValue(stats.largestWin, '$')}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">最大单笔亏损</span>
                    <span class="stats-value">${this.formatValue(stats.largestLoss, '$')}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">最大连胜</span>
                    <span class="stats-value">${stats.maxConsecutiveWins}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">最大连败</span>
                    <span class="stats-value">${stats.maxConsecutiveLosses}</span>
                </div>
            </div>

            <div class="stats-card">
                <h3>⏱️ 时间与费用</h3>
                <div class="stats-row">
                    <span class="stats-label">平均持仓时间</span>
                    <span class="stats-value">${stats.avgHoldingPeriod.toFixed(1)} 小时</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">日均交易次数</span>
                    <span class="stats-value">${stats.tradesPerDay.toFixed(2)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">盈利天数</span>
                    <span class="stats-value">${stats.profitableDays} 天 (${this.formatPercent(stats.dayWinRate)})</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">总手续费</span>
                    <span class="stats-value">${this.formatValue(stats.totalFees, '$')}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">费用占比</span>
                    <span class="stats-value">${this.formatPercent(stats.feeImpact)}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">多头交易</span>
                    <span class="stats-value">${stats.longTrades} (胜率 ${this.formatPercent(stats.longWinRate)})</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">空头交易</span>
                    <span class="stats-value">${stats.shortTrades} (胜率 ${this.formatPercent(stats.shortWinRate)})</span>
                </div>
            </div>
        </div>

        <div class="chart-container">
            <h2>📅 月度收益热力图</h2>
            <div class="monthly-grid">
                <div class="monthly-cell monthly-header">年份</div>
                ${['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'].map(m =>
            `<div class="monthly-cell monthly-header">${m}</div>`
        ).join('')}
                ${monthlyHeatmap}
            </div>
        </div>

        <div class="chart-container">
            <h2>📋 交易明细 (最近20笔)</h2>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>方向</th>
                        <th>入场价</th>
                        <th>出场价</th>
                        <th>持仓时间</th>
                        <th>盈亏</th>
                        <th>退出原因</th>
                    </tr>
                </thead>
                <tbody>
                    ${trades.slice(-20).reverse().map(t => `
                        <tr>
                            <td>${new Date(t.exitTime).toLocaleString()}</td>
                            <td>${t.side === 'long' ? '🟢 做多' : '🔴 做空'}</td>
                            <td>$${t.entryPrice.toFixed(2)}</td>
                            <td>$${t.exitPrice.toFixed(2)}</td>
                            <td>${(t.holdingPeriod / 3600000).toFixed(1)}h</td>
                            <td class="${t.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                                ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)} (${t.pnlPercent.toFixed(2)}%)
                            </td>
                            <td>${this.translateExitReason(t.exitReason)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // 权益曲线图表
        const equityCtx = document.getElementById('equityChart').getContext('2d');
        new Chart(equityCtx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(equityData.filter((_, i) => i % Math.max(1, Math.floor(equityData.length / 100)) === 0).map(e => e.time))},
                datasets: [{
                    label: '权益',
                    data: ${JSON.stringify(equityData.filter((_, i) => i % Math.max(1, Math.floor(equityData.length / 100)) === 0).map(e => e.equity))},
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        display: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#888', maxTicksLimit: 10 }
                    },
                    y: {
                        display: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#888' }
                    }
                }
            }
        });

        // 回撤曲线图表
        const drawdownCtx = document.getElementById('drawdownChart').getContext('2d');
        new Chart(drawdownCtx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(equityData.filter((_, i) => i % Math.max(1, Math.floor(equityData.length / 100)) === 0).map(e => e.time))},
                datasets: [{
                    label: '回撤 %',
                    data: ${JSON.stringify(equityData.filter((_, i) => i % Math.max(1, Math.floor(equityData.length / 100)) === 0).map(e => e.drawdown))},
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        display: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#888', maxTicksLimit: 10 }
                    },
                    y: {
                        display: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#888' },
                        max: 0
                    }
                }
            }
        });
    </script>
</body>
</html>
        `;
    }

    // ============================================
    // 辅助方法
    // ============================================

    private formatValue(value: number, prefix: string = ''): string {
        const sign = value >= 0 ? '+' : '';
        return `${sign}${prefix}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }

    private formatPercent(value: number): string {
        const sign = value >= 0 ? '+' : '';
        return `${sign}${value.toFixed(2)}%`;
    }

    private translateExitReason(reason: string): string {
        const map: Record<string, string> = {
            'take_profit': '✅ 止盈',
            'stop_loss': '❌ 止损',
            'signal': '📊 信号',
            'liquidation': '⚠️ 强平',
            'manual': '🖐️ 手动'
        };
        return map[reason] || reason;
    }

    private prepareMonthlyHeatmap(): string {
        const { monthlyReturns } = this.result;
        const years = [...new Set(monthlyReturns.map(m => m.year))].sort();

        let html = '';

        for (const year of years) {
            html += `<div class="monthly-cell monthly-header">${year}</div>`;

            for (let month = 1; month <= 12; month++) {
                const data = monthlyReturns.find(m => m.year === year && m.month === month);

                if (data) {
                    const color = this.getHeatmapColor(data.returnPercent);
                    html += `<div class="monthly-cell" style="background:${color}" title="${data.returnPercent.toFixed(2)}%">${data.returnPercent.toFixed(1)}%</div>`;
                } else {
                    html += `<div class="monthly-cell" style="background:rgba(255,255,255,0.05)">-</div>`;
                }
            }
        }

        return html;
    }

    private getHeatmapColor(percent: number): string {
        if (percent >= 10) return 'rgba(0, 211, 149, 0.8)';
        if (percent >= 5) return 'rgba(0, 211, 149, 0.6)';
        if (percent >= 2) return 'rgba(0, 211, 149, 0.4)';
        if (percent >= 0) return 'rgba(0, 211, 149, 0.2)';
        if (percent >= -2) return 'rgba(255, 107, 107, 0.2)';
        if (percent >= -5) return 'rgba(255, 107, 107, 0.4)';
        if (percent >= -10) return 'rgba(255, 107, 107, 0.6)';
        return 'rgba(255, 107, 107, 0.8)';
    }
}
