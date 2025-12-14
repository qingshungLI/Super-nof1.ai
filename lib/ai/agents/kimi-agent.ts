/**
 * Kimi Agent - 最终决策者
 * 综合3位分析师的讨论，做出最终交易决定
 */

import {
    IDecisionMaker,
    AgentName,
    FinalDecision,
    ForumResult,
    MarketData,
    PDFDocuments,
    TradeDecision
} from './types';

export class KimiAgent implements IDecisionMaker {
    readonly name: AgentName = 'Kimi';
    private apiKey: string;
    private model: string = 'kimi-k2-thinking';
    private timeout: number = Number(process.env.KIMI_TIMEOUT || process.env.AGENT_TIMEOUT || 20000); // 20秒默认超时
    private maxRetries: number = 1; // 只重试1次，避免长时间阻塞

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * 安全的字符串截取（容错处理任何类型）
     */
    private safeSubstring(value: any, maxLength: number = 500): string {
        if (value === undefined || value === null) {
            return '无内容';
        }
        if (typeof value === 'string') {
            return value.substring(0, maxLength);
        }
        if (typeof value === 'object') {
            try {
                const str = JSON.stringify(value);
                return str.substring(0, maxLength);
            } catch {
                return '[对象解析失败]';
            }
        }
        return String(value).substring(0, maxLength);
    }

    async makeDecision(
        forumResult: ForumResult,
        marketData: MarketData,
        pdfDocs: PDFDocuments
    ): Promise<FinalDecision> {
        const startTime = Date.now();

        try {
            const discussionSummary = this.formatDiscussionSummary(forumResult);
            const systemPrompt = this.buildSystemPrompt();

            // 提取多币种数据
            const additionalCoins = (marketData as any).additional_coins || [];
            const coinsDataStr = additionalCoins.length > 0
                ? additionalCoins.map((c: any) =>
                    `- ${c.symbol}: 价格 $${c.price?.toLocaleString() || 'N/A'}, 24h变化 ${c.change_24h?.toFixed(2) || 'N/A'}%`
                ).join('\n')
                : `- ${marketData.symbol || 'BTC/USDT'}: 价格 $${marketData.current_price?.toLocaleString() || 'N/A'}`;

            // 严格限制 Prompt 长度
            const maxMarketDataLength = 2000;
            const marketDataStr = JSON.stringify(marketData, null, 2);
            const truncatedMarketData = marketDataStr.length > maxMarketDataLength
                ? marketDataStr.substring(0, maxMarketDataLength) + '\n...(已截断)'
                : marketDataStr;

            const userPrompt = `${systemPrompt}

## 📊 分析目标：5个加密货币
${coinsDataStr}

## 完整讨论记录
${(discussionSummary || '').substring(0, 2500)}...

## 市场数据摘要
\`\`\`json
${truncatedMarketData}
\`\`\`

## 基本面分析要点 (HTML文档)
${(pdfDocs.marketAnalysis || '无基本面分析').substring(0, 1000)}...

## 情绪面分析要点 (TXT文档)
${(pdfDocs.moodAnalysis || '无情绪面分析').substring(0, 1000)}...

---

**请综合所有信息，从5个币种中选择最佳交易机会，做出最终交易决策。**

要求：
1. 决策（Buy/Sell/Hold）
2. 选择的币种（BTC/ETH/SOL/BNB/DOGE 中最有机会的一个）
3. 信心度（0-100%）
4. 详细推理（说明你为何选择这个币种，以及为何做出此决策）
5. 如果是Buy/Sell，给出具体交易参数：
   - symbol（选择的币种）
   - amount（数量）
   - leverage（杠杆）
   - stopLoss（止损价）
   - takeProfit（止盈价）

请用JSON格式回复：
\`\`\`json
{
  "decision": "Buy/Sell/Hold",
  "confidence": 75,
  "reasoning": "综合考虑5个币种的技术面、基本面、情绪面后，选择XXX是因为...",
  "tradeParams": {
    "symbol": "BTC/USDT",
    "amount": 0.01,
    "leverage": 10,
    "stopLoss": 95000,
    "takeProfit": 105000
  }
}
\`\`\``;

            // callKimiAPI 内部已实现重试逻辑
            const responseText = await this.callKimiAPI(userPrompt);
            const parsed = this.parseResponse(responseText);

            const decision: FinalDecision = {
                decision: parsed.decision,
                confidence: parsed.confidence,
                reasoning: parsed.reasoning,
                tradeParams: parsed.tradeParams,
                basedOn: {
                    forumResult,
                    marketData,
                    pdfInsights: `基本面重点(HTML): ${(pdfDocs.marketAnalysis || '').substring(0, 200)}... / 情绪面重点(TXT): ${(pdfDocs.moodAnalysis || '').substring(0, 200)}...`
                },
                timestamp: new Date()
            };

            console.log(`✅ [${this.name}] 决策完成 (${Date.now() - startTime}ms): ${decision.decision} (${decision.confidence}%)`);
            return decision;
        } catch (error: any) {
            console.error(`❌ [${this.name}] 决策失败:`, error.message);
            return this.getFallbackDecision(forumResult, marketData, pdfDocs);
        }
    }

    private buildSystemPrompt(): string {
        return `你是**最终决策者（Kimi-k2）**，负责综合3位分析师的讨论，从5个加密货币中选择最佳交易机会。

你的职责：
1. 审查DeepSeek、Gemini、Qwen对5个币种（BTC、ETH、SOL、BNB、DOGE）的完整讨论
2. 综合各分析师推荐的币种，选择最有交易机会的一个
3. 识别分析中的逻辑漏洞、认知偏差、过度自信
4. 权衡不同维度的重要性（技术面 vs 基本面 vs 情绪面）
5. 考虑风险收益比，避免高风险低回报的交易
6. 给出明确的交易指令（包含具体币种）

原则：
- 不要盲目跟从多数意见（3个都看多不代表一定做多）
- 关注分歧点（分歧往往揭示关键风险）
- 如果各Agent推荐不同币种，选择综合评分最高的
- 保持理性，避免FOMO或恐慌情绪
- 如果信息不足或风险过高，选择Hold，但是不要频繁使用Hold`;
    }

    private formatDiscussionSummary(forumResult: ForumResult): string {
        let summary = '';

        forumResult.rounds.forEach((roundOpinions, roundIndex) => {
            summary += `\n### Round ${roundIndex + 1}\n\n`;
            roundOpinions.forEach(op => {
                summary += `**${op.agentName} (${op.role})**\n`;
                summary += `决策: ${op.decision} | 信心: ${op.confidence}%\n`;
                summary += `推理: ${this.safeSubstring(op.reasoning, 500)}...\n`;
                summary += `关键点: ${(op.keyPoints || []).join(', ')}\n`;
                summary += `风险: ${(op.risks || []).join(', ')}\n\n`;
            });
        });

        summary += `\n### 共识情况\n`;
        summary += `达成共识: ${forumResult.consensus.reached ? '是' : '否'}\n`;
        if (forumResult.consensus.decision) {
            summary += `多数决策: ${forumResult.consensus.decision}\n`;
        }
        summary += `一致程度: ${(forumResult.consensus.agreementRate * 100).toFixed(1)}%\n`;

        return summary;
    }

    private async callKimiAPI(prompt: string): Promise<string> {
        // 实现重试逻辑 - 降低重试次数避免长时间阻塞
        let lastError: any = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                // 使用 HTTP 代理（如果配置）
                const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
                const fetchOptions: RequestInit = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.5,
                        max_tokens: 3000
                    })
                };

                // 如果有代理配置，添加 agent
                if (proxyUrl && typeof global !== 'undefined') {
                    const { HttpsProxyAgent } = require('https-proxy-agent');
                    (fetchOptions as any).agent = new HttpsProxyAgent(proxyUrl);
                }

                // 创建带超时的 Promise
                const fetchPromise = fetch('https://api.moonshot.cn/v1/chat/completions', fetchOptions);

                // 带超时的 fetch
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout after ${this.timeout}ms`)), this.timeout)
                );

                const response = await Promise.race([fetchPromise, timeoutPromise]);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Kimi API error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                return data.choices[0].message.content;
            } catch (error: any) {
                lastError = error;
                if (attempt < this.maxRetries) {
                    const backoff = 500 * (attempt + 1); // 减少重试延迟
                    console.warn(`⚠️ [${this.name}] Retry attempt ${attempt + 1}/${this.maxRetries}, sleeping ${backoff}ms due to: ${error.message}`);
                    await new Promise(r => setTimeout(r, backoff));
                }
            }
        }

        throw lastError;
    }

    private parseResponse(response: string): any {
        try {
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            return JSON.parse(response);
        } catch {
            // 容错解析
            const decision = this.parseDecision(response);
            const confidence = this.parseConfidence(response);

            return {
                decision,
                confidence,
                reasoning: response.substring(0, 1500),
                tradeParams: decision !== 'Hold' ? this.estimateTradeParams(decision) : undefined
            };
        }
    }

    private parseDecision(text: string): TradeDecision {
        const lower = text.toLowerCase();
        if (lower.includes('buy') || lower.includes('做多')) return 'Buy';
        if (lower.includes('sell') || lower.includes('做空')) return 'Sell';
        return 'Hold';
    }

    private parseConfidence(text: string): number {
        const match = text.match(/(\d+)%/);
        return match ? Math.min(100, Math.max(0, parseInt(match[1]))) : 50;
    }

    private estimateTradeParams(decision: TradeDecision): any {
        // 保守的默认参数
        return {
            symbol: 'BTC',
            amount: 0.001,
            leverage: 5,
            stopLoss: decision === 'Buy' ? 95000 : 105000,
            takeProfit: decision === 'Buy' ? 105000 : 95000
        };
    }

    private getFallbackDecision(
        forumResult: ForumResult,
        marketData: MarketData,
        pdfDocs: PDFDocuments
    ): FinalDecision {
        // 如果Kimi失败，回退到投票机制
        const votes = forumResult.rounds[0].reduce((acc, op) => {
            acc[op.decision] = (acc[op.decision] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const majorityDecision = (Object.keys(votes) as TradeDecision[]).reduce((a, b) =>
            votes[a] > votes[b] ? a : b
        );

        // 从市场数据中提取当前价格用于设置止损止盈
        const currentPrice = marketData.current_price || 100000;

        // 如果决策是 Buy/Sell，生成保守的交易参数
        const tradeParams = majorityDecision !== 'Hold' ? {
            symbol: 'BTC',
            amount: 0.001, // 保守仓位
            leverage: 5,   // 低杠杆
            stopLoss: majorityDecision === 'Buy'
                ? Math.round(currentPrice * 0.97)  // 买入时止损设为-3%
                : Math.round(currentPrice * 1.03), // 卖出时止损设为+3%
            takeProfit: majorityDecision === 'Buy'
                ? Math.round(currentPrice * 1.05)  // 买入时止盈设为+5%
                : Math.round(currentPrice * 0.95)  // 卖出时止盈设为-5%
        } : undefined;

        return {
            decision: majorityDecision,
            confidence: 30, // 低信心（因为是兜底决策）
            reasoning: 'Kimi决策失败，使用投票机制兜底。基于多数Agent意见做出保守决策。',
            tradeParams,
            basedOn: {
                forumResult,
                marketData,
                pdfInsights: '决策失败，无法生成洞察'
            },
            timestamp: new Date()
        };
    }

    // External callers can use this fallback decision when Kimi fails
    public fallbackDecision(forumResult: ForumResult, marketData: MarketData, pdfDocs: PDFDocuments): FinalDecision {
        return this.getFallbackDecision(forumResult, marketData, pdfDocs);
    }
}
