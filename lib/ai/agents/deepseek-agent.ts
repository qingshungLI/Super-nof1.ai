/**
 * DeepSeek Agent - 技术分析专家
 * 专注于图表形态、技术指标、支撑阻力位分析
 */

import { BaseAgent } from './base-agent';
import {
    AgentOpinion,
    AgentLesson,
    MarketData,
    PDFDocuments,
    AgentConfig
} from './types';

export class DeepSeekAgent extends BaseAgent {
    constructor(apiKey: string) {
        super({
            name: 'DeepSeek',
            role: 'tech-analyst',
            apiKey,
            model: 'deepseek-chat',
            timeout: Number(process.env.DEEPSEEK_TIMEOUT || process.env.AGENT_TIMEOUT || 18000) // 18秒默认超时
        });
    }

    async analyzeMarket(
        marketData: MarketData,
        pdfDocs: PDFDocuments,
        historyLessons: AgentLesson[]
    ): Promise<AgentOpinion> {
        const startTime = Date.now();

        try {
            const lessonsPrompt = this.formatLessonsForPrompt(historyLessons);
            const systemPrompt = this.buildSystemPrompt('tech-analyst');

            // 提取多币种数据
            const additionalCoins = (marketData as any).additional_coins || [];
            const coinsDataStr = additionalCoins.length > 0
                ? additionalCoins.map((c: any) =>
                    `- ${c.symbol}: 价格 $${c.price?.toLocaleString() || 'N/A'}, 24h变化 ${c.change_24h?.toFixed(2) || 'N/A'}%`
                ).join('\n')
                : `- ${marketData.symbol || 'BTC/USDT'}: 价格 $${marketData.current_price?.toLocaleString() || 'N/A'}`;

            // 严格限制 Prompt 长度，避免超时
            const maxMarketDataLength = 2000;
            const marketDataStr = JSON.stringify(marketData, null, 2);
            const truncatedMarketData = marketDataStr.length > maxMarketDataLength
                ? marketDataStr.substring(0, maxMarketDataLength) + '\n...(已截断)'
                : marketDataStr;

            const userPrompt = `${systemPrompt}

## 历史教训
${lessonsPrompt}

## 📊 分析目标：5个加密货币
${coinsDataStr}

## 当前市场数据
\`\`\`json
${truncatedMarketData}
\`\`\`

## 基本面分析参考 (HTML文档)
${pdfDocs.marketAnalysis.substring(0, 800)}...

## 情绪面分析参考 (TXT文档)
${pdfDocs.moodAnalysis.substring(0, 800)}...

---

**你是加密货币技术分析专家，请对上述5个币种进行技术分析，并选择最有交易机会的一个币种给出具体建议。**

要求：
1. 对每个币种进行简要技术面评估
2. 选择最佳交易机会的币种
3. 给出交易决策（Buy/Sell/Hold）
4. 信心度（0-100%）
5. 详细推理过程（关注技术指标、图表形态、支撑阻力位）
6. 3-5个核心观点
7. 识别的风险点

请用JSON格式回复：
\`\`\`json
{
  "decision": "Buy/Sell/Hold",
  "confidence": 75,
  "symbol": "最佳币种如 BTC/USDT",
  "reasoning": "详细推理，包含对各币种的分析...",
  "keyPoints": ["观点1", "观点2", ...],
  "risks": ["风险1", "风险2", ...]
}
\`\`\``;

            const response = await this.withRetries(() => this.callDeepSeekAPI(userPrompt), 1, this.timeout, 500);
            const parsed = this.parseResponse(response);

            const opinion: AgentOpinion = {
                agentName: this.name,
                role: this.role,
                round: 1,
                timestamp: new Date(),
                decision: parsed.decision,
                confidence: parsed.confidence,
                symbol: parsed.symbol,
                reasoning: parsed.reasoning,
                keyPoints: parsed.keyPoints,
                risks: parsed.risks
            };

            console.log(`✅ [${this.name}] Round 1 完成 (${Date.now() - startTime}ms) - 推荐: ${parsed.symbol}`);
            return opinion;
        } catch (error: any) {
            console.error(`❌ [${this.name}] Round 1 失败:`, error.message);
            return this.getFallbackOpinion(1);
        }
    }

    async respondToOpinions(
        myPreviousOpinion: AgentOpinion,
        othersOpinions: AgentOpinion[],
        marketData: MarketData
    ): Promise<AgentOpinion> {
        const startTime = Date.now();
        const round = myPreviousOpinion.round + 1;

        try {
            const othersSummary = othersOpinions
                .map(
                    op =>
                        `**${op.agentName} (${op.role})**\n决策: ${op.decision} (信心 ${op.confidence}%)\n推理: ${this.safeSubstring(op.reasoning, 500)}...`
                )
                .join('\n\n');

            const userPrompt = `你在Round ${myPreviousOpinion.round}的观点：
决策: ${myPreviousOpinion.decision} (信心 ${myPreviousOpinion.confidence}%)
推理: ${myPreviousOpinion.reasoning}

---

其他分析师的观点：
${othersSummary}

---

**请阅读其他分析师的观点后，给出你的回应：**
1. 你是否同意他们的判断？
2. 他们忽略了哪些技术面信号？
3. 你是否需要调整自己的观点？
4. 提出你的质疑或补充论据

请用JSON格式回复：
\`\`\`json
{
  "decision": "Buy/Sell/Hold",
  "confidence": 75,
  "reasoning": "综合考虑后的推理...",
  "keyPoints": ["新观点1", ...],
  "risks": ["新风险1", ...],
  "responseTo": [
    {
      "agentName": "Gemini",
      "agreement": "agree/disagree/partial",
      "counterArguments": ["反驳点1", ...]
    }
  ]
}
\`\`\``;

            const response = await this.withRetries(() => this.callDeepSeekAPI(userPrompt), 2, this.timeout, 1000);
            const parsed = this.parseResponse(response);

            const opinion: AgentOpinion = {
                agentName: this.name,
                role: this.role,
                round,
                timestamp: new Date(),
                decision: parsed.decision,
                confidence: parsed.confidence,
                reasoning: parsed.reasoning,
                keyPoints: parsed.keyPoints,
                risks: parsed.risks,
                responseTo: parsed.responseTo
            };

            console.log(`✅ [${this.name}] Round ${round} 完成 (${Date.now() - startTime}ms)`);
            return opinion;
        } catch (error: any) {
            console.error(`❌ [${this.name}] Round ${round} 失败:`, error.message);
            return this.getFallbackOpinion(round);
        }
    }

    /**
     * 调用 DeepSeek API
     */
    private async callDeepSeekAPI(prompt: string): Promise<string> {
        const response = await this.withTimeout(
            fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 2000
                })
            })
        );

        if (!response.ok) {
            throw new Error(`DeepSeek API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * 解析响应
     */
    private parseResponse(response: string): any {
        try {
            // 尝试提取JSON
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]);
                return {
                    decision: parsed.decision || 'Hold',
                    confidence: parsed.confidence || 50,
                    symbol: parsed.symbol || 'BTC/USDT',
                    reasoning: parsed.reasoning || '',
                    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
                    responseTo: parsed.responseTo
                };
            }
            const parsed = JSON.parse(response);
            return {
                decision: parsed.decision || 'Hold',
                confidence: parsed.confidence || 50,
                symbol: parsed.symbol || 'BTC/USDT',
                reasoning: parsed.reasoning || '',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                risks: Array.isArray(parsed.risks) ? parsed.risks : []
            };
        } catch {
            // 容错：手动解析
            return {
                decision: this.parseDecision(response),
                confidence: this.parseConfidence(response),
                symbol: 'BTC/USDT',
                reasoning: response.substring(0, 1000),
                keyPoints: ['解析失败，使用原始回复'],
                risks: ['响应格式不正确']
            };
        }
    }

    /**
     * 获取兜底意见（超时或失败时）
     */
    private getFallbackOpinion(round: number): AgentOpinion {
        return {
            agentName: this.name,
            role: this.role,
            round,
            timestamp: new Date(),
            decision: 'Hold',
            confidence: 0,
            reasoning: `Agent超时或失败，无法提供有效分析`,
            keyPoints: ['未响应'],
            risks: ['Agent故障']
        };
    }
}
