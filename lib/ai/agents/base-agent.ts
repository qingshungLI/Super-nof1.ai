/**
 * Agent基类
 * 提供通用功能和工具方法
 */

import { prisma } from '@/lib/prisma';
import {
    IAgent,
    AgentName,
    AgentRole,
    AgentOpinion,
    AgentLesson,
    MarketData,
    PDFDocuments,
    AgentConfig,
    TradeDecision
} from './types';

/**
 * Agent抽象基类
 */
export abstract class BaseAgent implements IAgent {
    readonly name: AgentName;
    readonly role: AgentRole;
    protected apiKey: string;
    protected model?: string;
    protected timeout: number;
    protected maxHistoryLessons: number;

    constructor(config: AgentConfig) {
        this.name = config.name;
        this.role = config.role;
        this.apiKey = config.apiKey;
        this.model = config.model;
        // allow overriding timeout via environment variable AGENT_TIMEOUT (ms)
        const envTimeout = Number(process.env.AGENT_TIMEOUT || 0);
        this.timeout = config.timeout || (envTimeout > 0 ? envTimeout : 8000);
        this.maxHistoryLessons = config.maxHistoryLessons || 20;
    }

    /**
     * 第一轮分析（必须由子类实现）
     */
    abstract analyzeMarket(
        marketData: MarketData,
        pdfDocs: PDFDocuments,
        historyLessons: AgentLesson[]
    ): Promise<AgentOpinion>;

    /**
     * 后续轮次回应（必须由子类实现）
     */
    abstract respondToOpinions(
        myPreviousOpinion: AgentOpinion,
        othersOpinions: AgentOpinion[],
        marketData: MarketData
    ): Promise<AgentOpinion>;

    /**
     * 从数据库加载历史教训
     */
    protected async loadHistoryLessons(): Promise<AgentLesson[]> {
        try {
            const lessons = await prisma.agentLearning.findMany({
                where: {
                    agentName: this.name
                },
                orderBy: {
                    timestamp: 'desc'
                },
                take: this.maxHistoryLessons
            });

            return lessons.map((l: any) => ({
                timestamp: l.timestamp,
                errorType: l.errorType,
                errorDescription: l.errorDescription,
                lessonLearned: l.lessonLearned
            }));
        } catch (error) {
            console.error(`⚠️ [${this.name}] 加载历史教训失败:`, error);
            return [];
        }
    }

    /**
     * 格式化历史教训为Prompt
     */
    protected formatLessonsForPrompt(lessons: AgentLesson[]): string {
        if (lessons.length === 0) {
            return '你暂无历史错误记录。';
        }

        return `你过去犯过以下错误，请注意避免：\n\n${lessons
            .map((lesson, idx) => {
                const date = lesson.timestamp.toISOString().split('T')[0];
                return `${idx + 1}. [${date}] ${lesson.errorType}\n   错误: ${lesson.errorDescription}\n   教训: ${lesson.lessonLearned}`;
            })
            .join('\n\n')}`;
    }

    /**
     * 构造系统Prompt
     */
    protected buildSystemPrompt(role: AgentRole): string {
        const roleDescriptions = {
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

            'decision-maker': `你是**最终决策者**，负责综合所有分析做出交易决定。
你需要：
1. 审查3位分析师的完整讨论过程
2. 权衡技术面、基本面、情绪面的重要性
3. 识别分析中的逻辑漏洞或认知偏差
4. 考虑风险收益比
5. 给出明确的交易指令（Buy/Sell/Hold）

你的决策应理性、谨慎，避免盲目跟从多数意见。`
        };

        return roleDescriptions[role] || '';
    }

    /**
     * 解析决策从文本（容错处理）
     */
    protected parseDecision(text: string): TradeDecision {
        const lower = text.toLowerCase();
        if (lower.includes('buy') || lower.includes('做多') || lower.includes('买入')) {
            return 'Buy';
        }
        if (lower.includes('sell') || lower.includes('做空') || lower.includes('卖出')) {
            return 'Sell';
        }
        return 'Hold';
    }

    /**
     * 解析信心度（容错处理）
     */
    protected parseConfidence(text: string): number {
        // 尝试提取数字
        const match = text.match(/(\d+)%?/);
        if (match) {
            const value = parseInt(match[1]);
            return Math.min(100, Math.max(0, value));
        }
        // 默认中等信心
        return 50;
    }

    /**
     * 安全的字符串截取（容错处理任何类型）
     * 处理 undefined、null、对象、数组等情况
     */
    protected safeSubstring(value: any, maxLength: number = 500): string {
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

    /**
     * 超时包装器
     */
    protected async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number = this.timeout
    ): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    /**
     * Retry wrapper with optional exponential backoff
     * 减少默认重试次数和延迟，避免长时间阻塞
     */
    protected async withRetries<T>(
        fn: () => Promise<T>,
        retries: number = 1, // 默认只重试1次
        timeoutMs: number = this.timeout,
        backoffMs: number = 500 // 减少基础延迟到500ms
    ): Promise<T> {
        let lastError: any;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this.withTimeout(fn(), timeoutMs);
            } catch (error: any) {
                lastError = error;
                if (attempt < retries) {
                    const sleep = backoffMs * (attempt + 1); // 线性增长而非指数，避免过长延迟
                    console.warn(`⚠️ [${this.name}] Retry attempt ${attempt + 1}/${retries}, sleeping ${sleep}ms due to: ${error.message}`);
                    await new Promise((r) => setTimeout(r, sleep));
                }
            }
        }
        throw lastError;
    }
}
