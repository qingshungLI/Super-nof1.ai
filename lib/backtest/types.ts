/**
 * 回测系统核心类型定义
 * 世界级量化交易回测框架
 */

// ============================================
// 基础数据类型
// ============================================

/**
 * OHLCV K线数据
 */
export interface OHLCV {
    timestamp: number;      // Unix timestamp (ms)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * 带指标的K线数据
 */
export interface OHLCVWithIndicators extends OHLCV {
    ema20?: number;
    ema50?: number;
    rsi14?: number;
    macd?: number;
    macdSignal?: number;
    macdHistogram?: number;
    atr14?: number;
    bbUpper?: number;     // 布林带上轨
    bbMiddle?: number;    // 布林带中轨
    bbLower?: number;     // 布林带下轨
}

/**
 * 市场快照（某一时刻的完整市场状态）
 */
export interface MarketSnapshot {
    timestamp: number;
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    spread: number;
    volume24h: number;
    fundingRate?: number;
    openInterest?: number;
    indicators: {
        ema20?: number;
        ema50?: number;
        rsi14?: number;
        macd?: number;
        macdSignal?: number;
        macdHistogram?: number;
        atr14?: number;
        bbUpper?: number;
        bbMiddle?: number;
        bbLower?: number;
    };
    klines: {
        m1: OHLCV[];    // 最近的1分钟K线
        m15: OHLCV[];   // 最近的15分钟K线
        h4: OHLCV[];    // 最近的4小时K线
    };
}

// ============================================
// 订单和持仓类型
// ============================================

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_market' | 'take_profit_market';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type PositionSide = 'long' | 'short' | 'none';

/**
 * 订单
 */
export interface Order {
    id: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;          // 限价单价格
    stopPrice?: number;      // 止损触发价格
    status: OrderStatus;
    filledQuantity: number;
    filledPrice: number;
    fee: number;
    slippage: number;
    createdAt: number;
    filledAt?: number;
    leverage: number;
    reduceOnly: boolean;
    reason?: string;         // 订单原因（如策略信号）
}

/**
 * 持仓
 */
export interface Position {
    symbol: string;
    side: PositionSide;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    leverage: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    liquidationPrice: number;
    margin: number;
    openedAt: number;
    stopLoss?: number;
    takeProfit?: number;
}

/**
 * 已平仓的交易
 */
export interface ClosedTrade {
    id: string;
    symbol: string;
    side: PositionSide;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    leverage: number;
    pnl: number;
    pnlPercent: number;
    fees: number;
    slippage: number;
    entryTime: number;
    exitTime: number;
    holdingPeriod: number;   // 持仓时间（ms）
    exitReason: 'take_profit' | 'stop_loss' | 'signal' | 'liquidation' | 'manual';
    maxDrawdown: number;     // 持仓期间最大回撤
    maxProfit: number;       // 持仓期间最大浮盈
}

// ============================================
// 账户和资金类型
// ============================================

/**
 * 账户状态
 */
export interface AccountState {
    balance: number;          // 总余额
    availableBalance: number; // 可用余额
    totalMargin: number;      // 已使用保证金
    unrealizedPnl: number;    // 未实现盈亏
    realizedPnl: number;      // 已实现盈亏
    totalFees: number;        // 累计手续费
    positions: Position[];    // 当前持仓
    openOrders: Order[];      // 挂单
}

/**
 * 账户快照（用于记录权益曲线）
 */
export interface EquitySnapshot {
    timestamp: number;
    equity: number;           // 总权益 = 余额 + 未实现盈亏
    balance: number;          // 余额
    drawdown: number;         // 当前回撤
    drawdownPercent: number;  // 当前回撤百分比
    positionCount: number;    // 持仓数量
    leverage: number;         // 当前杠杆
}

// ============================================
// 策略接口
// ============================================

/**
 * 策略信号
 */
export interface StrategySignal {
    symbol: string;
    action: 'buy' | 'sell' | 'close' | 'hold';
    confidence: number;       // 0-100
    quantity?: number;        // 交易数量
    leverage?: number;        // 杠杆
    stopLoss?: number;        // 止损价格
    takeProfit?: number;      // 止盈价格
    reason?: string;          // 决策原因（可选）
    metadata?: Record<string, any>;  // 额外元数据
}

/**
 * 策略接口 - 所有策略必须实现
 */
export interface IStrategy {
    name: string;
    description: string;
    version: string;

    /**
     * 初始化策略
     */
    initialize(config: StrategyConfig): Promise<void>;

    /**
     * 处理新的市场数据，返回交易信号
     */
    onData(snapshot: MarketSnapshot, account: AccountState): Promise<StrategySignal>;

    /**
     * 订单成交回调
     */
    onOrderFilled?(order: Order): void;

    /**
     * 持仓更新回调
     */
    onPositionUpdate?(position: Position): void;

    /**
     * 策略重置
     */
    reset(): void;
}

/**
 * 策略配置
 */
export interface StrategyConfig {
    symbols: string[];
    initialCapital: number;
    maxPositionSize: number;      // 最大持仓比例 (0-1)
    maxLeverage: number;
    riskPerTrade: number;         // 单笔风险比例 (0-1)
    stopLossPercent?: number;
    takeProfitPercent?: number;
    customParams?: Record<string, any>;
}

// ============================================
// 回测配置和结果
// ============================================

/**
 * 回测配置
 */
export interface BacktestConfig {
    // 时间范围
    startDate: Date;
    endDate: Date;

    // 交易对
    symbols: string[];

    // 时间框架
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

    // 资金设置
    initialCapital: number;

    // 交易成本
    makerFee: number;           // Maker手续费 (如 0.0002 = 0.02%)
    takerFee: number;           // Taker手续费 (如 0.0004 = 0.04%)
    slippageModel: 'fixed' | 'volume_based' | 'volatility_based';
    slippagePercent: number;    // 固定滑点百分比

    // 杠杆和风险
    maxLeverage: number;
    marginCallLevel: number;    // 保证金追缴水平 (如 0.5 = 50%)
    liquidationLevel: number;   // 强平水平 (如 0.2 = 20%)

    // 策略
    strategy: IStrategy;
    strategyConfig: StrategyConfig;

    // 数据源
    dataSource: 'binance' | 'local' | 'custom';
    localDataPath?: string;

    // 进度回调
    onProgress?: (progress: BacktestProgress) => void;
}

/**
 * 回测进度
 */
export interface BacktestProgress {
    currentDate: Date;
    startDate: Date;
    endDate: Date;
    progressPercent: number;
    tradesExecuted: number;
    currentEquity: number;
    status: 'running' | 'paused' | 'completed' | 'error';
    message?: string;
}

/**
 * 回测结果
 */
export interface BacktestResult {
    // 基础信息
    config: Omit<BacktestConfig, 'strategy' | 'onProgress'>;
    strategyName: string;
    startDate: Date;
    endDate: Date;
    duration: number;           // 回测耗时(ms)

    // 资金曲线
    equityCurve: EquitySnapshot[];

    // 交易记录
    trades: ClosedTrade[];

    // 性能指标
    performance: PerformanceMetrics;

    // 月度/年度统计
    monthlyReturns: MonthlyReturn[];
    yearlyReturns: YearlyReturn[];

    // 风险指标
    riskMetrics: RiskMetrics;

    // 交易统计
    tradeStatistics: TradeStatistics;
}

// ============================================
// 性能和风险指标
// ============================================

/**
 * 性能指标
 */
export interface PerformanceMetrics {
    // 收益指标
    totalReturn: number;          // 总收益率
    totalReturnPercent: number;   // 总收益率百分比
    annualizedReturn: number;     // 年化收益率

    // 风险调整收益
    sharpeRatio: number;          // 夏普比率
    sortinoRatio: number;         // 索提诺比率
    calmarRatio: number;          // 卡尔玛比率

    // 最大回撤
    maxDrawdown: number;          // 最大回撤金额
    maxDrawdownPercent: number;   // 最大回撤百分比
    maxDrawdownDuration: number;  // 最大回撤持续时间(天)
    maxDrawdownStart: Date;
    maxDrawdownEnd: Date;

    // 其他
    profitFactor: number;         // 盈亏比 = 总盈利/总亏损
    recoveryFactor: number;       // 恢复因子 = 净利润/最大回撤

    // 基准比较
    alpha?: number;               // 超额收益
    beta?: number;                // 贝塔系数
    informationRatio?: number;    // 信息比率
}

/**
 * 风险指标
 */
export interface RiskMetrics {
    // 波动率
    dailyVolatility: number;      // 日波动率
    annualizedVolatility: number; // 年化波动率
    downsideVolatility: number;   // 下行波动率

    // VaR (Value at Risk)
    var95: number;                // 95% VaR
    var99: number;                // 99% VaR
    cvar95: number;               // 95% CVaR (条件风险价值)

    // 回撤分析
    avgDrawdown: number;          // 平均回撤
    drawdownStdDev: number;       // 回撤标准差
    drawdownCount: number;        // 回撤次数

    // 敞口
    avgLeverage: number;          // 平均杠杆
    maxLeverage: number;          // 最大杠杆
    avgExposure: number;          // 平均敞口
    maxExposure: number;          // 最大敞口
}

/**
 * 交易统计
 */
export interface TradeStatistics {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;              // 胜率

    // 盈亏分析
    avgWin: number;               // 平均盈利
    avgLoss: number;              // 平均亏损
    avgWinPercent: number;        // 平均盈利百分比
    avgLossPercent: number;       // 平均亏损百分比
    largestWin: number;           // 最大单笔盈利
    largestLoss: number;          // 最大单笔亏损

    // 连续统计
    maxConsecutiveWins: number;   // 最大连胜
    maxConsecutiveLosses: number; // 最大连败
    avgHoldingPeriod: number;     // 平均持仓时间(小时)

    // 按方向统计
    longTrades: number;
    shortTrades: number;
    longWinRate: number;
    shortWinRate: number;

    // 按时间统计
    tradesPerDay: number;
    profitableDays: number;
    losingDays: number;
    dayWinRate: number;

    // 费用分析
    totalFees: number;
    totalSlippage: number;
    feeImpact: number;            // 费用占总收益的比例
}

/**
 * 月度收益
 */
export interface MonthlyReturn {
    year: number;
    month: number;
    return: number;
    returnPercent: number;
    trades: number;
    maxDrawdown: number;
}

/**
 * 年度收益
 */
export interface YearlyReturn {
    year: number;
    return: number;
    returnPercent: number;
    trades: number;
    maxDrawdown: number;
    sharpeRatio: number;
}

// ============================================
// 事件系统
// ============================================

export type BacktestEventType =
    | 'tick'
    | 'bar_close'
    | 'order_created'
    | 'order_filled'
    | 'order_cancelled'
    | 'position_opened'
    | 'position_closed'
    | 'margin_call'
    | 'liquidation'
    | 'equity_update'
    | 'error';

export interface BacktestEvent {
    type: BacktestEventType;
    timestamp: number;
    data: any;
}

export type EventHandler = (event: BacktestEvent) => void;
