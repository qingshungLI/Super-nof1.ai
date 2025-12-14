/**
 * AI Trading Learning Feedback System
 * 
 * This module implements a reinforcement learning-style feedback mechanism
 * that helps the AI learn from its trading mistakes and successes.
 */

import { prisma } from "../prisma";
import { getAccountInformationAndPerformance } from "../trading/account-information-and-performance";

export interface TradeLesson {
    id: string;
    timestamp: Date;
    symbol: string;
    decision: string;
    reasoning: string;
    outcome: "profit" | "loss" | "pending";
    pnl: number;
    pnl_percentage: number;
    lesson_learned: string;
    market_conditions: any;
    indicators_at_entry: any;
}

export interface LearningStats {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    avg_profit: number;
    avg_loss: number;
    total_pnl: number;
    biggest_mistake: TradeLesson | null;
    recent_lessons: TradeLesson[];
}

/**
 * Analyze a closed trade and extract lessons
 */
export async function analyzeTradeOutcome(
    tradeId: string,
    finalPnl: number,
    exitReason: string
): Promise<TradeLesson | null> {
    try {
        // Fetch the original trade decision from database
        const trade = await prisma.trading.findUnique({
            where: { id: tradeId },
        });

        // Fetch associated chat for reasoning
        const chat = trade?.chatId ? await prisma.chat.findUnique({
            where: { id: trade.chatId },
        }) : null;

        if (!trade) {
            console.warn(`Trade ${tradeId} not found for lesson extraction`);
            return null;
        }

        // Fetch actual account balance instead of hardcoding
        let balance = 20; // Fallback
        try {
            const accountInfo = await getAccountInformationAndPerformance();
            balance = accountInfo.availableCash || 20;
        } catch (err) {
            console.warn("Could not fetch balance, using fallback:", err);
        }

        const pnlPercentage = (finalPnl / balance) * 100;
        const outcome: "profit" | "loss" = finalPnl >= 0 ? "profit" : "loss";

        // Extract lesson based on outcome
        let lessonLearned = "";

        if (outcome === "loss") {
            // Analyze why the trade lost money
            lessonLearned = await generateLossLesson(trade, chat, finalPnl, exitReason, balance);
        } else {
            // Analyze what worked well
            lessonLearned = await generateProfitLesson(trade, chat, finalPnl, exitReason, balance);
        }

        const lesson: TradeLesson = {
            id: trade.id,
            timestamp: trade.createdAt,
            symbol: trade.symbol,
            decision: trade.opeartion, // 🐛 BUG: This field is spelled "opeartion" in the schema
            reasoning: chat?.reasoning || "No reasoning provided",
            outcome,
            pnl: finalPnl,
            pnl_percentage: pnlPercentage,
            lesson_learned: lessonLearned,
            market_conditions: {},
            indicators_at_entry: extractIndicators(trade),
        };

        // Store lesson in database for future reference
        await storeLessonInDatabase(lesson, exitReason);
        
        console.log(`✅ Lesson recorded for trade ${tradeId}: ${outcome} ($${finalPnl.toFixed(2)})`);

        return lesson;
    } catch (error) {
        console.error("Error analyzing trade outcome:", error);
        return null;
    }
}

/**
 * Generate a lesson from a losing trade
 */
async function generateLossLesson(
    trade: any,
    chat: any,
    pnl: number,
    exitReason: string,
    balance: number
): Promise<string> {
    const lessons: string[] = [];

    // Analyze common failure patterns
    if (exitReason.includes("stop loss") || exitReason.includes("liquidation")) {
        lessons.push(
            `⚠️ CRITICAL LESSON: ${trade.symbol} position was stopped out with ${pnl.toFixed(2)} loss. ` +
            `The stop loss was triggered, indicating either: ` +
            `1) Entry timing was poor (entered too early/late), ` +
            `2) Stop loss was placed too tight for market volatility, ` +
            `3) Market structure was misread (false breakout/breakdown).`
        );
    }

    if (Math.abs(pnl) > 5) {
        lessons.push(
            `💔 MAJOR LOSS ALERT: Lost $${Math.abs(pnl).toFixed(2)} on ${trade.symbol}. ` +
            `This is a SIGNIFICANT loss that must be avoided in the future. ` +
            `Review the decision reasoning carefully: "${chat?.reasoning?.substring(0, 150) || 'No reasoning'}..." ` +
            `What indicators were misleading? What was missed in the analysis?`
        );
    }

    // Analyze leverage usage
    if (trade.leverage && trade.leverage > 15) {
        lessons.push(
            `⚡ HIGH LEVERAGE RISK: Used ${trade.leverage}x leverage on ${trade.symbol}. ` +
            `High leverage amplifies losses. Consider reducing leverage on uncertain setups.`
        );
    }

    // Default lesson if no specific pattern detected
    if (lessons.length === 0) {
        lessons.push(
            `📉 Loss on ${trade.symbol}: -$${Math.abs(pnl).toFixed(2)} (${(pnl / balance * 100).toFixed(2)}%). ` +
            `Exit reason: ${exitReason}. Review market conditions and indicators at entry.`
        );
    }

    return lessons.join("\n");
}

/**
 * Generate a lesson from a profitable trade
 */
async function generateProfitLesson(
    trade: any,
    chat: any,
    pnl: number,
    exitReason: string,
    balance: number
): Promise<string> {
    const pnlPercentage = ((pnl / balance) * 100).toFixed(2);

    return (
        `✅ SUCCESS on ${trade.symbol}: +$${pnl.toFixed(2)} (${pnlPercentage}%). ` +
        `Exit reason: ${exitReason}. ` +
        `This trade worked because: The analysis was correct, timing was good, and risk management was applied. ` +
        `Key factors: "${chat?.reasoning?.substring(0, 100) || 'No reasoning'}..." ` +
        `REPLICATE this decision-making process in similar setups.`
    );
}

/**
 * Extract key indicators from trade data
 */
function extractIndicators(trade: any): any {
    const marketData = trade.chat?.marketData;
    if (!marketData) return {};

    return {
        rsi: marketData.current_rsi,
        macd: marketData.current_macd,
        ema20: marketData.current_ema20,
        price: marketData.current_price,
        volume_ratio: marketData.longer_term?.current_volume / marketData.longer_term?.average_volume || null,
    };
}

/**
 * Store lesson in database for persistent learning
 */
async function storeLessonInDatabase(lesson: TradeLesson, exitReason: string): Promise<void> {
    try {
        await prisma.tradingLesson.create({
            data: {
                tradeId: lesson.id,
                symbol: lesson.symbol as any, // Cast to Prisma Symbol enum
                decision: lesson.decision,
                outcome: lesson.outcome,
                pnl: lesson.pnl,
                pnlPercentage: lesson.pnl_percentage,
                lessonText: lesson.lesson_learned,
                marketConditions: lesson.market_conditions as any,
                indicatorsAtEntry: lesson.indicators_at_entry as any,
                exitReason: exitReason,
            },
        });
        console.log(`💾 Lesson stored in database for trade ${lesson.id}`);
    } catch (error) {
        console.error("Error storing lesson in database:", error);
        throw error; // Re-throw to let caller know storage failed
    }
}

/**
 * Get learning statistics for the AI
 */
export async function getLearningStats(
    lookbackDays: number = 7
): Promise<LearningStats> {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const lessons = await prisma.tradingLesson.findMany({
        where: {
            createdAt: {
                gte: since,
            },
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 50,
    });

    const totalTrades = lessons.length;
    const winningTrades = lessons.filter((l: any) => l.outcome === "profit").length;
    const losingTrades = lessons.filter((l: any) => l.outcome === "loss").length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const profits = lessons.filter((l: any) => l.outcome === "profit");
    const losses = lessons.filter((l: any) => l.outcome === "loss");

    const avgProfit = profits.length > 0
        ? profits.reduce((sum: number, l: any) => sum + l.pnl, 0) / profits.length
        : 0;

    const avgLoss = losses.length > 0
        ? losses.reduce((sum: number, l: any) => sum + l.pnl, 0) / losses.length
        : 0;

    const totalPnl = lessons.reduce((sum: number, l: any) => sum + l.pnl, 0);

    // Find the biggest mistake (worst loss)
    const biggestMistake = losses.length > 0
        ? losses.reduce((worst: any, current: any) => (current.pnl < worst.pnl ? current : worst))
        : null;

    const biggestMistakeLesson = biggestMistake ? {
        id: biggestMistake.tradeId,
        timestamp: biggestMistake.createdAt,
        symbol: biggestMistake.symbol,
        decision: biggestMistake.decision,
        reasoning: "See database for full reasoning",
        outcome: biggestMistake.outcome as "loss",
        pnl: biggestMistake.pnl,
        pnl_percentage: biggestMistake.pnlPercentage,
        lesson_learned: biggestMistake.lessonText,
        market_conditions: biggestMistake.marketConditions,
        indicators_at_entry: biggestMistake.indicatorsAtEntry,
    } : null;

    // Get recent lessons (last 5)
    const recentLessons = lessons.slice(0, 5).map((l: any) => ({
        id: l.tradeId,
        timestamp: l.createdAt,
        symbol: l.symbol,
        decision: l.decision,
        reasoning: "See database",
        outcome: l.outcome as "profit" | "loss",
        pnl: l.pnl,
        pnl_percentage: l.pnlPercentage,
        lesson_learned: l.lessonText,
        market_conditions: l.marketConditions,
        indicators_at_entry: l.indicatorsAtEntry,
    }));

    return {
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        avg_profit: avgProfit,
        avg_loss: avgLoss,
        total_pnl: totalPnl,
        biggest_mistake: biggestMistakeLesson,
        recent_lessons: recentLessons,
    };
}

/**
 * Format learning feedback for AI prompt
 */
export function formatLearningFeedback(stats: LearningStats): string {
    let feedback = `## YOUR LEARNING FEEDBACK & PERFORMANCE REFLECTION

📊 RECENT PERFORMANCE STATS (Last 7 days):
- Total Trades: ${stats.total_trades}
- Winning Trades: ${stats.winning_trades} | Losing Trades: ${stats.losing_trades}
- Win Rate: ${stats.win_rate.toFixed(1)}%
- Average Profit per Win: $${stats.avg_profit.toFixed(2)}
- Average Loss per Loss: $${stats.avg_loss.toFixed(2)}
- Total PnL: $${stats.total_pnl.toFixed(2)}
- Profit Factor: ${stats.avg_loss !== 0 ? (Math.abs(stats.avg_profit / stats.avg_loss)).toFixed(2) : "N/A"}

`;

    // Add performance feedback based on stats
    if (stats.win_rate < 50) {
        feedback += `⚠️ WARNING: Your win rate is BELOW 50%. You are losing more trades than winning.
IMMEDIATE ACTION REQUIRED:
1. Be MORE SELECTIVE with entries - wait for stronger confluence
2. Review your recent losing trades below to identify patterns
3. Consider reducing position sizes until win rate improves
4. Focus on QUALITY over QUANTITY - fewer, better trades

`;
    } else if (stats.win_rate >= 60) {
        feedback += `✅ EXCELLENT: Win rate above 60%! Your analysis is working well.
Keep applying the same decision-making process that led to these wins.

`;
    }

    if (stats.total_pnl < 0) {
        feedback += `💔 CRITICAL: You are DOWN $${Math.abs(stats.total_pnl).toFixed(2)} overall.
This means your trading strategy needs ADJUSTMENT:
- Review ALL losing trades below for common patterns
- Are you holding losers too long? Cutting winners too early?
- Is your risk management (stop loss, position sizing) appropriate?
- Are you revenge trading after losses?

`;
    }

    // Add biggest mistake
    if (stats.biggest_mistake) {
        feedback += `🚨 YOUR BIGGEST MISTAKE (Learn from this!):
Symbol: ${stats.biggest_mistake.symbol}
Loss: $${Math.abs(stats.biggest_mistake.pnl).toFixed(2)} (${stats.biggest_mistake.pnl_percentage.toFixed(2)}%)
Date: ${stats.biggest_mistake.timestamp.toISOString()}
Lesson: ${stats.biggest_mistake.lesson_learned}

`;
    }

    // Add recent lessons
    if (stats.recent_lessons.length > 0) {
        feedback += `📚 RECENT LESSONS (Last ${Math.min(5, stats.recent_lessons.length)} trades):

`;
        stats.recent_lessons.forEach((lesson, idx) => {
            const emoji = lesson.outcome === "profit" ? "✅" : "❌";
            const pnlSign = lesson.pnl >= 0 ? "+" : "";
            feedback += `${idx + 1}. ${emoji} ${lesson.symbol} | ${lesson.decision} | ${pnlSign}$${lesson.pnl.toFixed(2)} (${lesson.pnl_percentage.toFixed(2)}%)
   ${lesson.lesson_learned.substring(0, 200)}${lesson.lesson_learned.length > 200 ? "..." : ""}

`;
        });
    }

    feedback += `💡 KEY TAKEAWAY:
Learn from your mistakes. Each losing trade contains valuable information.
If you see a pattern of losses in similar market conditions, ADJUST your strategy.
Your goal is CONTINUOUS IMPROVEMENT - become a better trader with each decision.

`;

    return feedback;
}

/**
 * Get dynamic risk adjustment based on recent performance
 */
export function getDynamicRiskAdjustment(stats: LearningStats): {
    leverage_multiplier: number;
    position_size_multiplier: number;
    confidence_threshold: number;
    recommendation: string;
} {
    let leverageMultiplier = 1.0;
    let positionSizeMultiplier = 1.0;
    let confidenceThreshold = 0.6; // Default 60% confidence to trade

    // Adjust based on win rate
    if (stats.win_rate < 40) {
        // Poor performance - reduce risk dramatically
        leverageMultiplier = 0.5;
        positionSizeMultiplier = 0.5;
        confidenceThreshold = 0.75; // Only take very high confidence trades
    } else if (stats.win_rate < 50) {
        // Below average - reduce risk
        leverageMultiplier = 0.7;
        positionSizeMultiplier = 0.7;
        confidenceThreshold = 0.7;
    } else if (stats.win_rate > 65) {
        // Excellent performance - can increase risk slightly
        leverageMultiplier = 1.2;
        positionSizeMultiplier = 1.1;
        confidenceThreshold = 0.55;
    }

    // Adjust based on recent PnL trend
    if (stats.total_pnl < -10) {
        // Significant losses - be very conservative
        leverageMultiplier *= 0.6;
        positionSizeMultiplier *= 0.6;
        confidenceThreshold = Math.max(confidenceThreshold, 0.75);
    }

    let recommendation = "";
    if (leverageMultiplier < 0.8) {
        recommendation = "⚠️ RISK REDUCED: Due to recent poor performance, leverage and position sizes are reduced. Focus on rebuilding confidence with smaller, high-quality trades.";
    } else if (leverageMultiplier > 1.1) {
        recommendation = "✅ RISK INCREASED: Strong recent performance allows for slightly larger positions. Continue executing quality trades.";
    } else {
        recommendation = "➡️ NORMAL RISK: Maintain standard position sizing and leverage.";
    }

    return {
        leverage_multiplier: leverageMultiplier,
        position_size_multiplier: positionSizeMultiplier,
        confidence_threshold: confidenceThreshold,
        recommendation,
    };
}