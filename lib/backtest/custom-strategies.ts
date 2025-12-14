/**
 * 自定义策略示例
 * 
 * 这个文件展示了如何创建你自己的交易策略
 * 可以作为模板来创建新策略
 */

import {
    BaseStrategy,
    registerStrategy
} from './strategy';
import {
    MarketSnapshot,
    AccountState,
    StrategySignal,
    StrategyConfig
} from './types';

// ============================================
// 示例 1: 简单双均线策略
// ============================================

export class SimpleDoubleMAStrategy extends BaseStrategy {
    name = 'Simple Double MA';
    description = '简单双均线策略 - EMA20上穿EMA50做多，下穿平仓';
    version = '1.0.0';

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { ema20, ema50 } = indicators;

        // 检查指标是否可用
        if (!ema20 || !ema50) {
            return { symbol, action: 'hold', confidence: 0 };
        }

        const hasPosition = this.hasPosition(account, symbol);

        // 做多信号: EMA20 > EMA50 且无持仓
        if (ema20 > ema50 && !hasPosition) {
            return {
                symbol,
                action: 'buy',
                confidence: 70,
                leverage: this.config.maxLeverage,
                stopLoss: this.calculateStopLoss(price, 'long', 3),
                takeProfit: this.calculateTakeProfit(price, 'long', 6),
                reason: `EMA20 (${ema20.toFixed(2)}) > EMA50 (${ema50.toFixed(2)})`
            };
        }

        // 平仓信号: EMA20 < EMA50 且有持仓
        if (ema20 < ema50 && hasPosition) {
            return {
                symbol,
                action: 'close',
                confidence: 70,
                reason: `EMA20 (${ema20.toFixed(2)}) < EMA50 (${ema50.toFixed(2)})`
            };
        }

        return { symbol, action: 'hold', confidence: 0 };
    }
}

// ============================================
// 示例 2: RSI 动量策略 (带仓位管理)
// ============================================

export class RSIMomentumStrategy extends BaseStrategy {
    name = 'RSI Momentum';
    description = 'RSI动量策略 - 超卖反弹做多，根据RSI强度调整仓位';
    version = '1.0.0';

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { rsi14, ema20 } = indicators;

        if (!rsi14 || !ema20) {
            return { symbol, action: 'hold', confidence: 0 };
        }

        const hasPosition = this.hasPosition(account, symbol);

        // 超卖区域做多 (RSI < 30)
        if (rsi14 < 30 && !hasPosition && price > ema20 * 0.98) {
            // RSI越低，置信度越高
            const confidence = Math.min(90, 50 + (30 - rsi14) * 2);

            return {
                symbol,
                action: 'buy',
                confidence,
                leverage: this.config.maxLeverage,
                stopLoss: this.calculateStopLoss(price, 'long', 2.5),
                takeProfit: this.calculateTakeProfit(price, 'long', 5),
                reason: `RSI超卖: ${rsi14.toFixed(2)}, 价格在EMA20附近`
            };
        }

        // 超买区域平仓 (RSI > 70)
        if (rsi14 > 70 && hasPosition) {
            return {
                symbol,
                action: 'close',
                confidence: 75,
                reason: `RSI超买: ${rsi14.toFixed(2)}`
            };
        }

        return { symbol, action: 'hold', confidence: 0 };
    }
}

// ============================================
// 示例 3: 布林带均值回归策略
// ============================================

export class BollingerMeanReversionStrategy extends BaseStrategy {
    name = 'Bollinger Mean Reversion';
    description = '布林带均值回归 - 价格触及下轨做多，目标中轨';
    version = '1.0.0';

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { bbUpper, bbMiddle, bbLower, rsi14 } = indicators;

        if (!bbUpper || !bbMiddle || !bbLower) {
            return { symbol, action: 'hold', confidence: 0 };
        }

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        // 价格触及下轨 + RSI超卖 = 强烈做多信号
        const nearLower = price <= bbLower * 1.005;
        const isOversold = rsi14 !== undefined && rsi14 < 35;

        if (nearLower && !hasPosition) {
            const confidence = isOversold ? 80 : 60;

            return {
                symbol,
                action: 'buy',
                confidence,
                leverage: this.config.maxLeverage,
                stopLoss: bbLower * 0.97, // 下轨再下3%止损
                takeProfit: bbMiddle, // 目标中轨
                reason: `触及布林下轨${isOversold ? ' + RSI超卖' : ''}`
            };
        }

        // 价格达到中轨或上轨，平仓
        if (hasPosition && position?.side === 'long') {
            if (price >= bbMiddle) {
                return {
                    symbol,
                    action: 'close',
                    confidence: 70,
                    reason: `达到布林中轨目标: ${bbMiddle.toFixed(2)}`
                };
            }
        }

        return { symbol, action: 'hold', confidence: 0 };
    }
}

// ============================================
// 示例 4: 突破策略 (带ATR动态止损)
// ============================================

export class BreakoutStrategy extends BaseStrategy {
    name = 'ATR Breakout';
    description = 'ATR突破策略 - 价格突破布林上轨做多，ATR动态止损';
    version = '1.0.0';

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { bbUpper, bbMiddle, atr14, ema50 } = indicators;

        if (!bbUpper || !bbMiddle || !atr14 || !ema50) {
            return { symbol, action: 'hold', confidence: 0 };
        }

        const hasPosition = this.hasPosition(account, symbol);

        // 趋势确认: 价格在EMA50上方
        const uptrend = price > ema50;

        // 突破布林上轨，顺势追涨
        if (price > bbUpper && uptrend && !hasPosition) {
            // 使用 ATR 计算动态止损
            const stopLoss = price - atr14 * 2; // 2倍ATR止损
            const takeProfit = price + atr14 * 4; // 4倍ATR止盈

            return {
                symbol,
                action: 'buy',
                confidence: 65,
                leverage: Math.min(this.config.maxLeverage, 5), // 限制杠杆
                stopLoss,
                takeProfit,
                reason: `突破布林上轨 + 上升趋势 (ATR: ${atr14.toFixed(2)})`
            };
        }

        // 价格跌破中轨，平仓
        if (hasPosition && price < bbMiddle) {
            return {
                symbol,
                action: 'close',
                confidence: 60,
                reason: '价格跌破布林中轨'
            };
        }

        return { symbol, action: 'hold', confidence: 0 };
    }
}

// ============================================
// 注册所有自定义策略
// ============================================

// 取消注释以下行来注册策略
// registerStrategy('simple_double_ma', SimpleDoubleMAStrategy);
// registerStrategy('rsi_momentum', RSIMomentumStrategy);
// registerStrategy('bb_mean_reversion', BollingerMeanReversionStrategy);
// registerStrategy('atr_breakout', BreakoutStrategy);

/**
 * 使用方法:
 * 
 * 1. 取消上面的注册代码注释
 * 
 * 2. 在你的回测脚本中导入这个文件:
 *    import './lib/backtest/custom-strategies';
 * 
 * 3. 运行回测:
 *    npx tsx scripts/run-backtest.ts --strategy=simple_double_ma --symbol=BTC/USDT --days=30
 * 
 * 或者创建你自己的策略类，继承 BaseStrategy 并实现 onData 方法
 */
