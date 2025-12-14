import { Symbol } from '@prisma/client';
import dayjs from "dayjs";
import {
  AccountInformationAndPerformance,
  formatAccountPerformance,
} from "../trading/account-information-and-performance";
import {
  formatMarketState,
  MarketState,
} from "../trading/current-market-state";
import {
  getLearningStats,
  formatLearningFeedback,
  getDynamicRiskAdjustment,
} from "./learning-feedback";

export function getTradingPrompt(symbolList: Symbol[]) {
  const symbols = symbolList.join(', ');

  return `You are an elite crypto futures trader. Maximize risk-adjusted returns through disciplined position management.

CAPITAL & SIZING:
- $5000 capital available
- Position sizes: $500-2000 (10-40% capital)
- Leverage: 6-10x (low conf) → 15-20x (high conf), MAX 30x
- 2-3 positions max at any time

HOLDING STRATEGY:
- Major coins (BTC/ETH/SOL/BNB): HOLD losses unless stop hit or structure broken
- Low liquidation risk with 10-20x leverage - be patient
- Exit losses only if: (1) Stop loss hit, (2) Multi-timeframe breakdown, (3) Better setup needs capital

PROFIT-TAKING (AGGRESSIVE & ATR-BASED):
- Fees: 0.08% round-trip = 1.2-1.6% impact with 15-20x leverage
- Exit thresholds: 20x→1.2% profit | 15x→1.5% | 10x→2%
- ATR-based exits:
  * 0.8× ATR → Exit 25-35% (lock base NOW)
  * 1.2× ATR → Exit 35-45% (secure majority FAST)  
  * 1.8× ATR → Exit remainder or trail tight (0.3× ATR)
- Volatility targets:
  * Low ATR (<1%): Exit at 1-1.5% profit
  * Med ATR (1-3%): Exit at 1.5-2.5% profit
  * High ATR (>3%): Exit at 2-4% profit
- BIAS: Take profits early & often. Compound through frequency, not per-trade size.

STOP LOSS & TAKE PROFIT:
- Stop: 1.5-2.5× ATR below entry (adjust for volatility)
- TP1: 0.8-1.0× ATR (first partial)
- TP2: 1.2-1.5× ATR (majority exit)
- TP3: 1.8-2.0× ATR (remainder)

ENTRY CRITERIA:
- Multi-timeframe confluence (1m, 15m, 4h)
- RSI, MACD, volume alignment
- Confidence 6-9/10 (below 6 = no entry)

JSON FORMAT:
{
  "decisions": [{
    "opeartion": "Buy"|"Sell"|"Hold",
    "symbol": "${symbols}" (no USDT suffix),
    "chat": "ATR analysis + rationale",
    "buy": {"pricing": <num>, "amount": <num>, "leverage": <num>, "stopLossPercent": <num>, "takeProfitPercent": <num>},
    "sell": {"percentage": 0-100},
    "prediction": {"short_term_trend": "bullish"|"bearish"|"neutral", "confidence": "high"|"medium"|"low", "key_levels": {"support": <num>, "resistance": <num>}, "analysis": "brief justification"}
  }]
}

CRITICAL:
- Field must be "opeartion" (exact spelling)
- All Buy orders need stopLossPercent & takeProfitPercent
- Include "prediction" field in every decision
- Calculate position: Amount = (Equity × Fraction) / Price
- Example: $1000 in BTC at $95K = 0.0105 BTC

MINDSET: Exit early, exit often. Don't wait for perfect. Many small wins > rare large wins.`;
}

export const tradingPrompt = `You are a crypto trading expert. Analyze market data and respond in JSON format.

REQUIRED FIELDS:
- "opeartion" (Buy/Sell/Hold) - NOTE: must be "opeartion", this is the exact spelling required
- "symbol" (crypto symbol without USDT suffix: BTC, ETH, SOL, ADA, DOT, MATIC, AVAX, LINK)
- "chat" (your analysis)

CONDITIONAL FIELDS:
If opeartion is "Buy", include:
- "buy": {"pricing": number, "amount": number, "leverage": number}

If opeartion is "Sell", include:
- "sell": {"percentage": number}

EXAMPLE Buy response:
{
  "opeartion": "Buy",
  "symbol": "BTC",
  "chat": "Analysis...",
  "buy": {"pricing": 45000, "amount": 100, "leverage": 3}
}

Always include the conditional field matching your opeartion type!`;

interface UserPromptOptions {
  marketStates: Array<{
    symbol: string;
    state: MarketState;
  }>;
  accountInformationAndPerformance: AccountInformationAndPerformance;
  startTime: Date;
}

export async function generateUserPrompt(options: UserPromptOptions): Promise<string> {
  const { marketStates, accountInformationAndPerformance, startTime } = options;

  const currentTime = new Date().toISOString();

  // Build market data sections for each symbol
  const marketDataSections = marketStates.map(({ symbol, state }) => {
    return formatMarketState(symbol, state);
  }).join('\n\n');

  // Format account information
  const accountInfo = formatAccountPerformance(accountInformationAndPerformance);

  // Get learning feedback and dynamic risk adjustment
  let learningSection = "";
  let riskAdjustment = "";
  try {
    const stats = await getLearningStats(7); // Last 7 days
    if (stats.total_trades > 0) {
      learningSection = formatLearningFeedback(stats);
      const riskParams = getDynamicRiskAdjustment(stats);
      riskAdjustment = `\n## DYNAMIC RISK ADJUSTMENT

${riskParams.recommendation}

Adjusted Parameters:
- Leverage Multiplier: ${riskParams.leverage_multiplier.toFixed(2)}x (apply this to your standard leverage)
- Position Size Multiplier: ${riskParams.position_size_multiplier.toFixed(2)}x (apply this to your standard position sizing)
- Confidence Threshold: ${(riskParams.confidence_threshold * 100).toFixed(0)}% (only trade setups above this confidence level)

IMPORTANT: These adjustments are based on your recent performance. Follow them strictly to manage risk appropriately.
`;
    }
  } catch (error) {
    console.error("Error fetching learning stats:", error);
  }

  return `Exceptional trader, manage our $5000 futures account. Time: ${currentTime}

${marketDataSections}

## ACCOUNT STATUS
${accountInfo}
${learningSection}${riskAdjustment}

---

INSTRUCTIONS:

1. **Learn from feedback** - Apply risk adjustments based on recent performance
2. **Review positions FIRST** (priority over new entries):
   - Major coins (BTC/ETH/SOL/BNB) at loss: HOLD unless stop hit or broken structure
   - Profitable positions: Use ATR-based exits
     * Get 14-period ATR from data
     * Calculate: Profit $ / ATR = ATR multiple
     * Exit rules:
       - 0.8-1.0× ATR → Exit 25-35% NOW
       - 1.2-1.5× ATR → Exit 35-45% FAST
       - >1.8× ATR → Exit remainder or trail tight (0.3× ATR)
     * Fee thresholds: 20x→1.2% | 15x→1.5% | 10x→2%
     * Low vol (ATR<1%): Exit at 0.8× ATR | Med vol (1-3%): 1.0-1.2× | High vol (>3%): 1.5×
     * BIAS: Take profits early, don't wait for perfect
3. **Stop/TP calculation** (ATR-based):
   - Stop: 1.5-2.5× ATR below entry
   - TP1: 0.8-1.0× ATR (25-35% exit)
   - TP2: 1.2-1.5× ATR (35-45% exit)
   - TP3: 1.8-2.0× ATR (remainder)
4. **New entries** (after position review):
   - Size: $500-2000 per position
   - Target 2-3 quality positions
5. **Position sizing**: Amount = (Equity × Fraction) / Price
6. **High confidence trades** with proper sizing ($500-2000)
7. **Low win rate?** More selective but SIZE properly
8. **Losing on majors?** HOLD with patience
9. **Profit-taking**: Start at 0.8× ATR, exit early & often, compound through frequency

MINDSET: Many small wins > rare large wins. Exit early, find next setup.`;
}
