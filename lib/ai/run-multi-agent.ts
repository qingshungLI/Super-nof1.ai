/**
 * 多Agent交易系统主入口
 * 集成AgentForum替代单一LLM决策
 */

import { AgentForum } from './forum';
import { getCurrentMarketState } from '../trading/current-market-state';
import { getAccountInformationAndPerformance } from '../trading/account-information-and-performance';
import { buy } from '../trading/buy';
import { sell } from '../trading/sell';
import { getRiskConfig, checkBuyRisk, logTrade } from '../trading/risk-control';
import { setStopLossTakeProfit } from '../trading/stop-loss-take-profit-official';
import { prisma } from '../prisma';
import { Symbol, Opeartion } from '@prisma/client';
import { conductPostTradeAnalysis } from './post-trade-analysis';
import { MarketData } from './agents/types';
import { pushAgentDecision, pushTradeExecuted } from '../websocket/socket-server';

/**
 * 主交易循环（多Agent版本）
 */
export async function runMultiAgent(initialCapital?: number) {
    const runId = Date.now();
    console.log(`\n🚀 [RUN ${runId}] 多Agent交易系统启动...`);

    const riskConfig = getRiskConfig();
    const modeLabel = riskConfig.tradingMode === 'live' ? '⚠️ LIVE (REAL MONEY)' : '🎮 VIRTUAL';
    console.log(`🤖 [RUN ${runId}] Mode: ${modeLabel}`);

    try {
        // 1. 获取所有币种的市场数据
        const supportedSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'DOGE/USDT'];
        console.log(`📊 获取市场数据: ${supportedSymbols.join(', ')}`);

        const marketStates = await Promise.allSettled(
            supportedSymbols.map(symbol => getCurrentMarketState(symbol))
        );

        // 收集所有成功获取的市场数据
        const successfulMarkets: Array<{ symbol: string; data: MarketData }> = [];

        for (let i = 0; i < marketStates.length; i++) {
            if (marketStates[i].status === 'fulfilled') {
                successfulMarkets.push({
                    symbol: supportedSymbols[i],
                    data: (marketStates[i] as any).value
                });
                console.log(`✅ ${supportedSymbols[i]}: 数据获取成功`);
            } else {
                console.log(`❌ ${supportedSymbols[i]}: ${(marketStates[i] as any).reason?.message}`);
            }
        }

        if (successfulMarkets.length === 0) {
            throw new Error('无法获取任何市场数据');
        }

        console.log(`\n🎯 本轮将讨论 ${successfulMarkets.length} 个币种`);

        // 2. 获取账户信息
        const accountInfo = await getAccountInformationAndPerformance(initialCapital);
        console.log(`💰 当前余额: ${accountInfo.availableCash} USDT`);

        // 3. 为每个币种启动多Agent讨论
        const forum = new AgentForum({
            maxRounds: parseInt(process.env.MAX_FORUM_ROUNDS || '3'),
            consensusThreshold: parseFloat(process.env.CONSENSUS_THRESHOLD || '0.66'),
            forumTimeout: parseInt(process.env.FORUM_TIMEOUT || '30000'),
            enableParallel: true
        });

        // 合并所有币种的市场数据用于整体讨论
        const combinedMarketData: MarketData = {
            ...successfulMarkets[0].data,
            // 添加其他币种的核心信息到描述中
            additional_coins: successfulMarkets.map(m => ({
                symbol: m.symbol,
                price: m.data.current_price,
                change_24h: m.data.price_change_percentage_24h,
                volume: m.data.total_volume,
                market_cap: m.data.market_cap
            }))
        } as any;

        const finalDecision = await forum.conductDiscussion(combinedMarketData);

        // 4. 保存完整的决策记录到数据库（包含所有Agent讨论细节）
        const forumResult = finalDecision.basedOn.forumResult;

        // 提取每个Agent在所有轮次中的完整观点
        const deepseekOpinions = forumResult.rounds.map(r =>
            r.find(op => op.agentName === 'DeepSeek')
        ).filter(Boolean);

        const geminiOpinions = forumResult.rounds.map(r =>
            r.find(op => op.agentName === 'Gemini')
        ).filter(Boolean);

        const qwenOpinions = forumResult.rounds.map(r =>
            r.find(op => op.agentName === 'Qwen')
        ).filter(Boolean);

        const tradingDecisionRecord = await prisma.tradingDecision.create({
            data: {
                marketSnapshot: combinedMarketData as any,
                pdfSummaries: {
                    market: '多币种综合基本面分析PDF',
                    mood: '市场整体情绪分析PDF'
                },
                // 保存每个Agent的完整讨论记录（所有轮次）
                techAnalysis: {
                    rounds: deepseekOpinions,
                    summary: `${deepseekOpinions.length}轮技术分析讨论`
                } as any,
                fundamentalAnalysis: {
                    rounds: geminiOpinions,
                    summary: `${geminiOpinions.length}轮基本面分析讨论`
                } as any,
                sentimentAnalysis: {
                    rounds: qwenOpinions,
                    summary: `${qwenOpinions.length}轮情绪分析讨论`
                } as any,
                // 保存Kimi的最终决策和完整推理
                finalDecision: {
                    decision: finalDecision.decision,
                    confidence: finalDecision.confidence,
                    reasoning: finalDecision.reasoning,
                    tradeParams: finalDecision.tradeParams,
                    consensus: forumResult.consensus,
                    totalDuration: forumResult.totalDuration,
                    analyzed_coins: successfulMarkets.length
                } as any
            }
        });

        console.log(`💾 决策记录已保存: ${tradingDecisionRecord.id}`);
        console.log(`   - 分析币种: ${successfulMarkets.map(m => m.symbol).join(', ')}`);
        console.log(`   - DeepSeek: ${deepseekOpinions.length}轮观点`);
        console.log(`   - Gemini: ${geminiOpinions.length}轮观点`);
        console.log(`   - Qwen: ${qwenOpinions.length}轮观点`);

        // 🔔 WebSocket 实时推送 Agent 决策
        try {
            pushAgentDecision({
                id: tradingDecisionRecord.id,
                decision: finalDecision.decision,
                confidence: finalDecision.confidence,
                reasoning: typeof finalDecision.reasoning === 'string'
                    ? finalDecision.reasoning
                    : JSON.stringify(finalDecision.reasoning || ''),
                agents: [
                    ...deepseekOpinions.map((op: any) => ({
                        name: 'DeepSeek',
                        decision: op?.decision || 'Hold',
                        confidence: op?.confidence || 0
                    })),
                    ...geminiOpinions.map((op: any) => ({
                        name: 'Gemini',
                        decision: op?.decision || 'Hold',
                        confidence: op?.confidence || 0
                    })),
                    ...qwenOpinions.map((op: any) => ({
                        name: 'Qwen',
                        decision: op?.decision || 'Hold',
                        confidence: op?.confidence || 0
                    }))
                ],
                timestamp: Date.now()
            });
        } catch (wsError) {
            console.warn('⚠️ WebSocket agent decision push failed:', wsError);
        }

        // 5. 执行交易决策
        const decision = finalDecision.decision;
        const normalizedDecision = (decision || '').toString().toLowerCase();
        console.log(`\n🎯 最终决策: ${decision} (信心 ${finalDecision.confidence}%)`);

        if (normalizedDecision === 'hold') {
            console.log('⏸️  保持观望，不执行交易');
            return;
        }

        // 检查是否有交易参数
        if (!finalDecision.tradeParams) {
            console.log('⚠️ 决策为Buy/Sell但缺少交易参数，改为Hold');
            return;
        }

        const { symbol, amount, leverage, stopLoss, takeProfit } = finalDecision.tradeParams;

        // 从symbol字符串查找对应的市场数据
        const targetMarket = successfulMarkets.find(m =>
            m.symbol === symbol || mapSymbolToEnum(m.symbol) === mapSymbolToEnum(symbol)
        );

        if (!targetMarket) {
            console.log(`⚠️ 无法找到目标币种 ${symbol} 的市场数据`);
            return;
        }

        console.log(`📍 目标币种: ${targetMarket.symbol}`);

        // 风险检查
        if (normalizedDecision === 'buy') {
            const currentPrice = targetMarket.data.current_price;

            // 确保满足 Binance 最小名义价值要求 (100 USDT)
            const MIN_NOTIONAL = 100; // USDT
            let adjustedAmount = amount || 0.001;
            let adjustedLeverage = leverage || 10;

            const notionalValue = adjustedAmount * currentPrice * adjustedLeverage;

            if (notionalValue < MIN_NOTIONAL) {
                // 优先增加杠杆（最高30x）
                const requiredLeverage = Math.ceil(MIN_NOTIONAL / (adjustedAmount * currentPrice));
                if (requiredLeverage <= 30) {
                    adjustedLeverage = requiredLeverage;
                    console.log(`📊 调整杠杆: ${leverage || 10}x → ${adjustedLeverage}x 以满足最小名义价值 $${MIN_NOTIONAL}`);
                } else {
                    // 如果杠杆不够，增加数量
                    adjustedAmount = MIN_NOTIONAL / (currentPrice * adjustedLeverage);
                    console.log(`📊 调整数量: ${amount || 0.001} → ${adjustedAmount.toFixed(6)} ${targetMarket.symbol.split('/')[0]} 以满足最小名义价值 $${MIN_NOTIONAL}`);
                }

                const newNotional = adjustedAmount * currentPrice * adjustedLeverage;
                console.log(`💰 名义价值: $${notionalValue.toFixed(2)} → $${newNotional.toFixed(2)}`);
            }

            const riskConfig = getRiskConfig();
            const riskCheck = checkBuyRisk({
                amount: adjustedAmount,
                price: currentPrice,
                leverage: adjustedLeverage,
                currentBalance: accountInfo.availableCash,
                config: riskConfig
            });

            if (!riskCheck.allowed) {
                console.log(`❌ 风险检查失败: ${riskCheck.reason}`);
                return;
            }

            console.log(`✅ 风险检查通过，执行买入...`);

            // 执行买入 - 直接使用字符串格式 symbol (e.g., 'BTC/USDT')
            const tradeResult = await buy({
                symbol: targetMarket.symbol,
                amount: adjustedAmount,
                leverage: adjustedLeverage
            });

            if (tradeResult.success && tradeResult.orderId) {
                console.log(`✅ 买入成功: OrderID ${tradeResult.orderId}`);

                // 🔔 WebSocket 推送交易执行通知
                try {
                    pushTradeExecuted({
                        symbol: targetMarket.symbol,
                        action: 'buy',
                        amount: adjustedAmount,
                        price: currentPrice,
                        orderId: tradeResult.orderId,
                        timestamp: Date.now()
                    });
                } catch (wsError) {
                    console.warn('⚠️ WebSocket trade push failed:', wsError);
                }

                // 设置止损止盈
                if (stopLoss || takeProfit) {
                    try {
                        await setStopLossTakeProfit({
                            symbol: targetMarket.symbol,
                            stopLoss,
                            takeProfit
                        });
                        console.log(`✅ 止损止盈已设置`);
                    } catch (error) {
                        console.error(`⚠️ 止损止盈设置失败:`, error);
                    }
                }

                // 记录到数据库
                await prisma.trading.create({
                    data: {
                        symbol: mapSymbolToEnum(targetMarket.symbol),
                        opeartion: Opeartion.Buy,
                        amount: adjustedAmount,
                        leverage: adjustedLeverage,
                        pricing: currentPrice,
                        stopLoss,
                        takeProfit,
                        tradingDecisionId: tradingDecisionRecord.id
                    }
                });

                logTrade({
                    symbol: targetMarket.symbol,
                    action: 'buy',
                    amount: adjustedAmount,
                    price: currentPrice,
                    leverage: adjustedLeverage,
                    reason: (finalDecision.reasoning || '').substring(0, 200)
                });
            } else {
                console.error(`❌ 买入失败:`, tradeResult.error || 'Unknown error', tradeResult);
                return;
            }
        } else if (normalizedDecision === 'sell') {
            // 卖出逻辑（做空）
            console.log(`🔽 执行卖出（做空）...`);

            // 执行卖出 - 直接使用字符串格式 symbol (e.g., 'BTC/USDT')
            const tradeResult = await sell({
                symbol: targetMarket.symbol,
                amount: amount || 0.001
            });

            if (tradeResult.success) {
                console.log(`✅ 卖出成功`);

                // 🔔 WebSocket 推送交易执行通知
                try {
                    pushTradeExecuted({
                        symbol: targetMarket.symbol,
                        action: 'sell',
                        amount: amount || 0.001,
                        price: targetMarket.data.current_price,
                        orderId: tradeResult.orderId || `sell_${Date.now()}`,
                        timestamp: Date.now()
                    });
                } catch (wsError) {
                    console.warn('⚠️ WebSocket trade push failed:', wsError);
                }

                await prisma.trading.create({
                    data: {
                        symbol: mapSymbolToEnum(targetMarket.symbol),
                        opeartion: Opeartion.Sell,
                        amount: amount || 0.001,
                        leverage: leverage || 10,
                        pricing: targetMarket.data.current_price,
                        stopLoss,
                        takeProfit,
                        tradingDecisionId: tradingDecisionRecord.id
                    }
                });

                logTrade({
                    symbol: targetMarket.symbol,
                    action: 'sell',
                    amount: amount || 0.001,
                    price: targetMarket.data.current_price,
                    reason: (finalDecision.reasoning || '').substring(0, 200)
                });
            } else {
                console.error(`❌ 卖出失败:`, tradeResult.error || 'Unknown error', tradeResult);
                return;
            }
        }

        console.log(`\n✅ [RUN ${runId}] 交易流程完成`);
    } catch (error: any) {
        console.error(`❌ [RUN ${runId}] 交易失败:`, error.message);
        throw error;
    }
}

/**
 * 辅助函数：Symbol字符串映射到Prisma枚举
 */
function mapSymbolToEnum(symbolStr: string): Symbol {
    const map: Record<string, Symbol> = {
        'BTC/USDT': Symbol.BTC,
        'ETH/USDT': Symbol.ETH,
        'SOL/USDT': Symbol.SOL,
        'BNB/USDT': Symbol.BNB,
        'DOGE/USDT': Symbol.DOGE
    };
    return map[symbolStr] || Symbol.BTC;
}

/**
 * 兼容性导出：保留原run函数名
 */
export { runMultiAgent as run };
