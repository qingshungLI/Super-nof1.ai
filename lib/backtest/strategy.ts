/**
 * 策略接口和内置策略
 * 支持自定义策略和多Agent系统适配
 */

import {
    IStrategy,
    StrategyConfig,
    StrategySignal,
    MarketSnapshot,
    AccountState,
    Order,
    Position
} from './types';

/**
 * 基础策略抽象类
 */
export abstract class BaseStrategy implements IStrategy {
    abstract name: string;
    abstract description: string;
    abstract version: string;

    protected config!: StrategyConfig;
    protected tradeCount: number = 0;

    async initialize(config: StrategyConfig): Promise<void> {
        this.config = config;
        this.tradeCount = 0;
    }

    abstract onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal>;

    onOrderFilled?(order: Order): void;
    onPositionUpdate?(position: Position): void;

    reset(): void {
        this.tradeCount = 0;
    }

    /**
     * 默认持仓检查
     */
    protected hasPosition(account: AccountState, symbol: string): boolean {
        return account.positions.some(p => p.symbol === symbol);
    }

    /**
     * 计算止损价格
     */
    protected calculateStopLoss(price: number, side: 'long' | 'short', percent: number): number {
        return side === 'long'
            ? price * (1 - percent / 100)
            : price * (1 + percent / 100);
    }

    /**
     * 计算止盈价格
     */
    protected calculateTakeProfit(price: number, side: 'long' | 'short', percent: number): number {
        return side === 'long'
            ? price * (1 + percent / 100)
            : price * (1 - percent / 100);
    }

    /**
     * 创建持仓信号
     */
    protected createHoldSignal(symbol: string): StrategySignal {
        return {
            symbol,
            action: 'hold',
            confidence: 0,
            reason: '无交易信号'
        };
    }
}

// ============================================
// 内置策略：EMA 交叉策略
// ============================================

export class EMACrossStrategy extends BaseStrategy {
    name = 'EMA Cross Strategy';
    description = 'EMA20/50 金叉死叉策略';
    version = '1.0.0';

    private lastEma20: number = 0;
    private lastEma50: number = 0;

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { ema20, ema50 } = indicators;

        // 检查指标是否有效
        if (!ema20 || !ema50 || ema20 === 0 || ema50 === 0) {
            return this.createHoldSignal(symbol);
        }

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        // 检测交叉
        const currentCross = ema20 > ema50;
        const lastCross = this.lastEma20 > this.lastEma50;
        const goldenCross = currentCross && !lastCross && this.lastEma20 !== 0;
        const deathCross = !currentCross && lastCross && this.lastEma20 !== 0;

        // 更新历史值
        this.lastEma20 = ema20;
        this.lastEma50 = ema50;

        // 金叉做多
        if (goldenCross && !hasPosition) {
            const stopLoss = this.calculateStopLoss(price, 'long', this.config.stopLossPercent || 3);
            const takeProfit = this.calculateTakeProfit(price, 'long', this.config.takeProfitPercent || 6);

            return {
                symbol,
                action: 'buy',
                confidence: 70,
                leverage: this.config.maxLeverage,
                stopLoss,
                takeProfit,
                reason: `EMA金叉: EMA20(${ema20.toFixed(2)}) 上穿 EMA50(${ema50.toFixed(2)})`
            };
        }

        // 死叉平多
        if (deathCross && hasPosition && position?.side === 'long') {
            return {
                symbol,
                action: 'close',
                confidence: 70,
                reason: `EMA死叉: EMA20(${ema20.toFixed(2)}) 下穿 EMA50(${ema50.toFixed(2)})`
            };
        }

        return this.createHoldSignal(symbol);
    }

    reset(): void {
        super.reset();
        this.lastEma20 = 0;
        this.lastEma50 = 0;
    }
}

// ============================================
// 内置策略：RSI 超买超卖策略
// ============================================

export class RSIStrategy extends BaseStrategy {
    name = 'RSI Strategy';
    description = 'RSI 超买超卖策略';
    version = '1.0.0';

    private oversoldLevel = 30;
    private overboughtLevel = 70;

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { rsi14 } = indicators;

        if (!rsi14) {
            return this.createHoldSignal(symbol);
        }

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        // RSI 超卖，做多
        if (rsi14 < this.oversoldLevel && !hasPosition) {
            const stopLoss = this.calculateStopLoss(price, 'long', this.config.stopLossPercent || 3);
            const takeProfit = this.calculateTakeProfit(price, 'long', this.config.takeProfitPercent || 6);

            return {
                symbol,
                action: 'buy',
                confidence: Math.min(90, (this.oversoldLevel - rsi14) * 3),
                leverage: this.config.maxLeverage,
                stopLoss,
                takeProfit,
                reason: `RSI超卖: ${rsi14.toFixed(2)} < ${this.oversoldLevel}`
            };
        }

        // RSI 超买，平多
        if (rsi14 > this.overboughtLevel && hasPosition && position?.side === 'long') {
            return {
                symbol,
                action: 'close',
                confidence: Math.min(90, (rsi14 - this.overboughtLevel) * 3),
                reason: `RSI超买: ${rsi14.toFixed(2)} > ${this.overboughtLevel}`
            };
        }

        return this.createHoldSignal(symbol);
    }
}

// ============================================
// 内置策略：MACD 策略
// ============================================

export class MACDStrategy extends BaseStrategy {
    name = 'MACD Strategy';
    description = 'MACD 金叉死叉策略';
    version = '1.0.0';

    private lastMACD: number = 0;
    private lastSignal: number = 0;

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const macd = indicators.macd;

        // 简化：只用MACD柱状图
        if (macd === undefined) {
            return this.createHoldSignal(symbol);
        }

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        // MACD 从负转正，做多
        if (macd > 0 && this.lastMACD <= 0 && this.lastMACD !== 0 && !hasPosition) {
            const stopLoss = this.calculateStopLoss(price, 'long', this.config.stopLossPercent || 3);
            const takeProfit = this.calculateTakeProfit(price, 'long', this.config.takeProfitPercent || 6);

            this.lastMACD = macd;
            return {
                symbol,
                action: 'buy',
                confidence: 65,
                leverage: this.config.maxLeverage,
                stopLoss,
                takeProfit,
                reason: `MACD转正: ${macd.toFixed(4)}`
            };
        }

        // MACD 从正转负，平多
        if (macd < 0 && this.lastMACD >= 0 && hasPosition && position?.side === 'long') {
            this.lastMACD = macd;
            return {
                symbol,
                action: 'close',
                confidence: 65,
                reason: `MACD转负: ${macd.toFixed(4)}`
            };
        }

        this.lastMACD = macd;
        return this.createHoldSignal(symbol);
    }

    reset(): void {
        super.reset();
        this.lastMACD = 0;
        this.lastSignal = 0;
    }
}

// ============================================
// 内置策略：布林带策略
// ============================================

export class BollingerBandsStrategy extends BaseStrategy {
    name = 'Bollinger Bands Strategy';
    description = '布林带突破回归策略';
    version = '1.0.0';

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price } = snapshot;

        // 从 K 线数据获取布林带（需要在 data-loader 中计算）
        const latestKline = snapshot.klines.m15[snapshot.klines.m15.length - 1] as any;
        const bbUpper = latestKline?.bbUpper;
        const bbLower = latestKline?.bbLower;
        const bbMiddle = latestKline?.bbMiddle;

        if (!bbUpper || !bbLower || !bbMiddle) {
            return this.createHoldSignal(symbol);
        }

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        // 价格触及下轨，做多
        if (price <= bbLower && !hasPosition) {
            const stopLoss = bbLower * 0.98; // 下轨再下2%
            const takeProfit = bbMiddle; // 目标中轨

            return {
                symbol,
                action: 'buy',
                confidence: 60,
                leverage: this.config.maxLeverage,
                stopLoss,
                takeProfit,
                reason: `触及布林下轨: ${price.toFixed(2)} <= ${bbLower.toFixed(2)}`
            };
        }

        // 价格触及上轨，平多
        if (price >= bbUpper && hasPosition && position?.side === 'long') {
            return {
                symbol,
                action: 'close',
                confidence: 60,
                reason: `触及布林上轨: ${price.toFixed(2)} >= ${bbUpper.toFixed(2)}`
            };
        }

        return this.createHoldSignal(symbol);
    }
}

// ============================================
// 内置策略：多指标组合策略
// ============================================

export class MultiIndicatorStrategy extends BaseStrategy {
    name = 'Multi-Indicator Strategy';
    description = '多指标组合策略 (EMA + RSI + MACD)';
    version = '1.0.0';

    private lastMACD: number = 0;

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators } = snapshot;
        const { ema20, ema50, rsi14, macd } = indicators;

        if (!ema20 || !ema50 || !rsi14 || macd === undefined) {
            return this.createHoldSignal(symbol);
        }

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        // 计算各指标信号分数
        let bullishScore = 0;
        let bearishScore = 0;

        // EMA 趋势
        if (ema20 > ema50) bullishScore += 30;
        else bearishScore += 30;

        // RSI
        if (rsi14 < 40) bullishScore += 25;
        else if (rsi14 > 60) bearishScore += 25;

        // MACD
        if (macd > 0 && macd > this.lastMACD) bullishScore += 25;
        else if (macd < 0 && macd < this.lastMACD) bearishScore += 25;

        // 价格相对 EMA
        if (price > ema20) bullishScore += 20;
        else bearishScore += 20;

        this.lastMACD = macd;

        // 做多条件：看涨分数 >= 70 且无持仓
        if (bullishScore >= 70 && !hasPosition) {
            const stopLoss = this.calculateStopLoss(price, 'long', this.config.stopLossPercent || 3);
            const takeProfit = this.calculateTakeProfit(price, 'long', this.config.takeProfitPercent || 6);

            return {
                symbol,
                action: 'buy',
                confidence: bullishScore,
                leverage: this.config.maxLeverage,
                stopLoss,
                takeProfit,
                reason: `多指标看涨: 分数=${bullishScore} (EMA趋势+RSI+MACD+价格位置)`
            };
        }

        // 平多条件：看跌分数 >= 70 且有多仓
        if (bearishScore >= 70 && hasPosition && position?.side === 'long') {
            return {
                symbol,
                action: 'close',
                confidence: bearishScore,
                reason: `多指标看跌: 分数=${bearishScore}`
            };
        }

        return this.createHoldSignal(symbol);
    }

    reset(): void {
        super.reset();
        this.lastMACD = 0;
    }
}

// ============================================
// 多Agent策略适配器
// ============================================

export class MultiAgentStrategyAdapter extends BaseStrategy {
    name = 'Multi-Agent Strategy';
    description = '多Agent系统策略适配器 - 适配现有的AgentForum';
    version = '1.0.0';

    // 简化版本：在回测中模拟多Agent决策
    // 实际使用时可以调用真实的AgentForum
    private decisionInterval: number = 15 * 60 * 1000; // 15分钟决策一次
    private lastDecisionTime: number = 0;

    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators, timestamp } = snapshot;

        // 控制决策频率
        if (timestamp - this.lastDecisionTime < this.decisionInterval) {
            return this.createHoldSignal(symbol);
        }

        this.lastDecisionTime = timestamp;

        // 模拟多Agent投票
        const votes = this.simulateAgentVotes(snapshot);
        const decision = this.aggregateVotes(votes);

        const hasPosition = this.hasPosition(account, symbol);
        const position = account.positions.find(p => p.symbol === symbol);

        if (decision.action === 'buy' && decision.confidence >= 60 && !hasPosition) {
            const stopLoss = this.calculateStopLoss(price, 'long', this.config.stopLossPercent || 3);
            const takeProfit = this.calculateTakeProfit(price, 'long', this.config.takeProfitPercent || 8);

            return {
                symbol,
                action: 'buy',
                confidence: decision.confidence,
                leverage: Math.min(decision.leverage, this.config.maxLeverage),
                stopLoss,
                takeProfit,
                reason: decision.reason
            };
        }

        if (decision.action === 'sell' && hasPosition && position?.side === 'long') {
            return {
                symbol,
                action: 'close',
                confidence: decision.confidence,
                reason: decision.reason
            };
        }

        return this.createHoldSignal(symbol);
    }

    /**
     * 模拟各Agent的投票（基于技术指标）
     */
    private simulateAgentVotes(snapshot: MarketSnapshot): AgentVote[] {
        const { price, indicators } = snapshot;
        const { ema20, ema50, rsi14, macd, atr14 } = indicators;

        const votes: AgentVote[] = [];

        // DeepSeek（技术分析）
        const technicalScore = this.calculateTechnicalScore(ema20, ema50, rsi14, macd);
        votes.push({
            agent: 'DeepSeek',
            action: technicalScore > 60 ? 'buy' : technicalScore < 40 ? 'sell' : 'hold',
            confidence: Math.abs(technicalScore - 50) * 2,
            reason: `技术分析分数: ${technicalScore}`
        });

        // Gemini（趋势分析）
        const trendScore = ema20 && ema50 ? (ema20 > ema50 ? 70 : 30) : 50;
        votes.push({
            agent: 'Gemini',
            action: trendScore > 60 ? 'buy' : trendScore < 40 ? 'sell' : 'hold',
            confidence: Math.abs(trendScore - 50) * 2,
            reason: `趋势分数: ${trendScore}`
        });

        // Qwen（情绪分析 - 基于RSI模拟）
        const sentimentScore = rsi14 ? (rsi14 < 30 ? 75 : rsi14 > 70 ? 25 : 50) : 50;
        votes.push({
            agent: 'Qwen',
            action: sentimentScore > 60 ? 'buy' : sentimentScore < 40 ? 'sell' : 'hold',
            confidence: Math.abs(sentimentScore - 50) * 2,
            reason: `情绪分数: ${sentimentScore} (RSI: ${rsi14?.toFixed(2)})`
        });

        return votes;
    }

    private calculateTechnicalScore(ema20?: number, ema50?: number, rsi14?: number, macd?: number): number {
        let score = 50;

        if (ema20 && ema50) {
            score += ema20 > ema50 ? 15 : -15;
        }

        if (rsi14) {
            if (rsi14 < 30) score += 15;
            else if (rsi14 > 70) score -= 15;
        }

        if (macd !== undefined) {
            score += macd > 0 ? 10 : -10;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * 聚合投票结果
     */
    private aggregateVotes(votes: AgentVote[]): {
        action: 'buy' | 'sell' | 'hold';
        confidence: number;
        leverage: number;
        reason: string;
    } {
        const buyVotes = votes.filter(v => v.action === 'buy');
        const sellVotes = votes.filter(v => v.action === 'sell');

        const buyConfidence = buyVotes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;
        const sellConfidence = sellVotes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

        // 需要 2/3 多数同意
        const consensusThreshold = 2 / 3;

        if (buyVotes.length / votes.length >= consensusThreshold) {
            return {
                action: 'buy',
                confidence: buyConfidence,
                leverage: 10,
                reason: `多Agent共识做多: ${buyVotes.length}/${votes.length} 同意 | ${buyVotes.map(v => v.agent).join(', ')}`
            };
        }

        if (sellVotes.length / votes.length >= consensusThreshold) {
            return {
                action: 'sell',
                confidence: sellConfidence,
                leverage: 10,
                reason: `多Agent共识做空/平仓: ${sellVotes.length}/${votes.length} 同意 | ${sellVotes.map(v => v.agent).join(', ')}`
            };
        }

        return {
            action: 'hold',
            confidence: 0,
            leverage: 0,
            reason: '多Agent未达成共识'
        };
    }

    reset(): void {
        super.reset();
        this.lastDecisionTime = 0;
    }
}

interface AgentVote {
    agent: string;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    reason: string;
}

// ============================================
// 策略工厂
// ============================================

export const BuiltInStrategies = {
    'ema_cross': EMACrossStrategy,
    'rsi': RSIStrategy,
    'macd': MACDStrategy,
    'bollinger': BollingerBandsStrategy,
    'multi_indicator': MultiIndicatorStrategy,
    'multi_agent': MultiAgentStrategyAdapter
} as const;

export type StrategyType = keyof typeof BuiltInStrategies;

// 自定义策略注册表
const customStrategies: Map<string, new () => IStrategy> = new Map();

/**
 * 注册自定义策略
 * @example
 * ```typescript
 * // 创建你的策略类
 * class MyStrategy extends BaseStrategy {
 *     name = 'My Custom Strategy';
 *     description = '我的自定义策略';
 *     version = '1.0.0';
 * 
 *     async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
 *         // 你的策略逻辑
 *         return { symbol: snapshot.symbol, action: 'hold', confidence: 0 };
 *     }
 * }
 * 
 * // 注册策略
 * registerStrategy('my_strategy', MyStrategy);
 * ```
 */
export function registerStrategy(name: string, strategyClass: new () => IStrategy): void {
    customStrategies.set(name, strategyClass);
    console.log(`✅ 已注册自定义策略: ${name}`);
}

/**
 * 获取所有可用策略列表
 */
export function getAvailableStrategies(): string[] {
    return [...Object.keys(BuiltInStrategies), ...customStrategies.keys()];
}

/**
 * 创建策略实例
 */
export function createStrategy(type: string): IStrategy {
    // 先检查内置策略
    if (type in BuiltInStrategies) {
        const StrategyClass = BuiltInStrategies[type as StrategyType];
        return new StrategyClass();
    }

    // 再检查自定义策略
    const CustomClass = customStrategies.get(type);
    if (CustomClass) {
        return new CustomClass();
    }

    throw new Error(`未知策略: ${type}。可用策略: ${getAvailableStrategies().join(', ')}`);
}

/*
╔══════════════════════════════════════════════════════════════════╗
║                    📚 如何创建自定义策略                          ║
╠══════════════════════════════════════════════════════════════════╣

1. 创建一个新文件，例如 lib/backtest/my-strategies.ts

2. 继承 BaseStrategy 类：

```typescript
import { BaseStrategy, registerStrategy, MarketSnapshot, AccountState, StrategySignal } from './strategy';

export class MyAwesomeStrategy extends BaseStrategy {
    name = 'My Awesome Strategy';
    description = '我的超级策略描述';
    version = '1.0.0';
    
    // 可选：初始化时调用
    async initialize(config: StrategyConfig): Promise<void> {
        await super.initialize(config);
        // 你的初始化逻辑
    }
    
    // 必须实现：每个K线触发
    async onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal> {
        const { symbol, price, indicators, timestamp } = snapshot;
        const { ema20, ema50, rsi14, macd, atr14, bbUpper, bbLower } = indicators;
        
        // 检查是否已有持仓
        const hasPosition = this.hasPosition(account, symbol);
        
        // 你的策略逻辑
        if (ema20 && ema50 && ema20 > ema50 && !hasPosition) {
            return {
                symbol,
                action: 'buy',
                confidence: 75,
                leverage: this.config.maxLeverage,
                stopLoss: this.calculateStopLoss(price, 'long', 3),
                takeProfit: this.calculateTakeProfit(price, 'long', 6),
                reason: '我的买入信号'
            };
        }
        
        return { symbol, action: 'hold', confidence: 0 };
    }
}

// 注册策略
registerStrategy('my_awesome', MyAwesomeStrategy);
```

3. 在运行回测前导入你的策略文件：

```typescript
import './lib/backtest/my-strategies';
```

4. 运行回测：

```bash
npx tsx scripts/run-backtest.ts --strategy=my_awesome --symbol=BTC/USDT --days=30
```

╚══════════════════════════════════════════════════════════════════╝
*/
