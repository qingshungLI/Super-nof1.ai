import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPositions } from "@/lib/trading/positions";

export const GET = async () => {
    try {
        // 获取最新的 AI 决策聊天（最近 10 条）- 单 Agent 系统
        const recentChats = await prisma.chat.findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
            include: {
                tradings: true,
            },
        });

        // 获取最新的多 Agent 决策（最近 10 条）
        const recentTradingDecisions = await prisma.tradingDecision.findMany({
            take: 10,
            orderBy: { timestamp: "desc" },
            include: {
                relatedTrades: true,
            },
        });

        // 转换多 Agent 决策为 Chat 格式，以便前端统一展示
        const multiAgentChats = recentTradingDecisions.map((decision) => {
            const finalDecision = decision.finalDecision as any;
            const techAnalysis = decision.techAnalysis as any;
            const fundamentalAnalysis = decision.fundamentalAnalysis as any;
            const sentimentAnalysis = decision.sentimentAnalysis as any;

            // 构建综合分析内容
            const chatContent = `## 🎯 最终决策: ${finalDecision?.decision || 'Hold'} (信心 ${finalDecision?.confidence || 0}%)

### 📊 技术分析 (DeepSeek)
${techAnalysis?.rounds?.[0]?.reasoning?.substring(0, 300) || '无数据'}...

### 📈 基本面分析 (Gemini)  
${fundamentalAnalysis?.rounds?.[0]?.reasoning?.substring(0, 300) || '无数据'}...

### 💭 情绪分析 (Qwen)
${sentimentAnalysis?.rounds?.[0]?.reasoning?.substring(0, 300) || '无数据'}...

---
**分析币种:** ${finalDecision?.analyzed_coins || 'N/A'} 个
**共识达成:** ${finalDecision?.consensus?.reached ? '是' : '否'} (${((finalDecision?.consensus?.agreementRate || 0) * 100).toFixed(0)}%)
**总耗时:** ${finalDecision?.totalDuration || 'N/A'}ms`;

            // 构建虚拟交易记录
            const tradings = [];
            if (finalDecision?.tradeParams) {
                tradings.push({
                    id: `${decision.id}-trade`,
                    symbol: finalDecision.tradeParams.symbol || 'BTC',
                    opeartion: finalDecision.decision || 'Hold',
                    leverage: finalDecision.tradeParams.leverage || null,
                    amount: finalDecision.tradeParams.amount || null,
                    pricing: finalDecision.tradeParams.stopLoss ?
                        (finalDecision.tradeParams.stopLoss + finalDecision.tradeParams.takeProfit) / 2 : null,
                    stopLoss: finalDecision.tradeParams.stopLoss || null,
                    takeProfit: finalDecision.tradeParams.takeProfit || null,
                    prediction: null,
                    createdAt: decision.timestamp.toISOString(),
                });
            }

            return {
                id: decision.id,
                model: "Multi-Agent (4 LLMs)",
                chat: chatContent,
                reasoning: finalDecision?.reasoning || '无推理数据',
                userPrompt: `多Agent协商分析系统自动生成`,
                tradings,
                createdAt: decision.timestamp.toISOString(),
                isMultiAgent: true,
            };
        });

        // 合并两种类型的 chat，按时间排序
        const allChats = [
            ...recentChats.map((chat) => ({
                id: chat.id,
                model: chat.model,
                chat: chat.chat,
                reasoning: chat.reasoning,
                userPrompt: chat.userPrompt,
                tradings: chat.tradings,
                createdAt: chat.createdAt.toISOString(),
                isMultiAgent: false,
            })),
            ...multiAgentChats,
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 15); // 最多返回15条

        // 获取当前真实持仓
        let activePositions: any[] = [];
        try {
            activePositions = await fetchPositions();
        } catch (positionError) {
            console.error("Failed to fetch positions (non-critical):", positionError);
            activePositions = [];
        }

        return NextResponse.json({
            success: true,
            data: {
                chats: allChats,
                positions: activePositions,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Failed to fetch activity:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
};