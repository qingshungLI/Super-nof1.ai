/**
 * Gemini Agent - 基本面分析专家
 * 专注于项目基本面、链上数据、行业趋势分析
 */

import { BaseAgent } from './base-agent';
import { ProxyAgent } from 'undici';
import {
    AgentOpinion,
    AgentLesson,
    MarketData,
    PDFDocuments
} from './types';

// 创建全局代理实例 (如果配置了HTTP_PROXY)
const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

if (proxyAgent) {
    console.log(`[Gemini] 使用代理: ${proxyUrl}`);
}

export class GeminiAgent extends BaseAgent {
    constructor(apiKey: string) {
        super({
            name: 'Gemini',
            role: 'fundamental-analyst',
            apiKey,
            model: process.env.GEMINI_MODEL || 'gemini-2.0-flash', // 使用更快的模型
            timeout: Number(process.env.GEMINI_TIMEOUT || process.env.AGENT_TIMEOUT || 30000) // 30秒超时
        });
    }

    async analyzeMarket(
        marketData: MarketData,
        pdfDocs: PDFDocuments,
        historyLessons: AgentLesson[]
    ): Promise<AgentOpinion> {
        // 实现与DeepSeek类似，但System Prompt聚焦基本面
        const startTime = Date.now();
        try {
            const response = await this.callGeminiAPI(marketData, pdfDocs, historyLessons, 1);
            console.log(`✅ [${this.name}] Round 1 完成 (${Date.now() - startTime}ms)`);
            return response;
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
            const response = await this.callGeminiAPIWithContext(
                myPreviousOpinion,
                othersOpinions,
                marketData,
                round
            );
            console.log(`✅ [${this.name}] Round ${round} 完成`);
            return response;
        } catch (error: any) {
            console.error(`❌ [${this.name}] Round ${round} 失败:`, error.message);
            return this.getFallbackOpinion(round);
        }
    }

    private async callGeminiAPI(
        marketData: MarketData,
        pdfDocs: PDFDocuments,
        lessons: AgentLesson[],
        round: number
    ): Promise<AgentOpinion> {
        const systemPrompt = this.buildSystemPrompt('fundamental-analyst');
        const lessonsPrompt = this.formatLessonsForPrompt(lessons);

        // 提取多币种数据
        const additionalCoins = (marketData as any).additional_coins || [];
        const coinsDataStr = additionalCoins.length > 0
            ? additionalCoins.map((c: any) =>
                `- ${c.symbol}: 价格 $${c.price?.toLocaleString() || 'N/A'}, 24h变化 ${c.change_24h?.toFixed(2) || 'N/A'}%, 市值 $${(c.market_cap / 1e9)?.toFixed(2) || 'N/A'}B`
            ).join('\n')
            : `- ${marketData.symbol || 'BTC/USDT'}: 价格 $${marketData.current_price?.toLocaleString() || 'N/A'}`;

        // 严格限制 Prompt 长度
        const maxMarketDataLength = 2000;
        const marketDataStr = JSON.stringify(marketData, null, 2);
        const truncatedMarketData = marketDataStr.length > maxMarketDataLength
            ? marketDataStr.substring(0, maxMarketDataLength) + '\n...(已截断)'
            : marketDataStr;

        const prompt = `${systemPrompt}

## 历史教训
${lessonsPrompt}

## 📊 分析目标：5个加密货币
${coinsDataStr}

## 市场数据摘要
${truncatedMarketData}

## 基本面分析要点 (HTML文档)
${pdfDocs.marketAnalysis.substring(0, 1200)}...

## 情绪面参考 (TXT文档)
${pdfDocs.moodAnalysis.substring(0, 600)}...

**你是加密货币基本面分析专家，请对上述5个币种进行基本面分析，并选择最有投资价值的一个币种给出具体建议。**

要求：
1. 对每个币种进行简要基本面评估（项目进展、生态发展、链上活跃度）
2. 选择最佳交易机会的币种
3. 给出交易决策和信心度
4. 详细推理过程

**从基本面角度分析，给出JSON格式建议：**
\`\`\`json
{
  "decision": "Buy/Sell/Hold",
  "confidence": 75,
  "symbol": "最佳币种如 ETH/USDT",
  "reasoning": "详细推理，包含对各币种的基本面分析...",
  "keyPoints": ["观点1", "观点2", ...],
  "risks": ["风险1", "风险2", ...]
}
\`\`\``;

        const response = await this.withRetries(
            () => {
                const fetchOptions: any = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
                    })
                };
                // undici fetch 的 dispatcher 参数 (代理支持)
                if (proxyAgent) {
                    fetchOptions.dispatcher = proxyAgent;
                }
                return fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
                    fetchOptions
                );
            }
            , 1, this.timeout, 500); // 减少重试次数

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 500)}`);
        }

        const data = await response.json();

        // 安全的响应解析 - 处理 MAX_TOKENS 等异常情况
        const candidate = data.candidates?.[0];
        const finishReason = candidate?.finishReason;

        // 检查是否有有效内容
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
            // 处理 MAX_TOKENS 或其他无内容情况
            if (finishReason === 'MAX_TOKENS') {
                console.warn(`⚠️ [${this.name}] API 返回 MAX_TOKENS，使用保守观点`);
                return this.getFallbackOpinion(round, 'MAX_TOKENS: 响应被截断，使用保守判断');
            }
            console.error('Gemini API 返回格式异常:', JSON.stringify(data, null, 2).substring(0, 500));
            return this.getFallbackOpinion(round, `API返回异常: ${finishReason || '未知原因'}`);
        }

        return this.parseGeminiResponse(text, round);
    }

    private async callGeminiAPIWithContext(
        myPrevious: AgentOpinion,
        others: AgentOpinion[],
        marketData: MarketData,
        round: number
    ): Promise<AgentOpinion> {
        const othersSummary = others
            .map(op => `${op.agentName}: ${op.decision} (${op.confidence}%) - ${this.safeSubstring(op.reasoning, 300)}`)
            .join('\n');

        const prompt = `我的前一轮观点: ${myPrevious.decision} (${myPrevious.confidence}%)
推理: ${myPrevious.reasoning}

其他分析师观点:
${othersSummary}

从盈利和风险角度，我是否需要调整观点？给出JSON格式回复。`;

        const response = await this.withRetries(
            () => {
                const fetchOptions: any = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                };
                if (proxyAgent) {
                    fetchOptions.dispatcher = proxyAgent;
                }
                return fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
                    fetchOptions
                );
            }
            , 2, this.timeout, 1000);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 500)}`);
        }

        const data = await response.json();

        // 安全的响应解析 - 处理 MAX_TOKENS 等异常情况
        const candidate = data.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
            if (finishReason === 'MAX_TOKENS') {
                console.warn(`⚠️ [${this.name}] Round ${round} API 返回 MAX_TOKENS`);
                return this.getFallbackOpinion(round, 'MAX_TOKENS: 响应被截断');
            }
            return this.getFallbackOpinion(round, `API返回异常: ${finishReason || '未知'}`);
        }

        return this.parseGeminiResponse(text, round);
    }

    private parseGeminiResponse(text: string, round: number): AgentOpinion {
        try {
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/{[\s\S]*}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0].replace(/```json|```/g, '')) : {};

            return {
                agentName: this.name,
                role: this.role,
                round,
                timestamp: new Date(),
                decision: parsed.decision || this.parseDecision(text),
                confidence: parsed.confidence || this.parseConfidence(text),
                reasoning: parsed.reasoning || text.substring(0, 1000),
                keyPoints: parsed.keyPoints || ['解析部分成功'],
                risks: parsed.risks || ['格式解析问题']
            };
        } catch {
            return this.getFallbackOpinion(round);
        }
    }

    private getFallbackOpinion(round: number, reason?: string): AgentOpinion {
        return {
            agentName: this.name,
            role: this.role,
            round,
            timestamp: new Date(),
            decision: 'Hold',
            confidence: 0,
            reasoning: reason || 'Gemini Agent 超时或失败',
            keyPoints: ['未响应'],
            risks: ['Agent故障']
        };
    }
}
