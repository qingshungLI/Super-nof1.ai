/**
 * 多Agent讨论论坛
 * 协调3个分析Agent进行多轮讨论，检测共识与分歧
 */

import { DeepSeekAgent } from './agents/deepseek-agent';
import { GeminiAgent } from './agents/gemini-agent';
import { QwenAgent } from './agents/qwen-agent';
import { KimiAgent } from './agents/kimi-agent';
import { loadAllDocuments, loadAllPDFs } from './pdf-loader';
import {
    MarketData,
    ForumResult,
    AgentOpinion,
    FinalDecision,
    IAgent,
    AgentLesson,
    TradeDecision,
    AgentName
} from './agents/types';

/**
 * 论坛配置
 */
interface ForumConfig {
    maxRounds?: number;          // 最大讨论轮次（默认3）
    consensusThreshold?: number; // 共识阈值（默认0.66，即2/3一致）
    forumTimeout?: number;       // 整个论坛超时（默认30秒）
    enableParallel?: boolean;    // Round 1是否并行（默认true）
}

/**
 * 多Agent讨论论坛
 */
export class AgentForum {
    private deepseek: DeepSeekAgent;
    private gemini: GeminiAgent;
    private qwen: QwenAgent;
    private kimi: KimiAgent;
    private config: Required<ForumConfig>;

    constructor(config?: ForumConfig) {
        // 从环境变量读取API Keys
        const deepseekKey = process.env.DEEPSEEK_API_KEY || '';
        const geminiKey = process.env.GOOGLE_API_KEY || '';
        const qwenKey = process.env.QWEN_API_KEY || '';
        const kimiKey = process.env.KIMI_API_KEY || '';

        if (!deepseekKey || !geminiKey || !qwenKey || !kimiKey) {
            console.warn('⚠️ 部分API Key未配置，某些Agent可能无法工作');
        }

        this.deepseek = new DeepSeekAgent(deepseekKey);
        this.gemini = new GeminiAgent(geminiKey);
        this.qwen = new QwenAgent(qwenKey);
        this.kimi = new KimiAgent(kimiKey);

        this.config = {
            maxRounds: config?.maxRounds || 3,
            consensusThreshold: config?.consensusThreshold || 0.66,
            forumTimeout: config?.forumTimeout || 30000,
            enableParallel: config?.enableParallel !== false
        };
    }

    /**
     * 启动完整的讨论流程
     */
    async conductDiscussion(marketData: MarketData): Promise<FinalDecision> {
        const startTime = Date.now();
        console.log('\n🎯 ========== 多Agent讨论开始 ==========');

        try {
            // 1. 加载文档 (HTML + TXT)
            console.log('📄 加载分析文档...');
            const pdfDocs = await loadAllDocuments();

            // 2. 加载各Agent的历史教训
            console.log('📚 加载历史教训...');
            const [deepseekLessons, geminiLessons, qwenLessons] = await Promise.all([
                this.deepseek['loadHistoryLessons'](),
                this.gemini['loadHistoryLessons'](),
                this.qwen['loadHistoryLessons']()
            ]);

            console.log(`   - DeepSeek: ${deepseekLessons.length}条教训`);
            console.log(`   - Gemini: ${geminiLessons.length}条教训`);
            console.log(`   - Qwen: ${qwenLessons.length}条教训`);

            // 3. 进行多轮讨论
            const forumResult = await this.runForumDiscussion(
                marketData,
                pdfDocs,
                {
                    deepseek: deepseekLessons,
                    gemini: geminiLessons,
                    qwen: qwenLessons
                }
            );

            console.log(`\n📊 讨论汇总:`);
            console.log(`   - 总轮次: ${forumResult.rounds.length}`);
            console.log(`   - 达成共识: ${forumResult.consensus.reached ? '是' : '否'}`);
            console.log(`   - 一致程度: ${(forumResult.consensus.agreementRate * 100).toFixed(1)}%`);
            console.log(`   - 总耗时: ${forumResult.totalDuration}ms`);

            // 4. Kimi做最终决策
            console.log('\n🧠 Kimi决策者开始裁定...');
            let finalDecision: FinalDecision;
            try {
                finalDecision = await this.kimi.makeDecision(forumResult, marketData, pdfDocs);
            } catch (error: any) {
                console.error(`⚠️ [Forum] Kimi 决策失败: ${error.message}. 使用兜底投票机制/回退逻辑.`);
                // 使用 Kimi 内部的 fallbackDecision 生成兜底结果
                if (typeof (this.kimi as any).fallbackDecision === 'function') {
                    finalDecision = (this.kimi as any).fallbackDecision(forumResult, marketData, pdfDocs);
                } else {
                    // 兜底：票数表决
                    const votes = forumResult.rounds[0].reduce((acc, op) => {
                        acc[op.decision] = (acc[op.decision] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>);
                    const majorityDecision = (Object.keys(votes) as TradeDecision[]).reduce((a, b) =>
                        votes[a] > votes[b] ? a : b
                    );

                    // 从市场数据提取价格用于设置止损止盈
                    const currentPrice = marketData.current_price || 100000;
                    const tradeParams = majorityDecision !== 'Hold' ? {
                        symbol: 'BTC',
                        amount: 0.001,
                        leverage: 5,
                        stopLoss: majorityDecision === 'Buy'
                            ? Math.round(currentPrice * 0.97)
                            : Math.round(currentPrice * 1.03),
                        takeProfit: majorityDecision === 'Buy'
                            ? Math.round(currentPrice * 1.05)
                            : Math.round(currentPrice * 0.95)
                    } : undefined;

                    finalDecision = {
                        decision: majorityDecision,
                        confidence: 30,
                        reasoning: 'Kimi 决策失败，使用投票/回退决策。基于多数Agent意见做出保守决策。',
                        tradeParams,
                        basedOn: { forumResult, marketData, pdfInsights: '回退：Kimi失败' },
                        timestamp: new Date()
                    };
                }
            }

            const totalTime = Date.now() - startTime;
            console.log(`\n✅ 最终决策: ${finalDecision.decision} (信心 ${finalDecision.confidence}%)`);
            console.log(`📝 推理: ${(finalDecision.reasoning || '无推理内容').substring(0, 200)}...`);
            console.log(`⏱️  总耗时: ${totalTime}ms`);
            console.log('🎯 ========== 讨论结束 ==========\n');

            return finalDecision;
        } catch (error: any) {
            console.error('❌ 讨论过程失败:', error.message);
            throw error;
        }
    }

    /**
     * 运行论坛讨论（多轮）
     */
    private async runForumDiscussion(
        marketData: MarketData,
        pdfDocs: any,
        lessons: Record<string, AgentLesson[]>
    ): Promise<ForumResult> {
        const startTime = Date.now();
        const allRounds: AgentOpinion[][] = [];

        // Round 1: 独立分析（可并行）
        console.log('\n🔄 Round 1: 独立分析阶段');
        const round1 = await this.runRound1(marketData, pdfDocs, lessons);
        allRounds.push(round1);

        // 检查共识
        let consensus = this.checkConsensus(round1);
        console.log(`   共识情况: ${consensus.reached ? '已达成' : '未达成'} (${(consensus.agreementRate * 100).toFixed(1)}%)`);

        // Round 2+: 讨论与回应（串行）
        let currentRound = 2;
        while (currentRound <= this.config.maxRounds && !consensus.reached) {
            console.log(`\n🔄 Round ${currentRound}: 讨论回应阶段`);
            const previousRound = allRounds[allRounds.length - 1];
            const nextRound = await this.runSubsequentRound(previousRound, marketData, currentRound);
            allRounds.push(nextRound);

            consensus = this.checkConsensus(nextRound);
            console.log(`   共识情况: ${consensus.reached ? '已达成' : '未达成'} (${(consensus.agreementRate * 100).toFixed(1)}%)`);

            currentRound++;
        }

        return {
            rounds: allRounds,
            consensus,
            totalDuration: Date.now() - startTime
        };
    }

    /**
     * Round 1: 并行执行独立分析
     */
    private async runRound1(
        marketData: MarketData,
        pdfDocs: any,
        lessons: Record<string, AgentLesson[]>
    ): Promise<AgentOpinion[]> {
        if (this.config.enableParallel) {
            // 并行执行
            const results = await Promise.allSettled([
                this.deepseek.analyzeMarket(marketData, pdfDocs, lessons.deepseek),
                this.gemini.analyzeMarket(marketData, pdfDocs, lessons.gemini),
                this.qwen.analyzeMarket(marketData, pdfDocs, lessons.qwen)
            ]);
            let failCount = 0;
            const opinions = results.map((result, idx) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    failCount++;
                    const agentName = ['DeepSeek', 'Gemini', 'Qwen'][idx];
                    console.error(`   ${agentName} 失败: ${result.reason?.message || result.reason}`);
                    return this.getFallbackOpinion(agentName as any, 1);
                }
            });

            if (failCount > 0) {
                console.warn(`⚠️ Round1: ${failCount} agent(s) failed. Continuing with fallbacks.`);
            }

            return opinions;
        } else {
            // 串行执行（兜底）
            const opinions: AgentOpinion[] = [];
            for (const [agent, agentLessons] of [
                [this.deepseek, lessons.deepseek],
                [this.gemini, lessons.gemini],
                [this.qwen, lessons.qwen]
            ] as [IAgent, AgentLesson[]][]) {
                try {
                    const opinion = await agent.analyzeMarket(marketData, pdfDocs, agentLessons);
                    opinions.push(opinion);
                } catch (error: any) {
                    console.error(`   ${agent.name} 失败:`, error.message);
                    opinions.push(this.getFallbackOpinion(agent.name, 1));
                }
            }
            return opinions;
        }
    }

    /**
     * Round 2+: 串行回应其他Agent的观点
     */
    private async runSubsequentRound(
        previousRound: AgentOpinion[],
        marketData: MarketData,
        roundNumber: number
    ): Promise<AgentOpinion[]> {
        const opinions: AgentOpinion[] = [];

        for (const agent of [this.deepseek, this.gemini, this.qwen]) {
            try {
                const myPrevious = previousRound.find(op => op.agentName === agent.name);
                const others = previousRound.filter(op => op.agentName !== agent.name);

                if (!myPrevious) {
                    console.warn(`   ${agent.name} 缺少前一轮意见，跳过`);
                    opinions.push(this.getFallbackOpinion(agent.name, roundNumber));
                    continue;
                }

                const opinion = await agent.respondToOpinions(myPrevious, others, marketData);
                opinions.push(opinion);
            } catch (error: any) {
                console.error(`   ${agent.name} 回应失败:`, error.message);
                opinions.push(this.getFallbackOpinion(agent.name, roundNumber));
            }
        }

        return opinions;
    }

    /**
     * 检查是否达成共识
     */
    private checkConsensus(opinions: AgentOpinion[]): {
        reached: boolean;
        decision: TradeDecision | null;
        agreementRate: number;
        divergentAgents?: AgentName[];
    } {
        const decisions = opinions.map(op => op.decision);
        const decisionCounts = decisions.reduce((acc, d) => {
            acc[d] = (acc[d] || 0) + 1;
            return acc;
        }, {} as Record<TradeDecision, number>);

        const majorityDecision = (Object.keys(decisionCounts) as TradeDecision[]).reduce((a, b) =>
            decisionCounts[a] > decisionCounts[b] ? a : b
        );

        const majorityCount = decisionCounts[majorityDecision];
        const agreementRate = majorityCount / opinions.length;
        const reached = agreementRate >= this.config.consensusThreshold;

        const divergentAgents = opinions
            .filter(op => op.decision !== majorityDecision)
            .map(op => op.agentName as AgentName);

        return {
            reached,
            decision: majorityDecision,
            agreementRate,
            divergentAgents: divergentAgents.length > 0 ? divergentAgents : undefined
        };
    }

    /**
     * 获取兜底意见（Agent失败时）
     */
    private getFallbackOpinion(agentName: any, round: number): AgentOpinion {
        return {
            agentName,
            role: 'tech-analyst', // 默认角色
            round,
            timestamp: new Date(),
            decision: 'Hold',
            confidence: 0,
            reasoning: `${agentName} Agent 失败或超时`,
            keyPoints: ['未响应'],
            risks: ['Agent故障']
        };
    }
}
