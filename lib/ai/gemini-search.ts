/**
 * Gemini + Google Search 集成
 * 用于获取实时市场信息和价格分析
 */


const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-pro';

interface SearchResult {
    content: string;
    searchQueries?: string[];
    timestamp: string;
}

/**
 * 使用 Gemini 的 Google Search Grounding 功能进行搜索
 */
export async function searchWithGemini(prompt: string): Promise<SearchResult> {
    if (!GEMINI_API_KEY) {
        throw new Error('Missing GOOGLE_API_KEY environment variable');
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        tools: [{
            googleSearchRetrieval: {
                dynamicRetrievalConfig: {
                    mode: "MODE_DYNAMIC",
                    dynamicThreshold: 0.3
                }
            }
        }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192
        }
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60秒超时

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        if (!candidate) {
            throw new Error('No response from Gemini');
        }

        // 提取文本内容
        const content = candidate.content?.parts
            ?.map((part: any) => part.text)
            .filter(Boolean)
            .join('\n') || '';

        // 提取搜索元数据（如果有）
        const groundingMetadata = candidate.groundingMetadata;
        const searchQueries = groundingMetadata?.searchEntryPoint?.renderedContent;

        return {
            content,
            searchQueries: searchQueries ? [searchQueries] : undefined,
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Gemini search request timeout');
        }
        throw error;
    }
}

/**
 * 分析多个加密货币的市场情况
 */
export async function analyzeCryptoMarkets(symbols: string[]): Promise<string> {
    const symbolList = symbols.join(', ');
    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are a professional cryptocurrency market analyst. Please search for and analyze the latest market information for the following cryptocurrencies: ${symbolList}

For each cryptocurrency, provide:
1. **Current Price & 24h Change**: Latest price and percentage change
2. **Market Sentiment**: Recent news, social media trends, and overall sentiment
3. **Technical Analysis**: Key support/resistance levels, trend direction
4. **Fundamental Updates**: Major developments, partnerships, protocol upgrades
5. **Trading Volume & Liquidity**: Recent volume trends and liquidity status
6. **Price Prediction**: Short-term (1-3 days) outlook with reasoning

Please search for the most recent information (within the last 24 hours) and provide a comprehensive analysis in Chinese.

Date: ${today}
Symbols to analyze: ${symbolList}

Format the response clearly with sections for each cryptocurrency.`;

    console.log(`🔍 [Gemini Search] 开始搜索 ${symbolList} 的市场信息...`);

    const result = await searchWithGemini(prompt);

    console.log(`✅ [Gemini Search] 搜索完成，内容长度: ${result.content.length} 字符`);

    return result.content;
}

/**
 * 生成每日市场报告
 */
export async function generateDailyMarketReport(symbols: string[]): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toLocaleTimeString('zh-CN', { hour12: false });

    const analysis = await analyzeCryptoMarkets(symbols);

    // 格式化报告
    const report = `
================================================================================
                    加密货币市场每日分析报告
================================================================================

📅 报告日期: ${dateStr}
⏰ 生成时间: ${timeStr}
🪙 分析币种: ${symbols.join(', ')}

================================================================================
                            市场分析详情
================================================================================

${analysis}

================================================================================
                              报告说明
================================================================================

本报告由 Gemini AI 结合 Google Search 实时数据生成，包含最新的市场信息、
价格走势、技术分析和基本面更新。报告内容仅供参考，不构成投资建议。

⚠️ 风险提示: 加密货币市场波动较大，投资需谨慎。

================================================================================
                            报告生成信息
================================================================================

生成系统: Super-nof1.ai Multi-Agent Trading System
AI 模型: Google Gemini 2.5 Pro (with Google Search Grounding)
数据来源: Google Search + 实时市场数据
更新频率: 每 30 分钟
报告存储: app/pdf/${dateStr.replace(/-/g, '_')}.txt

================================================================================
`;

    return report;
}
