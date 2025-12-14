/**
 * 币安交易精度工具模块
 * 提供动态获取和调整交易对精度的功能
 */

/**
 * Binance Futures 合约的精度配置（后备配置）
 * 数量精度 (quantity) 决定最小可交易数量
 * 注意:测试网精度可能与实盘不同，优先使用动态获取的精度
 * 
 * 精度配置说明：
 * - BTC: 0.001 (3位小数)
 * - ETH: 0.01 (2位小数)
 * - BNB: 0.1 (1位小数)
 * - SOL: 整数 (0位小数) - 测试网要求整数
 * - ADA: 整数 (0位小数)
 * - DOGE: 整数 (0位小数)
 */
export const SYMBOL_PRECISION: Record<string, { quantity: number; price: number; minNotional: number }> = {
    "BTCUSDT": { quantity: 3, price: 1, minNotional: 5 },   // 0.001 BTC, 最小5
    "ETHUSDT": { quantity: 2, price: 2, minNotional: 5 },   // 0.01 ETH, 最小5
    "BNBUSDT": { quantity: 1, price: 2, minNotional: 5 },   // 0.1 BNB, 最小5
    "SOLUSDT": { quantity: 0, price: 3, minNotional: 5 },   // 1 SOL (整数) - 测试网精度
    "ADAUSDT": { quantity: 0, price: 4, minNotional: 5 },   // 1 ADA, 最小5
    "DOGEUSDT": { quantity: 0, price: 5, minNotional: 5 },  // 1 DOGE, 最小5 🐕
};

// 缓存动态获取的精度信息
export const dynamicPrecisionCache: Record<string, { quantity: number; price: number; minNotional: number } | null> = {};

/**
 * 从 Binance API 动态获取交易对精度信息
 */
export async function getDynamicPrecision(symbol: string, client: any): Promise<{ quantity: number; price: number; minNotional: number } | null> {
    // 检查缓存
    if (dynamicPrecisionCache[symbol] !== undefined) {
        return dynamicPrecisionCache[symbol];
    }

    try {
        console.log(`🔍 Fetching precision info for ${symbol} from Binance API...`);

        // 获取交易规则
        const exchangeInfo = await client.exchangeInfo({ symbol });
        const symbolInfo = exchangeInfo.data?.symbols?.[0];

        if (!symbolInfo) {
            console.warn(`⚠️ No symbol info found for ${symbol}, using fallback`);
            dynamicPrecisionCache[symbol] = null;
            return null;
        }

        // 提取精度信息
        const quantityPrecision = symbolInfo.quantityPrecision || 0;
        const pricePrecision = symbolInfo.pricePrecision || 2;

        // 提取最小名义价值（从 NOTIONAL 或 MIN_NOTIONAL 过滤器）
        let minNotional = 5; // 默认值
        const notionalFilter = symbolInfo.filters?.find((f: any) =>
            f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL'
        );
        if (notionalFilter?.notional) {
            minNotional = parseFloat(notionalFilter.notional);
        } else if (notionalFilter?.minNotional) {
            minNotional = parseFloat(notionalFilter.minNotional);
        }

        const precision = {
            quantity: quantityPrecision,
            price: pricePrecision,
            minNotional
        };

        console.log(`✅ Dynamic precision for ${symbol}:`, precision);
        dynamicPrecisionCache[symbol] = precision;
        return precision;
    } catch (error: any) {
        console.warn(`⚠️ Failed to fetch dynamic precision for ${symbol}:`, error.message);
        dynamicPrecisionCache[symbol] = null;
        return null;
    }
}

/**
 * 调整数量精度以符合 Binance 要求
 * 优先使用动态获取的精度，回退到硬编码配置
 */
export async function adjustPrecision(amount: number, symbol: string, client?: any): Promise<number> {
    console.log(`🔧 [adjustPrecision] Input: ${amount} ${symbol}, client: ${client ? 'provided' : 'not provided'}`);

    // 尝试获取动态精度
    let config = SYMBOL_PRECISION[symbol] || { quantity: 3, price: 2, minNotional: 5 };
    console.log(`📋 [adjustPrecision] Fallback config for ${symbol}:`, config);

    if (client) {
        const dynamicConfig = await getDynamicPrecision(symbol, client);
        if (dynamicConfig) {
            console.log(`✅ [adjustPrecision] Using dynamic config:`, dynamicConfig);
            config = dynamicConfig;
        } else {
            console.log(`⚠️ [adjustPrecision] Dynamic config failed, using fallback`);
        }
    } else {
        console.log(`⚠️ [adjustPrecision] No client provided, using fallback only`);
    }

    const factor = Math.pow(10, config.quantity);
    const adjusted = Math.floor(amount * factor) / factor;

    console.log(`⚙️ [adjustPrecision] Calculation: Math.floor(${amount} * ${factor}) / ${factor} = ${adjusted}`);

    if (adjusted !== amount) {
        console.log(`⚙️ Precision adjusted: ${amount} → ${adjusted} (${config.quantity} decimals)`);
    }

    return adjusted;
}

/**
 * 获取最小交易数量
 */
export function getMinAmount(symbol: string): number {
    const config = dynamicPrecisionCache[symbol] || SYMBOL_PRECISION[symbol] || { quantity: 3 };
    return Math.pow(10, -(config.quantity || 3));
}

/**
 * 检查订单是否满足最小名义价值要求
 */
export function checkMinNotional(amount: number, symbol: string, price?: number): { valid: boolean; reason?: string } {
    const config = dynamicPrecisionCache[symbol] || SYMBOL_PRECISION[symbol] || { quantity: 3, price: 2, minNotional: 5 };

    // 如果没有提供价格,跳过检查（市价单在执行时会检查）
    if (!price) {
        return { valid: true };
    }

    const notional = amount * price;
    if (notional < config.minNotional) {
        return {
            valid: false,
            reason: `Order value $${notional.toFixed(2)} below minimum $${config.minNotional}`
        };
    }

    return { valid: true };
}
