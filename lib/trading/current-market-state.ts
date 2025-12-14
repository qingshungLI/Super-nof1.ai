import { EMA, MACD, RSI, ATR } from "technicalindicators";
import { getBinanceBaseUrl } from "./binance-official";

export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trend: "bullish" | "bearish"; // 阳线/阴线
  change_percent: number; // 涨跌幅百分比
}

export interface MarketState {
  // Current indicators
  current_price: number;
  current_ema20: number;
  current_macd: number;
  current_rsi: number;

  // Open Interest
  open_interest: {
    latest: number;
    average: number;
  };

  // Funding Rate
  funding_rate: number;

  // Intraday series (by minute)
  intraday: {
    mid_prices: number[];
    ema_20: number[];
    macd: number[];
    rsi_7: number[];
    rsi_14: number[];
  };

  // Longer-term context (4-hour timeframe)
  longer_term: {
    ema_20: number;
    ema_50: number;
    atr_3: number;
    atr_14: number;
    current_volume: number;
    average_volume: number;
    macd: number[];
    rsi_14: number[];
  };

  // K线数�?- 用于趋势预测分析
  kline_data: {
    minute_1: KlineData[]; // 最�?0�?分钟K�?
    hour_4: KlineData[];   // 最�?0�?小时K�?
    minute_15: KlineData[]; // 最�?0�?5分钟K�?
  };
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(values: number[], period: number): number[] {
  const emaValues = EMA.calculate({ values, period });
  return emaValues;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): number[] {
  const macdValues = MACD.calculate({
    values,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  return macdValues.map((v) => v.MACD || 0);
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(values: number[], period: number): number[] {
  const rsiValues = RSI.calculate({ values, period });
  return rsiValues;
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number[] {
  const atrValues = ATR.calculate({ high, low, close, period });
  return atrValues;
}

/**
 * Fetch current market state for a given coin symbol
 * @param symbol - Trading pair symbol (e.g., 'BTC/USDT')
 * @returns Market state with all technical indicators
 */
export async function getCurrentMarketState(
  symbol: string
): Promise<MarketState> {
  try {
    // Directly call Binance UM Futures REST to avoid ccxt exchangeInfo bootstrap issues
    const normalizedSymbol = symbol.includes("/") ? symbol : `${symbol}/USDT`;
    const perpSymbol = normalizedSymbol.replace("/", ""); // e.g. BTCUSDT

    // Simple retry helper for transient network errors
    const withRetry = async <T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (retries <= 0) throw err;
        await new Promise((r) => setTimeout(r, delayMs));
        return withRetry(fn, retries - 1, delayMs * 2);
      }
    };

    const defaultTimeoutMs = Number(process.env.BINANCE_FETCH_TIMEOUT_MS || 15000);

    // Optional: build undici ProxyAgent dispatcher when proxy env is present
    const resolveDispatcher = async (): Promise<any | undefined> => {
      const useProxy = String(process.env.BINANCE_DISABLE_PROXY || "").toLowerCase() !== "true";
      const proxyUrl = process.env.BINANCE_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (!useProxy || !proxyUrl) return undefined;
      try {
        const undici: any = await import("undici");
        if (undici?.ProxyAgent) {
          return new undici.ProxyAgent(proxyUrl);
        }
      } catch {
        // undici not available at runtime; continue without dispatcher
      }
      return undefined;
    };
    const dispatcher = await resolveDispatcher();

    const fetchJson = async <T>(paths: string[], timeoutMs = defaultTimeoutMs): Promise<T> => {
      // 只使用第一个URL,但进行多次重�?
      const url = paths[0];
      const maxRetries = 5; // 增加�?次重�?

      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(url, {
            next: { revalidate: 0 },
            signal: controller.signal,
            ...(dispatcher ? { dispatcher } : {}),
          } as any);

          clearTimeout(timer);

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`${res.status} ${res.statusText}: ${errorText}`);
          }

          return (await res.json()) as T;
        } catch (e) {
          clearTimeout(timer);
          lastErr = e;

          if (attempt < maxRetries) {
            // 指数退�? 1s, 2s, 4s, 8s
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.log(`⚠️ Attempt ${attempt}/${maxRetries} failed: ${errorMsg.substring(0, 100)}`);
            console.log(`   Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastErr instanceof Error ? lastErr : new Error("fetchJson failed after all retries");
    };

    // 使用环境变量配置的API地址，默认为虚拟�?
    const baseUrl = getBinanceBaseUrl();
    const baseHosts = [baseUrl];

    const fetchKlines = async (interval: string, limit = 100): Promise<number[][]> => {
      const urls = baseHosts.map(
        (host) => `${host}/fapi/v1/klines?symbol=${perpSymbol}&interval=${interval}&limit=${limit}`
      );
      const data = await fetchJson<any[]>(urls);
      // Each kline: [ openTime, open, high, low, close, volume, ... ]
      return data.map((row) => [
        Number(row[0]),
        Number(row[1]),
        Number(row[2]),
        Number(row[3]),
        Number(row[4]),
        Number(row[5]),
      ]);
    };

    const ohlcv1m = await withRetry(() => fetchKlines("1m", 100));
    const ohlcv4h = await withRetry(() => fetchKlines("4h", 100));

    // Extract price data from 1-minute candles
    const closes1m = ohlcv1m.map((candle: number[]) => Number(candle[4])); // Close prices

    // Extract price data from 4-hour candles
    const closes4h = ohlcv4h.map((candle: number[]) => Number(candle[4]));
    const highs4h = ohlcv4h.map((candle: number[]) => Number(candle[2]));
    const lows4h = ohlcv4h.map((candle: number[]) => Number(candle[3]));
    const volumes4h = ohlcv4h.map((candle: number[]) => Number(candle[5]));

    // Calculate intraday indicators (1-minute timeframe)
    const ema20_1m = calculateEMA(closes1m, 20);
    const macd_1m = calculateMACD(closes1m);
    const rsi7_1m = calculateRSI(closes1m, 7);
    const rsi14_1m = calculateRSI(closes1m, 14);

    // Calculate longer-term indicators (4-hour timeframe)
    const ema20_4h = calculateEMA(closes4h, 20);
    const ema50_4h = calculateEMA(closes4h, 50);
    const atr3_4h = calculateATR(highs4h, lows4h, closes4h, 3);
    const atr14_4h = calculateATR(highs4h, lows4h, closes4h, 14);
    const macd_4h = calculateMACD(closes4h);
    const rsi14_4h = calculateRSI(closes4h, 14);

    // Get last 10 values for intraday series
    const last10MidPrices = closes1m.slice(-10);
    const last10EMA20 = ema20_1m.slice(-10).map((v) => Number(v) || 0);
    const last10MACD = macd_1m.slice(-10).map((v) => Number(v) || 0);
    const last10RSI7 = rsi7_1m.slice(-10).map((v) => Number(v) || 0);
    const last10RSI14 = rsi14_1m.slice(-10).map((v) => Number(v) || 0);

    // Get last 10 MACD and RSI values for 4-hour timeframe
    const last10MACD4h = macd_4h.slice(-10).map((v) => Number(v) || 0);
    const last10RSI14_4h = rsi14_4h.slice(-10).map((v) => Number(v) || 0);

    // Current values (latest)
    const current_price = Number(closes1m[closes1m.length - 1]) || 0;
    const current_ema20 = Number(ema20_1m[ema20_1m.length - 1]) || 0;
    const current_macd = Number(macd_1m[macd_1m.length - 1]) || 0;
    const current_rsi = Number(rsi7_1m[rsi7_1m.length - 1]) || 0;

    // Fetch open interest and funding rate for perpetual futures
    const openInterestData = { latest: 0, average: 0 };
    let fundingRate = 0;

    try {
      // Open Interest
      const oiUrls = baseHosts.map(
        (host) => `${host}/fapi/v1/openInterest?symbol=${perpSymbol}`
      );
      const oiJson = await withRetry(() => fetchJson<{ openInterest?: string }>(oiUrls));
      const oiVal = oiJson?.openInterest ? Number(oiJson.openInterest) : 0;
      openInterestData.latest = oiVal;
      openInterestData.average = oiVal; // placeholder average

      // Funding rate (from premiumIndex)
      const frUrls = baseHosts.map(
        (host) => `${host}/fapi/v1/premiumIndex?symbol=${perpSymbol}`
      );
      const frJson = await withRetry(() => fetchJson<{ lastFundingRate?: string }>(frUrls));
      fundingRate = frJson?.lastFundingRate ? Number(frJson.lastFundingRate) : 0;
    } catch (error) {
      console.warn("Could not fetch open interest or funding rate:", error);
      // Continue with default values
    }

    // Calculate average volume for 4-hour timeframe
    const averageVolume4h =
      volumes4h.reduce((sum: number, vol: number) => sum + vol, 0) /
      volumes4h.length;
    const currentVolume4h = volumes4h[volumes4h.length - 1];

    // 构建 K 线数�?- 最�?0根用于趋势分�?
    const buildKlineData = (ohlcv: number[][], count: number = 10): KlineData[] => {
      return ohlcv.slice(-count).map((candle) => {
        const open = candle[1];
        const close = candle[4];
        const change_percent = ((close - open) / open) * 100;
        return {
          timestamp: candle[0],
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5],
          trend: close >= open ? "bullish" : "bearish",
          change_percent,
        };
      });
    };

    // 获取15分钟K线数�?
    const ohlcv15m = await withRetry(() => fetchKlines("15m", 100));

    return {
      current_price,
      current_ema20,
      current_macd,
      current_rsi,
      open_interest: openInterestData,
      funding_rate: fundingRate,
      intraday: {
        mid_prices: last10MidPrices,
        ema_20: last10EMA20,
        macd: last10MACD,
        rsi_7: last10RSI7,
        rsi_14: last10RSI14,
      },
      longer_term: {
        ema_20: Number(ema20_4h[ema20_4h.length - 1]) || 0,
        ema_50: Number(ema50_4h[ema50_4h.length - 1]) || 0,
        atr_3: Number(atr3_4h[atr3_4h.length - 1]) || 0,
        atr_14: Number(atr14_4h[atr14_4h.length - 1]) || 0,
        current_volume: currentVolume4h,
        average_volume: averageVolume4h,
        macd: last10MACD4h,
        rsi_14: last10RSI14_4h,
      },
      kline_data: {
        minute_1: buildKlineData(ohlcv1m, 10),
        hour_4: buildKlineData(ohlcv4h, 10),
        minute_15: buildKlineData(ohlcv15m, 10),
      },
    };
  } catch (error) {
    console.error("Error fetching market state:", error);
    throw error;
  }
}

/**
 * Format market state as a human-readable string (COMPACT VERSION)
 */
export function formatMarketState(symbol: string, state: MarketState): string {
  // Compact K-line format - only last 3 candles
  const formatKlinesCompact = (klines: KlineData[], label: string) => {
    const last3 = klines.slice(-3);
    const lines = last3.map((k, i) => {
      const trend = k.trend === "bullish" ? "↑" : "↓";
      return `${trend}${k.change_percent.toFixed(1)}%`;
    }).join(" ");
    return `${label}: ${lines}`;
  };

  // Only show last 5 values for arrays to reduce tokens
  const last5 = (arr: number[]) => arr.slice(-5).map(v => v.toFixed(1)).join(",");

  return `## ${symbol}
Price: $${state.current_price} | EMA20: ${state.current_ema20.toFixed(1)} | RSI: ${state.current_rsi.toFixed(0)} | MACD: ${state.current_macd.toFixed(2)}
ATR: 3p=${state.longer_term.atr_3.toFixed(2)} 14p=${state.longer_term.atr_14.toFixed(2)}
OI: ${state.open_interest.latest.toFixed(0)} | Fund: ${(state.funding_rate * 100).toFixed(4)}%
Vol: ${state.longer_term.current_volume.toFixed(0)} (avg ${state.longer_term.average_volume.toFixed(0)})
EMA: 20=${state.longer_term.ema_20.toFixed(1)} 50=${state.longer_term.ema_50.toFixed(1)}
Recent: ${formatKlinesCompact(state.kline_data.minute_1, "1m")} | ${formatKlinesCompact(state.kline_data.minute_15, "15m")} | ${formatKlinesCompact(state.kline_data.hour_4, "4h")}`.trim();
}
