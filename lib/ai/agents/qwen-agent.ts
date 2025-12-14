/**
 * Qwen Agent - 市场情绪分析专家
 * 专注于社交媒体情绪、KOL观点、恐慌贪婪指数分析
 */

import { BaseAgent } from './base-agent';
import {
    AgentOpinion,
    AgentLesson,
    MarketData,
    PDFDocuments
} from './types';

export class QwenAgent extends BaseAgent {
    constructor(apiKey: string) {
        super({
            name: 'Qwen',
            role: 'sentiment-analyst',
            apiKey,
            model: 'qwen3-max',
            timeout: Number(process.env.QWEN_TIMEOUT || process.env.AGENT_TIMEOUT || 18000) // 18秒默认超时
        });
    }

    async analyzeMarket(
        marketData: MarketData,
        pdfDocs: PDFDocuments,
        historyLessons: AgentLesson[]
    ): Promise<AgentOpinion> {
        const startTime = Date.now();
        try {
            const systemPrompt = this.buildSystemPrompt('sentiment-analyst');
            const lessonsPrompt = this.formatLessonsForPrompt(historyLessons);

            // 提取多币种数据
            const additionalCoins = (marketData as any).additional_coins || [];
            const coinsDataStr = additionalCoins.length > 0
                ? additionalCoins.map((c: any) =>
                    `- ${c.symbol}: 价格 $${c.price?.toLocaleString() || 'N/A'}, 24h变化 ${c.change_24h?.toFixed(2) || 'N/A'}%`
                ).join('\n')
                : `- ${marketData.symbol || 'BTC/USDT'}: 价格 $${marketData.current_price?.toLocaleString() || 'N/A'}`;

            // 严格限制 Prompt 长度，避免超过 Qwen API 6MB 限制
            const maxPdfLength = 1200; // 每个PDF最多1200字符
            const maxMarketDataLength = 2000; // 市场数据最多2000字符

            const marketDataStr = JSON.stringify(marketData, null, 2);
            const truncatedMarketData = marketDataStr.length > maxMarketDataLength
                ? marketDataStr.substring(0, maxMarketDataLength) + '\n...(已截断)'
                : marketDataStr;

            const userPrompt = `${systemPrompt}

## 历史教训
${lessonsPrompt}

## 📊 分析目标：5个加密货币
${coinsDataStr}

## 市场数据摘要
${truncatedMarketData}

## 情绪面分析要点 (TXT文档)
${pdfDocs.moodAnalysis.substring(0, maxPdfLength)}...

## 基本面参考 (HTML文档)
${pdfDocs.marketAnalysis.substring(0, 600)}...

**你是加密货币市场情绪分析专家，请对上述5个币种进行情绪分析，并选择情绪面最有利的一个币种给出具体建议。**

要求：
1. 对每个币种进行简要情绪评估（社交媒体热度、KOL观点、恐慌贪婪指数）
2. 选择情绪面最有利的币种
3. 给出交易决策和信心度
4. 详细推理过程

**从情绪面角度分析，给出JSON格式建议：**
\`\`\`json
{
  "decision": "Buy/Sell/Hold",
  "confidence": 75,
  "symbol": "最佳币种如 SOL/USDT",
  "reasoning": "详细推理，包含对各币种的情绪分析...",
  "keyPoints": ["观点1", "观点2", ...],
  "risks": ["风险1", "风险2", ...]
}
\`\`\``;

            const response = await this.callQwenAPI(userPrompt);
            const parsed = this.parseResponse(response);

            console.log(`✅ [${this.name}] Round 1 完成 (${Date.now() - startTime}ms)`);
            return {
                agentName: this.name,
                role: this.role,
                round: 1,
                timestamp: new Date(),
                ...parsed
            };
        } catch (error: any) {
            console.error(`❌ [${this.name}] 分析失败:`, error.message);
            return this.getFallbackOpinion(1);
        }
    }

    async respondToOpinions(
        myPreviousOpinion: AgentOpinion,
        othersOpinions: AgentOpinion[],
        marketData: MarketData
    ): Promise<AgentOpinion> {
        const round = myPreviousOpinion.round + 1;
        try {
            const othersSummary = othersOpinions
                .map(op => `${op.agentName}: ${op.decision} - ${op.reasoning.substring(0, 300)}`)
                .join('\n\n');

            const prompt = `我的观点: ${myPreviousOpinion.decision} (${myPreviousOpinion.confidence}%)

其他分析师:
${othersSummary}

从盈利和风险角度，我需要调整观点吗？JSON格式回复。`;

            const response = await this.callQwenAPI(prompt);
            const parsed = this.parseResponse(response);

            console.log(`✅ [${this.name}] Round ${round} 完成`);
            return {
                agentName: this.name,
                role: this.role,
                round,
                timestamp: new Date(),
                ...parsed
            };
        } catch (error: any) {
            console.error(`❌ [${this.name}] Round ${round} 失败`);
            return this.getFallbackOpinion(round);
        }
    }

    private async callQwenAPI(prompt: string): Promise<string> {
        const response = await this.withRetries(
            () => fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    input: {
                        messages: [{ role: 'user', content: prompt }]
                    },
                    parameters: {
                        result_format: 'message', // 使用 message 格式
                        temperature: 0.4,
                        max_tokens: 2000
                    }
                })
            })
            , 1, this.timeout, 500); // 只重试1次，延迟500ms

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Qwen API error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        // Qwen API 返回格式: data.output.choices[0].message.content
        return data.output?.choices?.[0]?.message?.content || data.output?.text || '';
    }

    private parseResponse(response: string): any {
        try {
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/{[\s\S]*}/);
            return jsonMatch ? JSON.parse(jsonMatch[0].replace(/```json|```/g, '')) : this.manualParse(response);
        } catch {
            return this.manualParse(response);
        }
    }

    private manualParse(text: string): any {
        return {
            decision: this.parseDecision(text),
            confidence: this.parseConfidence(text),
            reasoning: text.substring(0, 1000),
            keyPoints: ['解析失败'],
            risks: ['响应格式问题']
        };
    }

    private getFallbackOpinion(round: number): AgentOpinion {
        return {
            agentName: this.name,
            role: this.role,
            round,
            timestamp: new Date(),
            decision: 'Hold',
            confidence: 0,
            reasoning: 'Qwen Agent 超时或失败',
            keyPoints: ['未响应'],
            risks: ['Agent故障']
        };
    }
}
