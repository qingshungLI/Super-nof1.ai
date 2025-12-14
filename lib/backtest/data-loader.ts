/**
 * 历史数据加载器
 * 支持从 Binance API 加载历史 K 线数据
 * 包含数据缓存、多时间框架支持
 */

import { OHLCV, OHLCVWithIndicators } from './types';
import { EMA, MACD, RSI, ATR, BollingerBands } from 'technicalindicators';
import * as fs from 'fs';
import * as path from 'path';

// 时间框架到毫秒的映射
const TIMEFRAME_MS: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
};

// Binance API 每次最多返回 1500 条 K 线
const BINANCE_KLINE_LIMIT = 1500;

// 缓存目录
const CACHE_DIR = path.join(process.cwd(), '.backtest-cache');

export interface DataLoaderConfig {
    symbol: string;
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    startDate: Date;
    endDate: Date;
    useCache?: boolean;
    cacheDir?: string;
    apiBaseUrl?: string;
}

export interface LoadedData {
    symbol: string;
    timeframe: string;
    startDate: Date;
    endDate: Date;
    data: OHLCVWithIndicators[];
    loadTime: number;
    fromCache: boolean;
}

/**
 * 历史数据加载器类
 */
export class DataLoader {
    private config: DataLoaderConfig;
    private proxyDispatcher: any = null;

    constructor(config: DataLoaderConfig) {
        this.config = {
            useCache: true,
            cacheDir: CACHE_DIR,
            apiBaseUrl: process.env.BINANCE_LIVE_BASE_URL || 'https://fapi.binance.com',
            ...config
        };
    }

    /**
     * 加载历史数据
     */
    async load(): Promise<LoadedData> {
        const startTime = Date.now();
        const { symbol, timeframe, startDate, endDate, useCache, cacheDir } = this.config;

        console.log(`📊 加载历史数据: ${symbol} ${timeframe}`);
        console.log(`   时间范围: ${startDate.toISOString()} - ${endDate.toISOString()}`);

        // 尝试从缓存加载
        if (useCache) {
            const cachedData = this.loadFromCache();
            if (cachedData) {
                console.log(`✅ 从缓存加载 ${cachedData.length} 条数据`);
                const withIndicators = this.calculateIndicators(cachedData);
                return {
                    symbol,
                    timeframe,
                    startDate,
                    endDate,
                    data: withIndicators,
                    loadTime: Date.now() - startTime,
                    fromCache: true
                };
            }
        }

        // 从 API 加载
        const rawData = await this.fetchFromBinance();
        console.log(`📥 从 Binance 获取 ${rawData.length} 条 K 线`);

        // 保存到缓存
        if (useCache && rawData.length > 0) {
            this.saveToCache(rawData);
        }

        // 计算技术指标
        const withIndicators = this.calculateIndicators(rawData);

        return {
            symbol,
            timeframe,
            startDate,
            endDate,
            data: withIndicators,
            loadTime: Date.now() - startTime,
            fromCache: false
        };
    }

    /**
     * 从 Binance API 获取数据
     */
    private async fetchFromBinance(): Promise<OHLCV[]> {
        const { symbol, timeframe, startDate, endDate, apiBaseUrl } = this.config;
        const binanceSymbol = symbol.replace('/', '');
        const intervalMs = TIMEFRAME_MS[timeframe];

        const allKlines: OHLCV[] = [];
        let currentStart = startDate.getTime();
        const endTs = endDate.getTime();

        // 初始化代理
        await this.initProxy();

        while (currentStart < endTs) {
            const url = `${apiBaseUrl}/fapi/v1/klines?symbol=${binanceSymbol}&interval=${timeframe}&startTime=${currentStart}&limit=${BINANCE_KLINE_LIMIT}`;

            try {
                const response = await this.fetchWithRetry(url, 3);
                const data = await response.json();

                if (!Array.isArray(data) || data.length === 0) {
                    break;
                }

                for (const kline of data) {
                    const timestamp = Number(kline[0]);
                    if (timestamp >= endTs) break;

                    allKlines.push({
                        timestamp,
                        open: Number(kline[1]),
                        high: Number(kline[2]),
                        low: Number(kline[3]),
                        close: Number(kline[4]),
                        volume: Number(kline[5])
                    });
                }

                // 更新下一次请求的起始时间
                const lastTimestamp = Number(data[data.length - 1][0]);
                currentStart = lastTimestamp + intervalMs;

                // 避免请求过快
                await this.sleep(200);

                // 显示进度
                const progress = ((currentStart - startDate.getTime()) / (endTs - startDate.getTime()) * 100).toFixed(1);
                process.stdout.write(`\r   加载进度: ${progress}%`);

            } catch (error: any) {
                console.error(`\n❌ API 请求失败: ${error.message}`);
                throw error;
            }
        }

        console.log(''); // 换行
        return allKlines;
    }

    /**
     * 初始化代理
     */
    private async initProxy(): Promise<void> {
        const proxyUrl = process.env.BINANCE_HTTP_PROXY || process.env.HTTP_PROXY;
        if (!proxyUrl) return;

        try {
            const undici = await import('undici');
            if (undici.ProxyAgent) {
                this.proxyDispatcher = new undici.ProxyAgent(proxyUrl);
                console.log(`🌐 使用代理: ${proxyUrl}`);
            }
        } catch {
            // undici 不可用
        }
    }

    /**
     * 带代理的 fetch (带重试)
     */
    private async fetchWithRetry(url: string, retries: number = 3): Promise<Response> {
        let lastError: any;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const options: any = {
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                };

                if (this.proxyDispatcher) {
                    options.dispatcher = this.proxyDispatcher;
                }

                const response = await fetch(url, options);
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response;
            } catch (error: any) {
                lastError = error;
                if (attempt < retries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.log(`\n   ⚠️ 请求失败 (${attempt}/${retries}), ${delay}ms 后重试...`);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 计算技术指标
     */
    private calculateIndicators(data: OHLCV[]): OHLCVWithIndicators[] {
        if (data.length < 50) {
            return data.map(d => ({ ...d }));
        }

        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);

        // EMA
        const ema20 = EMA.calculate({ values: closes, period: 20 });
        const ema50 = EMA.calculate({ values: closes, period: 50 });

        // RSI
        const rsi14 = RSI.calculate({ values: closes, period: 14 });

        // MACD
        const macdResult = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });

        // ATR
        const atr14 = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

        // Bollinger Bands
        const bb = BollingerBands.calculate({
            values: closes,
            period: 20,
            stdDev: 2
        });

        // 合并指标到数据
        const result: OHLCVWithIndicators[] = data.map((candle, i) => {
            const ema20Offset = closes.length - ema20.length;
            const ema50Offset = closes.length - ema50.length;
            const rsiOffset = closes.length - rsi14.length;
            const macdOffset = closes.length - macdResult.length;
            const atrOffset = closes.length - atr14.length;
            const bbOffset = closes.length - bb.length;

            return {
                ...candle,
                ema20: i >= ema20Offset ? ema20[i - ema20Offset] : undefined,
                ema50: i >= ema50Offset ? ema50[i - ema50Offset] : undefined,
                rsi14: i >= rsiOffset ? rsi14[i - rsiOffset] : undefined,
                macd: i >= macdOffset ? macdResult[i - macdOffset]?.MACD : undefined,
                macdSignal: i >= macdOffset ? macdResult[i - macdOffset]?.signal : undefined,
                macdHistogram: i >= macdOffset ? macdResult[i - macdOffset]?.histogram : undefined,
                atr14: i >= atrOffset ? atr14[i - atrOffset] : undefined,
                bbUpper: i >= bbOffset ? bb[i - bbOffset]?.upper : undefined,
                bbMiddle: i >= bbOffset ? bb[i - bbOffset]?.middle : undefined,
                bbLower: i >= bbOffset ? bb[i - bbOffset]?.lower : undefined
            };
        });

        return result;
    }

    /**
     * 生成缓存文件路径
     */
    private getCachePath(): string {
        const { symbol, timeframe, startDate, endDate, cacheDir } = this.config;
        const fileName = `${symbol.replace('/', '_')}_${timeframe}_${startDate.getTime()}_${endDate.getTime()}.json`;
        return path.join(cacheDir!, fileName);
    }

    /**
     * 从缓存加载
     */
    private loadFromCache(): OHLCV[] | null {
        const cachePath = this.getCachePath();

        try {
            if (fs.existsSync(cachePath)) {
                const data = fs.readFileSync(cachePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn(`⚠️ 缓存读取失败: ${error}`);
        }

        return null;
    }

    /**
     * 保存到缓存
     */
    private saveToCache(data: OHLCV[]): void {
        const { cacheDir } = this.config;
        const cachePath = this.getCachePath();

        try {
            if (!fs.existsSync(cacheDir!)) {
                fs.mkdirSync(cacheDir!, { recursive: true });
            }
            fs.writeFileSync(cachePath, JSON.stringify(data));
            console.log(`💾 数据已缓存: ${cachePath}`);
        } catch (error) {
            console.warn(`⚠️ 缓存写入失败: ${error}`);
        }
    }

    /**
     * 清理缓存
     */
    static clearCache(cacheDir: string = CACHE_DIR): void {
        try {
            if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(cacheDir, file));
                }
                console.log(`🗑️ 已清理 ${files.length} 个缓存文件`);
            }
        } catch (error) {
            console.error(`❌ 清理缓存失败: ${error}`);
        }
    }

    /**
     * 获取缓存统计
     */
    static getCacheStats(cacheDir: string = CACHE_DIR): { files: number; size: number } {
        try {
            if (!fs.existsSync(cacheDir)) {
                return { files: 0, size: 0 };
            }
            const files = fs.readdirSync(cacheDir);
            let totalSize = 0;
            for (const file of files) {
                const stats = fs.statSync(path.join(cacheDir, file));
                totalSize += stats.size;
            }
            return { files: files.length, size: totalSize };
        } catch {
            return { files: 0, size: 0 };
        }
    }
}

/**
 * 快捷函数：加载多个交易对的数据
 */
export async function loadMultipleSymbols(
    symbols: string[],
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    startDate: Date,
    endDate: Date
): Promise<Map<string, OHLCVWithIndicators[]>> {
    const result = new Map<string, OHLCVWithIndicators[]>();

    for (const symbol of symbols) {
        const loader = new DataLoader({
            symbol,
            timeframe,
            startDate,
            endDate
        });

        const loaded = await loader.load();
        result.set(symbol, loaded.data);
    }

    return result;
}

/**
 * 数据验证器
 */
export function validateData(data: OHLCV[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (data.length === 0) {
        errors.push('数据为空');
        return { valid: false, errors };
    }

    // 检查时间戳是否递增
    for (let i = 1; i < data.length; i++) {
        if (data[i].timestamp <= data[i - 1].timestamp) {
            errors.push(`时间戳不递增: index ${i}`);
        }
    }

    // 检查价格有效性
    for (let i = 0; i < data.length; i++) {
        const candle = data[i];
        if (candle.high < candle.low) {
            errors.push(`高低价异常: index ${i}, high=${candle.high}, low=${candle.low}`);
        }
        if (candle.open < candle.low || candle.open > candle.high) {
            errors.push(`开盘价异常: index ${i}`);
        }
        if (candle.close < candle.low || candle.close > candle.high) {
            errors.push(`收盘价异常: index ${i}`);
        }
        if (candle.volume < 0) {
            errors.push(`成交量为负: index ${i}`);
        }
    }

    // 检查数据连续性（允许周末/假期缺失）
    // 对于日内数据，检查是否有过大的间隙
    const avgInterval = (data[data.length - 1].timestamp - data[0].timestamp) / (data.length - 1);
    for (let i = 1; i < data.length; i++) {
        const gap = data[i].timestamp - data[i - 1].timestamp;
        if (gap > avgInterval * 5) { // 允许5倍间隔
            errors.push(`数据间隙过大: index ${i}, gap=${gap}ms`);
        }
    }

    return { valid: errors.length === 0, errors };
}
