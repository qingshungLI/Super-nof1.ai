/**
 * 平仓后事后分析系统
 * 由Kimi分析每个Agent的预测偏差，生成学习反馈
 */

import { prisma } from '@/lib/prisma';
import { KimiAgent } from './agents/kimi-agent';

/**
 * 事后分析输入
 */
export interface PostTradeAnalysisInput {
    tradingDecisionId: string;  // 决策记录ID
    actualProfitLoss: number;   // 实际盈亏
    closeReason: string;        // 平仓原因
    actualMarketMovement?: any; // 实际市场走势数据（可选）
}

/**
 * Agent错误分析结果
 */
interface AgentErrorAnalysis {
    agentName: string;
    errors: string[];           // 错误列表
    lessons: string[];          // 应学习的教训
}

/**
 * 完整事后分析结果
 */
interface PostAnalysisResult {
    techAnalystErrors: string[];
    fundamentalAnalystErrors: string[];
    sentimentAnalystErrors: string[];
    decisionMakerErrors: string[];
    overallLessons: string[];
}

/**
 * 执行事后分析并记录到数据库
 */
export async function conductPostTradeAnalysis(
    input: PostTradeAnalysisInput
): Promise<void> {
    console.log(`\n📊 开始事后分析: ${input.tradingDecisionId}`);

    try {
        // 1. 从数据库加载决策记录
        const decision = await prisma.tradingDecision.findUnique({
            where: { id: input.tradingDecisionId }
        });

        if (!decision) {
            throw new Error(`决策记录不存在: ${input.tradingDecisionId}`);
        }

        // 2. 调用Kimi进行分析
        const kimiKey = process.env.KIMI_API_KEY || '';
        const kimi = new KimiAgent(kimiKey);

        const analysisPrompt = buildAnalysisPrompt(decision, input);
        const analysisResult = await callKimiForAnalysis(kimi, analysisPrompt);

        // 3. 更新决策记录
        await prisma.tradingDecision.update({
            where: { id: input.tradingDecisionId },
            data: {
                actualProfitLoss: input.actualProfitLoss,
                closeTimestamp: new Date(),
                closeReason: input.closeReason,
                postAnalysis: analysisResult as any
            }
        });

        // 4. 写入Agent学习记录
        await storeAgentLearnings(input.tradingDecisionId, analysisResult);

        console.log(`✅ 事后分析完成，已记录${getTotalErrors(analysisResult)}条错误`);
    } catch (error: any) {
        console.error(`❌ 事后分析失败:`, error.message);
        throw error;
    }
}

/**
 * 构建分析Prompt
 */
function buildAnalysisPrompt(decision: any, input: PostTradeAnalysisInput): string {
    const techAnalysis = JSON.stringify(decision.techAnalysis, null, 2);
    const fundamentalAnalysis = JSON.stringify(decision.fundamentalAnalysis, null, 2);
    const sentimentAnalysis = JSON.stringify(decision.sentimentAnalysis, null, 2);
    const finalDecision = JSON.stringify(decision.finalDecision, null, 2);

    return `你是事后分析专家，需要分析一笔已平仓交易中各个Agent的预测偏差。

## 当时的讨论记录

### 技术分析师（DeepSeek）
\`\`\`json
${techAnalysis}
\`\`\`

### 基本面分析师（Gemini）
\`\`\`json
${fundamentalAnalysis}
\`\`\`

### 情绪分析师（Qwen）
\`\`\`json
${sentimentAnalysis}
\`\`\`

### 最终决策（Kimi）
\`\`\`json
${finalDecision}
\`\`\`

---

## 实际结果
- 最终盈亏: ${input.actualProfitLoss} USDT
- 平仓原因: ${input.closeReason}
- 结果: ${input.actualProfitLoss >= 0 ? '盈利✅' : '亏损❌'}

---

**请分析每个Agent的预测偏差，识别错误类型：**

1. **技术分析师（DeepSeek）**
   - 是否误判了关键支撑/阻力位？
   - 技术指标是否给出错误信号？
   - 图表形态解读是否有误？

2. **基本面分析师（Gemini）**
   - 是否忽略了重要的基本面变化？
   - 对行业趋势的判断是否正确？
   - 链上数据分析是否准确？

3. **情绪分析师（Qwen）**
   - 是否高估或低估了市场情绪？
   - FOMO/FUD情绪识别是否到位？
   - 社交媒体信号解读是否正确？

4. **决策者（Kimi）**
   - 是否正确权衡了各维度信息？
   - 风险控制是否合理？
   - 是否存在认知偏差？

请用JSON格式回复：
\`\`\`json
{
  "techAnalystErrors": ["错误1", "错误2"],
  "fundamentalAnalystErrors": ["错误1", "错误2"],
  "sentimentAnalystErrors": ["错误1", "错误2"],
  "decisionMakerErrors": ["错误1", "错误2"],
  "overallLessons": ["整体教训1", "整体教训2"]
}
\`\`\`

如果某个Agent没有明显错误，数组留空[]。`;
}

/**
 * 调用Kimi进行分析
 */
async function callKimiForAnalysis(
    kimi: KimiAgent,
    prompt: string
): Promise<PostAnalysisResult> {
    try {
        // 直接调用Kimi的内部API方法
        const response = await (kimi as any).callKimiAPI(prompt);

        // 解析响应
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
        }

        return JSON.parse(response);
    } catch (error) {
        console.warn('⚠️ 分析结果解析失败，使用兜底结果');
        return {
            techAnalystErrors: ['解析失败'],
            fundamentalAnalystErrors: ['解析失败'],
            sentimentAnalystErrors: ['解析失败'],
            decisionMakerErrors: ['解析失败'],
            overallLessons: ['事后分析系统故障']
        };
    }
}

/**
 * 存储Agent学习记录到数据库
 */
async function storeAgentLearnings(
    tradingDecisionId: string,
    analysis: PostAnalysisResult
): Promise<void> {
    const learnings = [
        {
            agentName: 'DeepSeek',
            errors: analysis.techAnalystErrors
        },
        {
            agentName: 'Gemini',
            errors: analysis.fundamentalAnalystErrors
        },
        {
            agentName: 'Qwen',
            errors: analysis.sentimentAnalystErrors
        },
        {
            agentName: 'Kimi',
            errors: analysis.decisionMakerErrors
        }
    ];

    for (const learning of learnings) {
        for (const error of learning.errors) {
            if (!error || error === '解析失败') continue;

            await prisma.agentLearning.create({
                data: {
                    agentName: learning.agentName,
                    tradeDecisionId: tradingDecisionId,
                    errorType: extractErrorType(error),
                    errorDescription: error,
                    lessonLearned: `避免${extractErrorType(error)}，${error}`
                }
            });
        }
    }

    console.log(`💾 已存储${getTotalErrors(analysis)}条Agent学习记录`);
}

/**
 * 从错误描述提取错误类型
 */
function extractErrorType(errorDescription: string): string {
    const keywords = [
        '过度乐观',
        '过度悲观',
        '忽视技术面',
        '忽视基本面',
        '忽视情绪面',
        '误判趋势',
        '误判支撑阻力',
        '高估情绪',
        '低估风险',
        '杠杆过高',
        '止损不当'
    ];

    for (const keyword of keywords) {
        if (errorDescription.includes(keyword)) {
            return keyword;
        }
    }

    return '其他错误';
}

/**
 * 统计总错误数
 */
function getTotalErrors(analysis: PostAnalysisResult): number {
    return (
        analysis.techAnalystErrors.length +
        analysis.fundamentalAnalystErrors.length +
        analysis.sentimentAnalystErrors.length +
        analysis.decisionMakerErrors.length
    );
}
