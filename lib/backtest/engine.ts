/**
 * 回测引擎核心
 * 事件驱动架构，支持精确的订单执行模拟
 */

import {
    OHLCV,
    OHLCVWithIndicators,
    MarketSnapshot,
    Order,
    OrderSide,
    OrderType,
    OrderStatus,
    Position,
    PositionSide,
    ClosedTrade,
    AccountState,
    EquitySnapshot,
    BacktestConfig,
    BacktestProgress,
    BacktestResult,
    BacktestEvent,
    BacktestEventType,
    EventHandler,
    IStrategy,
    StrategySignal
} from './types';
import { DataLoader } from './data-loader';
import { PerformanceAnalyzer } from './analyzer';

/**
 * 回测引擎
 */
export class BacktestEngine {
    private config: BacktestConfig;
    private data: Map<string, OHLCVWithIndicators[]> = new Map();
    private account: AccountState;
    private closedTrades: ClosedTrade[] = [];
    private equityCurve: EquitySnapshot[] = [];
    private eventHandlers: Map<BacktestEventType, EventHandler[]> = new Map();
    private currentIndex: number = 0;
    private orderIdCounter: number = 0;
    private tradeIdCounter: number = 0;
    private peakEquity: number;
    private isRunning: boolean = false;

    constructor(config: BacktestConfig) {
        this.config = config;
        this.peakEquity = config.initialCapital;

        // 初始化账户状态
        this.account = {
            balance: config.initialCapital,
            availableBalance: config.initialCapital,
            totalMargin: 0,
            unrealizedPnl: 0,
            realizedPnl: 0,
            totalFees: 0,
            positions: [],
            openOrders: []
        };
    }

    /**
     * 注册事件处理器
     */
    on(eventType: BacktestEventType, handler: EventHandler): void {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType)!.push(handler);
    }

    /**
     * 触发事件
     */
    private emit(event: BacktestEvent): void {
        const handlers = this.eventHandlers.get(event.type);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(event);
                } catch (error) {
                    console.error(`事件处理器错误: ${event.type}`, error);
                }
            }
        }
    }

    /**
     * 运行回测
     */
    async run(): Promise<BacktestResult> {
        const startTime = Date.now();
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('                    🚀 开始回测                         ');
        console.log('═══════════════════════════════════════════════════════\n');

        // 1. 加载数据
        await this.loadData();

        // 2. 初始化策略
        await this.config.strategy.initialize(this.config.strategyConfig);

        // 3. 获取所有时间戳并排序
        const allTimestamps = this.getAllTimestamps();
        console.log(`📊 总计 ${allTimestamps.length} 个时间点需要处理\n`);

        this.isRunning = true;

        // 4. 遍历每个时间点
        for (let i = 0; i < allTimestamps.length && this.isRunning; i++) {
            const timestamp = allTimestamps[i];
            this.currentIndex = i;

            // 创建市场快照
            const snapshot = this.createMarketSnapshot(timestamp);
            if (!snapshot) continue;

            // 更新持仓盈亏
            this.updatePositionsPnL(snapshot);

            // 检查止损止盈
            await this.checkStopLossTakeProfit(snapshot);

            // 检查强平
            this.checkLiquidation(snapshot);

            // 处理挂单
            this.processOrders(snapshot);

            // 调用策略
            try {
                const signal = await this.config.strategy.onData(snapshot, { ...this.account });
                await this.processSignal(signal, snapshot);
            } catch (error) {
                console.error(`策略执行错误: ${error}`);
            }

            // 记录权益
            this.recordEquity(timestamp);

            // 发送进度
            if (i % 100 === 0 || i === allTimestamps.length - 1) {
                this.reportProgress(timestamp, allTimestamps);
            }
        }

        // 5. 平仓所有持仓
        await this.closeAllPositions('backtest_end');

        // 6. 分析结果
        const result = this.generateResult(startTime);

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('                    ✅ 回测完成                         ');
        console.log('═══════════════════════════════════════════════════════\n');

        return result;
    }

    /**
     * 停止回测
     */
    stop(): void {
        this.isRunning = false;
    }

    /**
     * 加载历史数据
     */
    private async loadData(): Promise<void> {
        console.log('📥 加载历史数据...\n');

        for (const symbol of this.config.symbols) {
            const loader = new DataLoader({
                symbol,
                timeframe: this.config.timeframe,
                startDate: this.config.startDate,
                endDate: this.config.endDate
            });

            const loaded = await loader.load();
            this.data.set(symbol, loaded.data);
            console.log(`   ✅ ${symbol}: ${loaded.data.length} 条 K 线`);
        }
        console.log('');
    }

    /**
     * 获取所有时间戳（合并所有交易对）
     */
    private getAllTimestamps(): number[] {
        const timestampSet = new Set<number>();

        this.data.forEach((candles) => {
            for (const candle of candles) {
                timestampSet.add(candle.timestamp);
            }
        });

        return Array.from(timestampSet).sort((a, b) => a - b);
    }

    /**
     * 创建市场快照
     */
    private createMarketSnapshot(timestamp: number): MarketSnapshot | null {
        // 使用第一个交易对作为主要参考
        const symbol = this.config.symbols[0];
        const candles = this.data.get(symbol);
        if (!candles) return null;

        const currentCandle = candles.find(c => c.timestamp === timestamp);
        if (!currentCandle) return null;

        // 获取历史 K 线用于分析
        const currentIdx = candles.findIndex(c => c.timestamp === timestamp);
        const recentCandles = candles.slice(Math.max(0, currentIdx - 50), currentIdx + 1);

        return {
            timestamp,
            symbol,
            price: currentCandle.close,
            bid: currentCandle.close * (1 - 0.0001), // 模拟买卖价差
            ask: currentCandle.close * (1 + 0.0001),
            spread: currentCandle.close * 0.0002,
            volume24h: recentCandles.slice(-24).reduce((sum, c) => sum + c.volume, 0),
            indicators: {
                ema20: currentCandle.ema20 || 0,
                ema50: currentCandle.ema50 || 0,
                rsi14: currentCandle.rsi14 || 50,
                macd: currentCandle.macd || 0,
                atr14: currentCandle.atr14 || 0
            },
            klines: {
                m1: recentCandles.slice(-10) as OHLCV[],
                m15: recentCandles.slice(-10) as OHLCV[],
                h4: recentCandles.slice(-10) as OHLCV[]
            }
        };
    }

    /**
     * 更新持仓盈亏
     */
    private updatePositionsPnL(snapshot: MarketSnapshot): void {
        let totalUnrealizedPnl = 0;
        let totalMargin = 0;

        for (const position of this.account.positions) {
            if (position.symbol !== snapshot.symbol) continue;

            position.currentPrice = snapshot.price;

            // 计算未实现盈亏
            const priceDiff = position.side === 'long'
                ? snapshot.price - position.entryPrice
                : position.entryPrice - snapshot.price;

            position.unrealizedPnl = priceDiff * position.quantity;
            position.unrealizedPnlPercent = (priceDiff / position.entryPrice) * 100 * position.leverage;

            // 计算强平价格
            const maintenanceMargin = 0.5; // 50% 维持保证金
            const marginPercent = 1 / position.leverage;
            position.liquidationPrice = position.side === 'long'
                ? position.entryPrice * (1 - marginPercent * maintenanceMargin)
                : position.entryPrice * (1 + marginPercent * maintenanceMargin);

            totalUnrealizedPnl += position.unrealizedPnl;
            totalMargin += position.margin;
        }

        this.account.unrealizedPnl = totalUnrealizedPnl;
        this.account.totalMargin = totalMargin;
        this.account.availableBalance = this.account.balance + totalUnrealizedPnl - totalMargin;
    }

    /**
     * 检查止损止盈
     */
    private async checkStopLossTakeProfit(snapshot: MarketSnapshot): Promise<void> {
        const positionsToClose: { position: Position; reason: string }[] = [];

        for (const position of this.account.positions) {
            if (position.symbol !== snapshot.symbol) continue;

            // 检查止损
            if (position.stopLoss) {
                const triggered = position.side === 'long'
                    ? snapshot.price <= position.stopLoss
                    : snapshot.price >= position.stopLoss;

                if (triggered) {
                    positionsToClose.push({ position, reason: 'stop_loss' });
                    continue;
                }
            }

            // 检查止盈
            if (position.takeProfit) {
                const triggered = position.side === 'long'
                    ? snapshot.price >= position.takeProfit
                    : snapshot.price <= position.takeProfit;

                if (triggered) {
                    positionsToClose.push({ position, reason: 'take_profit' });
                }
            }
        }

        // 平仓
        for (const { position, reason } of positionsToClose) {
            await this.closePosition(position, snapshot.price, reason as any);
        }
    }

    /**
     * 检查强平
     */
    private checkLiquidation(snapshot: MarketSnapshot): void {
        for (const position of [...this.account.positions]) {
            if (position.symbol !== snapshot.symbol) continue;

            const isLiquidated = position.side === 'long'
                ? snapshot.price <= position.liquidationPrice
                : snapshot.price >= position.liquidationPrice;

            if (isLiquidated) {
                console.log(`⚠️ 强制平仓: ${position.symbol} @ ${snapshot.price}`);
                this.closePosition(position, snapshot.price, 'liquidation');

                this.emit({
                    type: 'liquidation',
                    timestamp: snapshot.timestamp,
                    data: { position, price: snapshot.price }
                });
            }
        }
    }

    /**
     * 处理挂单
     */
    private processOrders(snapshot: MarketSnapshot): void {
        const ordersToFill: Order[] = [];

        for (const order of this.account.openOrders) {
            if (order.symbol !== snapshot.symbol) continue;

            let shouldFill = false;
            let fillPrice = snapshot.price;

            switch (order.type) {
                case 'limit':
                    if (order.side === 'buy' && snapshot.price <= order.price!) {
                        shouldFill = true;
                        fillPrice = order.price!;
                    } else if (order.side === 'sell' && snapshot.price >= order.price!) {
                        shouldFill = true;
                        fillPrice = order.price!;
                    }
                    break;

                case 'stop_market':
                    if (order.side === 'buy' && snapshot.price >= order.stopPrice!) {
                        shouldFill = true;
                    } else if (order.side === 'sell' && snapshot.price <= order.stopPrice!) {
                        shouldFill = true;
                    }
                    break;
            }

            if (shouldFill) {
                ordersToFill.push(order);
                this.fillOrder(order, fillPrice, snapshot.timestamp);
            }
        }
    }

    /**
     * 处理策略信号
     */
    private async processSignal(signal: StrategySignal, snapshot: MarketSnapshot): Promise<void> {
        if (signal.action === 'hold') return;

        if (signal.action === 'close') {
            const position = this.account.positions.find(p => p.symbol === signal.symbol);
            if (position) {
                await this.closePosition(position, snapshot.price, 'signal');
            }
            return;
        }

        // 买入或卖出
        const side: OrderSide = signal.action;
        const quantity = signal.quantity || this.calculateQuantity(signal, snapshot);
        const leverage = signal.leverage || this.config.maxLeverage;

        // 创建市价单
        const order = this.createOrder({
            symbol: signal.symbol,
            side,
            type: 'market',
            quantity,
            leverage,
            reason: signal.reason
        });

        // 立即执行市价单
        this.fillOrder(order, snapshot.price, snapshot.timestamp);

        // 设置止损止盈
        if (order.status === 'filled') {
            const position = this.account.positions.find(p => p.symbol === signal.symbol);
            if (position) {
                position.stopLoss = signal.stopLoss;
                position.takeProfit = signal.takeProfit;
            }
        }
    }

    /**
     * 计算交易数量
     */
    private calculateQuantity(signal: StrategySignal, snapshot: MarketSnapshot): number {
        const riskAmount = this.account.availableBalance * this.config.strategyConfig.riskPerTrade;
        const leverage = signal.leverage || this.config.maxLeverage;
        const notionalValue = riskAmount * leverage;
        return notionalValue / snapshot.price;
    }

    /**
     * 创建订单
     */
    private createOrder(params: {
        symbol: string;
        side: OrderSide;
        type: OrderType;
        quantity: number;
        price?: number;
        stopPrice?: number;
        leverage: number;
        reason?: string;
    }): Order {
        const order: Order = {
            id: `order_${++this.orderIdCounter}`,
            symbol: params.symbol,
            side: params.side,
            type: params.type,
            quantity: params.quantity,
            price: params.price,
            stopPrice: params.stopPrice,
            status: 'pending',
            filledQuantity: 0,
            filledPrice: 0,
            fee: 0,
            slippage: 0,
            createdAt: Date.now(),
            leverage: params.leverage,
            reduceOnly: false,
            reason: params.reason
        };

        this.account.openOrders.push(order);

        this.emit({
            type: 'order_created',
            timestamp: order.createdAt,
            data: order
        });

        return order;
    }

    /**
     * 执行订单
     */
    private fillOrder(order: Order, price: number, timestamp: number): void {
        // 计算滑点
        const slippage = this.calculateSlippage(order, price);
        const fillPrice = order.side === 'buy'
            ? price * (1 + slippage)
            : price * (1 - slippage);

        // 计算手续费
        const fee = this.calculateFee(order, fillPrice);

        // 更新订单状态
        order.status = 'filled';
        order.filledQuantity = order.quantity;
        order.filledPrice = fillPrice;
        order.fee = fee;
        order.slippage = slippage;
        order.filledAt = timestamp;

        // 从挂单列表移除
        this.account.openOrders = this.account.openOrders.filter(o => o.id !== order.id);

        // 更新账户和持仓
        this.updateAccountAfterFill(order);

        this.emit({
            type: 'order_filled',
            timestamp,
            data: order
        });

        // 通知策略
        if (this.config.strategy.onOrderFilled) {
            this.config.strategy.onOrderFilled(order);
        }
    }

    /**
     * 计算滑点
     */
    private calculateSlippage(order: Order, price: number): number {
        const { slippageModel, slippagePercent } = this.config;

        switch (slippageModel) {
            case 'fixed':
                return slippagePercent;

            case 'volume_based':
                // 基于订单规模的滑点
                const notional = order.quantity * price;
                return slippagePercent * (1 + notional / 100000); // 每10万增加滑点

            case 'volatility_based':
                // TODO: 基于波动率的滑点
                return slippagePercent;

            default:
                return slippagePercent;
        }
    }

    /**
     * 计算手续费
     */
    private calculateFee(order: Order, fillPrice: number): number {
        const notional = order.quantity * fillPrice;
        const feeRate = order.type === 'market' ? this.config.takerFee : this.config.makerFee;
        return notional * feeRate;
    }

    /**
     * 更新账户状态（订单成交后）
     */
    private updateAccountAfterFill(order: Order): void {
        const existingPosition = this.account.positions.find(p => p.symbol === order.symbol);

        if (order.reduceOnly && existingPosition) {
            // 减仓
            this.reducePosition(existingPosition, order);
        } else if (existingPosition) {
            // 有持仓时的处理
            if ((existingPosition.side === 'long' && order.side === 'sell') ||
                (existingPosition.side === 'short' && order.side === 'buy')) {
                // 反向订单，平仓
                this.reducePosition(existingPosition, order);
            } else {
                // 同向订单，加仓
                this.addToPosition(existingPosition, order);
            }
        } else {
            // 新开仓
            this.openPosition(order);
        }

        // 扣除手续费
        this.account.balance -= order.fee;
        this.account.totalFees += order.fee;
    }

    /**
     * 开新仓位
     */
    private openPosition(order: Order): void {
        const margin = (order.quantity * order.filledPrice) / order.leverage;

        const position: Position = {
            symbol: order.symbol,
            side: order.side === 'buy' ? 'long' : 'short',
            quantity: order.quantity,
            entryPrice: order.filledPrice,
            currentPrice: order.filledPrice,
            leverage: order.leverage,
            unrealizedPnl: 0,
            unrealizedPnlPercent: 0,
            liquidationPrice: 0,
            margin,
            openedAt: order.filledAt!
        };

        this.account.positions.push(position);
        this.account.totalMargin += margin;
        this.account.availableBalance -= margin;

        this.emit({
            type: 'position_opened',
            timestamp: order.filledAt!,
            data: position
        });
    }

    /**
     * 加仓
     */
    private addToPosition(position: Position, order: Order): void {
        const totalCost = position.entryPrice * position.quantity + order.filledPrice * order.quantity;
        const totalQuantity = position.quantity + order.quantity;

        position.entryPrice = totalCost / totalQuantity;
        position.quantity = totalQuantity;

        const additionalMargin = (order.quantity * order.filledPrice) / order.leverage;
        position.margin += additionalMargin;
        this.account.totalMargin += additionalMargin;
        this.account.availableBalance -= additionalMargin;
    }

    /**
     * 减仓
     */
    private reducePosition(position: Position, order: Order): void {
        const closeQuantity = Math.min(order.quantity, position.quantity);
        const remainingQuantity = position.quantity - closeQuantity;

        // 计算已实现盈亏
        const priceDiff = position.side === 'long'
            ? order.filledPrice - position.entryPrice
            : position.entryPrice - order.filledPrice;

        const realizedPnl = priceDiff * closeQuantity;

        if (remainingQuantity <= 0) {
            // 完全平仓
            this.closePositionInternal(position, order.filledPrice, order.filledAt!, 'signal', realizedPnl);
        } else {
            // 部分平仓
            const releasedMargin = position.margin * (closeQuantity / position.quantity);
            position.quantity = remainingQuantity;
            position.margin -= releasedMargin;

            this.account.totalMargin -= releasedMargin;
            this.account.balance += realizedPnl;
            this.account.realizedPnl += realizedPnl;
            this.account.availableBalance += releasedMargin + realizedPnl;
        }
    }

    /**
     * 平仓
     */
    private async closePosition(
        position: Position,
        exitPrice: number,
        reason: 'take_profit' | 'stop_loss' | 'signal' | 'liquidation' | 'manual'
    ): Promise<void> {
        const priceDiff = position.side === 'long'
            ? exitPrice - position.entryPrice
            : position.entryPrice - exitPrice;

        const realizedPnl = priceDiff * position.quantity;

        this.closePositionInternal(position, exitPrice, Date.now(), reason, realizedPnl);
    }

    /**
     * 内部平仓逻辑
     */
    private closePositionInternal(
        position: Position,
        exitPrice: number,
        timestamp: number,
        reason: ClosedTrade['exitReason'],
        realizedPnl: number
    ): void {
        // 计算手续费
        const closeFee = position.quantity * exitPrice * this.config.takerFee;
        realizedPnl -= closeFee;

        // 创建已平仓交易记录
        const trade: ClosedTrade = {
            id: `trade_${++this.tradeIdCounter}`,
            symbol: position.symbol,
            side: position.side,
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            leverage: position.leverage,
            pnl: realizedPnl,
            pnlPercent: (realizedPnl / position.margin) * 100,
            fees: closeFee,
            slippage: 0,
            entryTime: position.openedAt,
            exitTime: timestamp,
            holdingPeriod: timestamp - position.openedAt,
            exitReason: reason,
            maxDrawdown: 0,  // TODO: 追踪持仓期间最大回撤
            maxProfit: 0     // TODO: 追踪持仓期间最大浮盈
        };

        this.closedTrades.push(trade);

        // 更新账户
        this.account.positions = this.account.positions.filter(p => p !== position);
        this.account.totalMargin -= position.margin;
        this.account.balance += realizedPnl + position.margin;
        this.account.realizedPnl += realizedPnl;
        this.account.totalFees += closeFee;
        this.account.availableBalance += position.margin + realizedPnl;

        this.emit({
            type: 'position_closed',
            timestamp,
            data: { position, trade }
        });

        console.log(`   📈 平仓: ${position.symbol} ${position.side.toUpperCase()} | PnL: ${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%) | 原因: ${reason}`);
    }

    /**
     * 平仓所有持仓
     */
    private async closeAllPositions(reason: string): Promise<void> {
        for (const position of [...this.account.positions]) {
            await this.closePosition(position, position.currentPrice, 'manual');
        }
    }

    /**
     * 记录权益
     */
    private recordEquity(timestamp: number): void {
        const equity = this.account.balance + this.account.unrealizedPnl;

        // 更新峰值
        if (equity > this.peakEquity) {
            this.peakEquity = equity;
        }

        const drawdown = this.peakEquity - equity;
        const drawdownPercent = this.peakEquity > 0 ? (drawdown / this.peakEquity) * 100 : 0;

        // 计算当前杠杆
        const totalNotional = this.account.positions.reduce(
            (sum, p) => sum + p.quantity * p.currentPrice, 0
        );
        const leverage = equity > 0 ? totalNotional / equity : 0;

        this.equityCurve.push({
            timestamp,
            equity,
            balance: this.account.balance,
            drawdown,
            drawdownPercent,
            positionCount: this.account.positions.length,
            leverage
        });
    }

    /**
     * 报告进度
     */
    private reportProgress(currentTimestamp: number, allTimestamps: number[]): void {
        const startTs = allTimestamps[0];
        const endTs = allTimestamps[allTimestamps.length - 1];
        const progress = ((currentTimestamp - startTs) / (endTs - startTs)) * 100;

        const equity = this.account.balance + this.account.unrealizedPnl;
        const returnPct = ((equity - this.config.initialCapital) / this.config.initialCapital) * 100;

        process.stdout.write(
            `\r📊 进度: ${progress.toFixed(1)}% | 权益: $${equity.toFixed(2)} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%) | 交易: ${this.closedTrades.length}`
        );

        if (this.config.onProgress) {
            this.config.onProgress({
                currentDate: new Date(currentTimestamp),
                startDate: this.config.startDate,
                endDate: this.config.endDate,
                progressPercent: progress,
                tradesExecuted: this.closedTrades.length,
                currentEquity: equity,
                status: 'running'
            });
        }
    }

    /**
     * 生成回测结果
     */
    private generateResult(startTime: number): BacktestResult {
        const analyzer = new PerformanceAnalyzer(
            this.equityCurve,
            this.closedTrades,
            this.config.initialCapital
        );

        const { strategy, onProgress, ...configWithoutStrategy } = this.config;

        return {
            config: configWithoutStrategy,
            strategyName: this.config.strategy.name,
            startDate: this.config.startDate,
            endDate: this.config.endDate,
            duration: Date.now() - startTime,
            equityCurve: this.equityCurve,
            trades: this.closedTrades,
            performance: analyzer.calculatePerformance(),
            monthlyReturns: analyzer.calculateMonthlyReturns(),
            yearlyReturns: analyzer.calculateYearlyReturns(),
            riskMetrics: analyzer.calculateRiskMetrics(),
            tradeStatistics: analyzer.calculateTradeStatistics()
        };
    }
}
