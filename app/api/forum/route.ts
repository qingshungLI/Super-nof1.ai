/**
 * API: 获取多Agent论坛讨论状态
 * 返回最新的Agent讨论记录和实时状态
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export const GET = async () => {
    try {
        // 获取最新的交易决策记录（包含Agent讨论详情）
        const recentDecisions = await prisma.tradingDecision.findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
        });

        // 格式化输出
        const formattedDecisions = recentDecisions.map((decision: any) => {
            const finalDecision = decision.finalDecision as any || {};
            const techAnalysis = decision.techAnalysis as any || {};
            const fundamentalAnalysis = decision.fundamentalAnalysis as any || {};
            const sentimentAnalysis = decision.sentimentAnalysis as any || {};

            return {
                id: decision.id,
                createdAt: decision.createdAt.toISOString(),

                // 最终决策
                finalDecision: {
                    decision: finalDecision.decision || 'Hold',
                    confidence: finalDecision.confidence || 0,
                    reasoning: finalDecision.reasoning || '',
                    tradeParams: finalDecision.tradeParams || null,
                    consensus: finalDecision.consensus || null,
                    totalDuration: finalDecision.totalDuration || 0,
                    analyzedCoins: finalDecision.analyzed_coins || 1,
                },

                // 各Agent分析
                agents: {
                    deepseek: {
                        name: 'DeepSeek',
                        role: 'tech-analyst',
                        rounds: techAnalysis.rounds || [],
                        summary: techAnalysis.summary || '',
                    },
                    gemini: {
                        name: 'Gemini',
                        role: 'fundamental-analyst',
                        rounds: fundamentalAnalysis.rounds || [],
                        summary: fundamentalAnalysis.summary || '',
                    },
                    qwen: {
                        name: 'Qwen',
                        role: 'sentiment-analyst',
                        rounds: sentimentAnalysis.rounds || [],
                        summary: sentimentAnalysis.summary || '',
                    },
                },

                // 市场快照
                marketSnapshot: decision.marketSnapshot,
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                decisions: formattedDecisions,
                count: formattedDecisions.length,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Failed to fetch forum data:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
};
