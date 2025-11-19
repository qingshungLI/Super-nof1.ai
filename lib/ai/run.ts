import { generateObject } from "ai";
import { generateUserPrompt, getTradingPrompt } from "./prompt";
import { getCurrentMarketState } from "../trading/current-market-state";
import { z } from "zod";
import { deepseekR1, deepseek, deepseekv31 } from "./model";
import { getAccountInformationAndPerformance } from "../trading/account-information-and-performance";
import { prisma } from "../prisma";
import { Opeartion, Symbol } from "@prisma/client";
import { buy } from "../trading/buy";
import { sell } from "../trading/sell";
import {
  getRiskConfig,
  checkBuyRisk,
  checkDailyLossLimit,
  logTrade,
} from "../trading/risk-control";
import { setStopLossTakeProfit } from "../trading/stop-loss-take-profit-official";

/**
 * you can interval trading using cron job
 */
export async function run(initialCapital?: number) {
  const riskConfig = getRiskConfig();

  // 改进的模式标识
  const modeLabel = riskConfig.tradingMode === 'live'
    ? '⚠️ LIVE (REAL MONEY)'
    : '🎮 VIRTUAL';
  console.log(`🤖 Mode: ${modeLabel}`);


  const effectiveInitialCapital = initialCapital;

  // Helper function to create trading data with prediction
  const createTradingData = (decision: any, overrides: any = {}) => ({
    symbol: decision.symbol,
    opeartion: decision.opeartion,
    pricing: overrides.pricing || decision.buy?.pricing || decision.pricing || null,
    amount: overrides.amount || decision.buy?.amount || decision.amount || null,
    leverage: decision.buy?.leverage || decision.leverage || null,
    prediction: decision.prediction ? JSON.parse(JSON.stringify(decision.prediction)) : null,
    ...overrides,
  } as any); // Type assertion to work around Prisma type cache issues

  // Define supported cryptocurrencies for analysis and trading
  const supportedSymbols = [
    "BTC/USDT",
    "ETH/USDT",
    "SOL/USDT",
    "BNB/USDT",
    "DOGE/USDT"
  ];

  try {
    // Fetch market state for all supported cryptocurrencies
    const marketStates = await Promise.all(
      supportedSymbols.map(async (symbol) => {
        try {
          const state = await getCurrentMarketState(symbol);
          return { symbol, state };
        } catch (error) {
          console.warn(`⚠️ ${symbol}: fetch failed`);
          return null;
        }
      })
    );

    // Filter out failed requests
    const validMarketStates = marketStates.filter(item => item !== null);
    console.log(`📊 Analyzed ${validMarketStates.length}/${supportedSymbols.length} symbols`);

    const accountInformationAndPerformance =
      await getAccountInformationAndPerformance(effectiveInitialCapital);

    // Generate comprehensive prompt with all market data (now async to include learning feedback)
    const userPrompt = await generateUserPrompt({
      marketStates: validMarketStates,
      accountInformationAndPerformance,
      startTime: new Date(),
    });

    // Generate trading prompt with supported symbols (now supports multi-symbol decisions)
    const supportedSymbolEnums = [Symbol.BTC, Symbol.ETH, Symbol.SOL, Symbol.BNB, Symbol.DOGE];
    const tradingPrompt = getTradingPrompt(supportedSymbolEnums);

    // AI调用超时和多模型回退机制
    let object, reasoning;
    let aiCallSuccess = false;
    const maxRetries = 3;

    // Use Chat-only model (deepseek) — avoid R1/v3.1 timeouts and errors
    const currentModel = { name: "Chat", model: deepseek, timeout: 120000 };  // Increased to 120s
    try {
      const startTime = Date.now();
      console.log(`🤖 AI ${currentModel.name} (1/1)...`);

      const aiCallConfig: any = {
        model: currentModel.model,
        system: tradingPrompt,
        prompt: userPrompt,
        output: "object",
        experimental_telemetry: {
          isEnabled: true,
          functionId: "trading-decision",
        },
        schema: (() => {
          const decisionSchema = z.object({
            opeartion: z.nativeEnum(Opeartion),
            symbol: z.nativeEnum(Symbol).describe("The cryptocurrency symbol to trade (without USDT suffix)"),
            buy: z
              .object({
                pricing: z.number().describe("The pricing of you want to buy in."),
                amount: z.number(),
                leverage: z.number().min(1).max(30),
                stopLossPercent: z.number().optional(),
                takeProfitPercent: z.number().optional(),
              })
              .optional()
              .describe("If opeartion is buy, generate object"),
            sell: z
              .object({
                percentage: z
                  .number()
                  .min(0)
                  .max(100)
                  .describe("Percentage of position to sell"),
              })
              .optional()
              .describe("If opeartion is sell, generate object"),
            adjustProfit: z
              .object({
                stopLoss: z.number().optional(),
                takeProfit: z.number().optional(),
              })
              .optional()
              .describe("If opeartion is hold and you want to adjust the profit, generate object"),
            prediction: z.object({
              short_term_trend: z.enum(["bullish", "bearish", "neutral"]).describe("Short-term trend prediction (1-4 hours)"),
              confidence: z.enum(["high", "medium", "low"]).describe("Prediction confidence level"),
              key_levels: z.object({
                support: z.number().describe("Key support level"),
                resistance: z.number().describe("Key resistance level"),
              }),
              analysis: z.string().describe("Brief analysis based on candlestick patterns (30–50 characters)"),
            }).describe("MANDATORY: Trend prediction analysis based on candlestick (K-line) data"),
            chat: z.string().describe("Reasoning and analysis for this decision"),
          });
          return z.object({
            decisions: z.array(decisionSchema).min(1).max(5),
          });
        })()
      };

      // For native DeepSeek add mode=json
      aiCallConfig.mode = "json";

      
      const aiCallPromise = generateObject(aiCallConfig);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`AI call timeout after ${currentModel.timeout / 1000}s`)), currentModel.timeout);
      });

      const result = await Promise.race([aiCallPromise, timeoutPromise]) as {
        object: any;
        reasoning?: any;
        experimental_providerMetadata?: any;
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Response: ${duration}ms`);
      object = result.object;

      if (result.reasoning) {
        reasoning = typeof result.reasoning === 'string' ? result.reasoning : JSON.stringify(result.reasoning);
      } else if (result.experimental_providerMetadata?.deepseek?.reasoning) {
        reasoning = result.experimental_providerMetadata.deepseek.reasoning;
      } else if (object?.reasoning) {
        reasoning = typeof object.reasoning === 'string' ? object.reasoning : JSON.stringify(object.reasoning);
      } else {
        reasoning = object?.decisions?.map((d: any) => `[${d.symbol}] ${d.chat}`).join('\n') || "";
      }

      aiCallSuccess = true;
    } catch (error: any) {
      console.error(`❌ AI ${currentModel.name} failed:`, error?.message || error);
      throw new Error(`AI failed: ${error?.message || error}`);
    }

    if (!aiCallSuccess || !object) {
      throw new Error("AI failed to generate valid response");
    }

    // Backward compatibility
    let decisions: any[] = [];
    if (Array.isArray(object?.decisions)) {
      decisions = object.decisions;
    } else if (object && object.opeartion && object.symbol) {
      decisions = [object];
    } else {
      throw new Error("AI response missing 'decisions' array");
    }

    console.log(`📋 ${decisions.length} decision(s)`);

    // Check daily loss limit before any trade
    const totalUnrealizedPnl = accountInformationAndPerformance.positions.reduce(
      (sum, pos) => sum + (pos.unrealizedPnl || 0),
      0
    );
    const dailyLossCheck = checkDailyLossLimit({
      todayPnL: totalUnrealizedPnl,
      initialCapital: accountInformationAndPerformance.totalCashValue,
      config: riskConfig,
    });

    if (!dailyLossCheck.allowed) {
      console.error(`🚫 Daily loss limit: ${dailyLossCheck.reason}`);

      // Still record the AI decision but mark it as blocked
      await prisma.chat.create({
        data: {
          reasoning: reasoning || "<no reasoning>",
          chat: `[BLOCKED BY RISK CONTROL] ${dailyLossCheck.reason}\n\nOriginal AI decisions: ${JSON.stringify(decisions).slice(0, 1000)}`,
          userPrompt,
          tradings: {
            create: decisions.map((d: any) => createTradingData(d, { opeartion: Opeartion.Hold })),
          },
        },
      });

      return;
    }
    // Track remaining available cash for multi-buy margin planning
    let remainingAvailableCash = accountInformationAndPerformance.availableCash;

    // 🔧 收集所有交易记录，最后统一保存到一条 chat
    const allTradingRecords: any[] = [];
    const allChatMessages: string[] = [];

    // Process each decision sequentially
    for (const decision of decisions) {
      const object = decision;
      console.log(`\n📌 ${object.opeartion} ${object.symbol}`);

      // 添加该币种的决策说明到消息列表
      if (object.chat) {
        allChatMessages.push(`[${object.symbol}] ${object.chat}`);
      }

      if (object.opeartion === Opeartion.Buy) {
        if (!object.buy || object.buy.pricing == null || object.buy.amount == null || object.buy.leverage == null) {
          console.warn("⚠️ Buy: missing required fields");
          // 记录失败的决策
          allTradingRecords.push(createTradingData(object, {
            opeartion: Opeartion.Hold,
            pricing: object.buy?.pricing || null,
            amount: object.buy?.amount || null,
            leverage: object.buy?.leverage || null,
          }));
          continue;
        }

        const requiredMargin = (object.buy.amount * object.buy.pricing) / object.buy.leverage;
        console.log(`  Amount: ${object.buy.amount} | Price: ${object.buy.pricing} | Lev: ${object.buy.leverage}x`);
        console.log(`  Margin: $${requiredMargin.toFixed(2)} | Available: $${remainingAvailableCash.toFixed(2)}`);

        // Per-trade risk check
        const riskCheck = checkBuyRisk({
          amount: object.buy.amount,
          price: object.buy.pricing,
          leverage: object.buy.leverage,
          currentBalance: remainingAvailableCash,
          config: riskConfig,
        });

        if (!riskCheck.allowed) {
          console.error(`🚫 Risk control: ${riskCheck.reason}`);
          allChatMessages.push(`[${object.symbol} BLOCKED] ${riskCheck.reason}`);
          allTradingRecords.push(createTradingData(object, {
            pricing: object.buy.pricing,
            amount: object.buy.amount,
            leverage: object.buy.leverage,
          }));
          continue;
        }

        if (requiredMargin > remainingAvailableCash) {
          const reason = `Insufficient remaining margin for multi-order batch: need $${requiredMargin.toFixed(2)} but have $${remainingAvailableCash.toFixed(2)}`;
          console.warn(`🚫 ${reason}`);
          allChatMessages.push(`[${object.symbol} BLOCKED] ${reason}`);
          allTradingRecords.push(createTradingData(object, { opeartion: Opeartion.Hold }));
          continue;
        }

        // Execute or simulate buy
        let buyResult;
        const tradingSymbol = `${object.symbol}/USDT`;

        // 🔧 修复：dry-run模式下也要真正执行买入（在测试网）
        console.log(`💰 Executing buy ${object.symbol} (Mode: ${riskConfig.tradingMode})...`);
        buyResult = await buy({
          symbol: tradingSymbol,
          amount: object.buy.amount,
          leverage: object.buy.leverage,
          stopLossPercent: object.buy.stopLossPercent,
          takeProfitPercent: object.buy.takeProfitPercent,
        });

        if (buyResult.success) {
          console.log(`✅ Buy executed successfully`);
          console.log(`   Order ID: ${buyResult.orderId}`);
          console.log(`   Price: $${buyResult.executedPrice}`);
          console.log(`   Amount: ${buyResult.executedAmount}`);
        } else {
          console.error(`❌ Buy failed: ${buyResult.error}`);
        }

        logTrade({
          action: riskConfig.tradingMode === "live" ? "buy" : "dry-run-buy",
          symbol: tradingSymbol,
          amount: object.buy.amount,
          price: buyResult.executedPrice,
          leverage: object.buy.leverage,
          orderId: buyResult.orderId,
          reason: buyResult.success ? "Success" : buyResult.error,
        });

        if (buyResult?.success) {
          remainingAvailableCash -= requiredMargin; // deduct committed margin
        }

        // 🔧 收集交易记录，不立即保存
        allTradingRecords.push(createTradingData(object, {
          pricing: buyResult.executedPrice || object.buy.pricing,
          amount: buyResult.executedAmount || object.buy.amount,
          leverage: object.buy.leverage,
        }));
        continue;
      }

      if (object.opeartion === Opeartion.Sell) {
        if (!object.sell || object.sell.percentage == null) {
          console.warn("⚠️ Sell: missing percentage");
          // 记录失败的决策
          allTradingRecords.push(createTradingData(object, { opeartion: Opeartion.Hold }));
          continue;
        }

        // Execute or simulate sell
        let sellResult;
        const tradingSymbol = `${object.symbol}/USDT`;

        // 🔧 在卖出前先获取持仓信息，以便记录 leverage 和当前持仓数量
        let positionInfo = null;
        try {
          const { fetchPositions } = await import("@/lib/trading/positions");
          const positions = await fetchPositions();
          const binanceSymbol = tradingSymbol.replace("/", "");
          positionInfo = positions.find((p: any) => p.symbol === binanceSymbol && p.contracts !== 0);
          if (positionInfo) {
            console.log(`📊 Current position: ${Math.abs(positionInfo.contracts)} contracts @ ${positionInfo.leverage}x leverage`);
          }
        } catch (err) {
          console.warn("⚠️ Failed to fetch position info before sell:", err);
        }

        // 🔧 修复：dry-run模式下也要真正执行卖出（在测试网）
        console.log(`💸 Executing sell ${object.symbol} (${object.sell.percentage}%) (Mode: ${riskConfig.tradingMode})...`);
        sellResult = await sell({
          symbol: tradingSymbol,
          percentage: object.sell.percentage,
        });

        if (sellResult.success) {
          console.log(`✅ Sell executed successfully`);
          console.log(`   Order ID: ${sellResult.orderId}`);
          console.log(`   Price: $${sellResult.executedPrice}`);
          console.log(`   Amount: ${sellResult.executedAmount}`);
        } else {
          console.error(`❌ Sell failed: ${sellResult.error}`);
          if (sellResult.error?.includes("No open position")) {
            console.warn(`⚠️ Position already closed or doesn't exist`);
          }
        }

        logTrade({
          action: riskConfig.tradingMode === "live" ? "sell" : "dry-run-sell",
          symbol: tradingSymbol,
          amount: sellResult.executedAmount || 0,
          price: sellResult.executedPrice,
          orderId: sellResult.orderId,
          reason: sellResult.success ? "Success" : sellResult.error,
        });

        // 🔧 收集交易记录，不立即保存
        allTradingRecords.push(createTradingData(object, {
          pricing: sellResult.executedPrice,
          amount: sellResult.executedAmount || 0,
          leverage: positionInfo?.leverage || null, // 🔧 从持仓信息中获取杠杆
        }));
        continue;
      }

      if (object.opeartion === Opeartion.Hold) {
        const shouldAdjustProfit =
          object.adjustProfit != null &&
          (object.adjustProfit.stopLoss != null ||
            object.adjustProfit.takeProfit != null);

        if (shouldAdjustProfit) {
          // Set stop-loss and take-profit orders
          console.log(`🎯 Setting SL/TP for ${object.symbol} (Mode: ${riskConfig.tradingMode})...`);
          const tradingSymbol = `${object.symbol}/USDT`;
          const slTpResult = await setStopLossTakeProfit({
            symbol: tradingSymbol,
            stopLoss: object.adjustProfit!.stopLoss,
            takeProfit: object.adjustProfit!.takeProfit,
          });

          if (slTpResult.success) {
            console.log(`✅ SL/TP set successfully`);
            if (slTpResult.stopLossOrderId) {
              console.log(`   Stop Loss Order ID: ${slTpResult.stopLossOrderId}`);
            }
            if (slTpResult.takeProfitOrderId) {
              console.log(`   Take Profit Order ID: ${slTpResult.takeProfitOrderId}`);
            }
          } else {
            console.error(`❌ Failed to set SL/TP: ${slTpResult.error}`);
          }
        }

        // 🔧 收集 Hold 决策记录
        allTradingRecords.push(createTradingData(object, {
          stopLoss: object.adjustProfit?.stopLoss || null,
          takeProfit: object.adjustProfit?.takeProfit || null,
        }));
        continue;
      }
    }

    // 🔧 循环结束后，统一创建一条 chat 记录，包含所有交易
    const combinedChat = allChatMessages.length > 0
      ? allChatMessages.join("\n\n")
      : "<no chat>";

    await prisma.chat.create({
      data: {
        reasoning: reasoning || "<no reasoning>",
        chat: combinedChat,
        userPrompt,
        tradings: {
          create: allTradingRecords,
        },
      },
    });

    console.log(`✅ Saved ${allTradingRecords.length} trading decision(s) to database`);

  } catch (error) {
    console.error("❌ Trading error:", error);
    throw error;
  }
}
