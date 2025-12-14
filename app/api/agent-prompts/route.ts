/**
 * API: Agent Prompts 管理
 * 读取实际代码中的 Agent System Prompts
 */

import { NextRequest, NextResponse } from "next/server";
import { getTradingPrompt } from "@/lib/ai/prompt";
import { Symbol } from "@prisma/client";

export const dynamic = 'force-dynamic';

// 从 base-agent.ts 中提取的实际 role descriptions
const ROLE_DESCRIPTIONS: Record<string, string> = {
    'tech-analyst': `你是一位**技术分析专家**，专注于：
- 图表形态识别（头肩顶/底、三角整理、双顶/底等）
- 技术指标解读（RSI、MACD、EMA、布林带等）
- 支撑/阻力位判断
- 成交量分析
- K线形态（锤子线、吞没形态、十字星等）

你的分析应基于技术面数据，避免过度依赖基本面或情绪面。`,

    'fundamental-analyst': `你是一位**基本面分析专家**，专注于：
- 项目技术实力与创新性评估
- 开发团队背景与信誉
- 链上数据分析（活跃地址、大户动向、TVL变化）
- 行业趋势与竞争格局
- 监管政策影响
- 宏观经济环境（美联储政策、通胀数据等）

你的分析应基于长期价值判断，关注项目基本面健康度。`,

    'sentiment-analyst': `你是一位**市场情绪分析专家**，专注于：
- 社交媒体情绪监测（Twitter、Reddit、Telegram等）
- KOL观点与影响力评估
- FOMO/FUD情绪识别
- 恐慌贪婪指数解读
- 新闻舆情分析（正面/负面/中性）
- 市场情绪极端值预警

你的分析应捕捉市场心理变化，识别非理性繁荣或恐慌。`,

    'decision-maker': `你是**最终决策者（Kimi-k2）**，负责综合3位分析师的讨论做出交易决定。

你的职责：
1. 审查DeepSeek、Gemini、Qwen的完整讨论
2. 识别分析中的逻辑漏洞、认知偏差、过度自信
3. 权衡不同维度的重要性（技术面 vs 基本面 vs 情绪面）
4. 考虑风险收益比，避免高风险低回报的交易
5. 给出明确的交易指令

原则：
- 不要盲目跟从多数意见（3个都看多不代表一定做多）
- 关注分歧点（分歧往往揭示关键风险）
- 保持理性，避免FOMO或恐慌情绪
- 如果信息不足或风险过高，选择Hold，但是不要频繁使用Hold`
};

// Agent 配置 - 匹配实际代码中的设置
const AGENT_CONFIGS = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        role: 'tech-analyst',
        model: 'deepseek-chat',
        description: '技术分析专家 - 专注于图表形态、技术指标、支撑阻力位分析',
        timeout: 'DEEPSEEK_TIMEOUT',
    },
    {
        id: 'gemini',
        name: 'Gemini',
        role: 'fundamental-analyst',
        model: 'gemini-2.5-pro',
        description: '基本面分析专家 - 专注于项目基本面、链上数据、行业趋势分析',
        timeout: 'GEMINI_TIMEOUT',
    },
    {
        id: 'qwen',
        name: 'Qwen',
        role: 'sentiment-analyst',
        model: 'qwen3-max',
        description: '情绪分析专家 - 专注于市场情绪、社交媒体、KOL观点分析',
        timeout: 'QWEN_TIMEOUT',
    },
    {
        id: 'kimi',
        name: 'Kimi',
        role: 'decision-maker',
        model: 'kimi-k2-thinking',
        description: '最终决策者 - 综合所有分析做出最终交易决定',
        timeout: 'KIMI_TIMEOUT',
    },
];

export const GET = async () => {
    try {
        // 获取主交易系统 Prompt
        const tradingSystemPrompt = getTradingPrompt(['BTC', 'ETH', 'SOL', 'BNB', 'DOGE'] as Symbol[]);

        // 构建 agents 数组
        const agents = AGENT_CONFIGS.map(agent => ({
            id: agent.id,
            name: agent.name,
            role: agent.role,
            model: agent.model,
            description: agent.description,
            systemPrompt: ROLE_DESCRIPTIONS[agent.role] || '',
        }));

        return NextResponse.json({
            success: true,
            data: {
                agents,
                // 额外返回主交易 Prompt（用于参考）
                tradingSystemPrompt: {
                    name: 'Trading System',
                    description: '主交易系统 Prompt - 定义交易策略、仓位管理、止盈止损规则',
                    prompt: tradingSystemPrompt,
                },
            },
        });
    } catch (error) {
        console.error("Failed to fetch agent prompts:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
};

export const PUT = async (request: NextRequest) => {
    try {
        const body = await request.json();
        const { agentId, systemPrompt } = body;

        if (!agentId || !systemPrompt) {
            return NextResponse.json(
                { success: false, error: "Missing agentId or systemPrompt" },
                { status: 400 }
            );
        }

        // NOTE: Prompt 直接硬编码在代码中（base-agent.ts 和 kimi-agent.ts）
        // 修改需要更新源代码文件，不支持运行时修改
        // 这是有意设计：确保 Prompt 版本化和可追踪

        console.log(`[Agent Prompt Update Attempt] ${agentId}`);
        console.log(`[INFO] Prompts are hardcoded in source files:`);
        console.log(`  - lib/ai/agents/base-agent.ts (DeepSeek, Gemini, Qwen)`);
        console.log(`  - lib/ai/agents/kimi-agent.ts (Kimi)`);
        console.log(`  - lib/ai/prompt.ts (Trading System Prompt)`);

        return NextResponse.json({
            success: false,
            error: "Prompts 直接定义在源代码中，不支持运行时修改。请直接编辑以下文件：\n" +
                "• lib/ai/agents/base-agent.ts (DeepSeek/Gemini/Qwen prompts)\n" +
                "• lib/ai/agents/kimi-agent.ts (Kimi prompt)\n" +
                "• lib/ai/prompt.ts (Trading System Prompt)",
            hint: "这是有意设计，确保 Prompt 变更可追踪和版本化。",
        }, { status: 400 });
    } catch (error) {
        console.error("Failed to update agent prompt:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
};
