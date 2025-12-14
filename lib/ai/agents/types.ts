/**
 * Agent系统的类型定义
 */

/**
 * Agent角色类型
 */
export type AgentRole = 'tech-analyst' | 'fundamental-analyst' | 'sentiment-analyst' | 'decision-maker';

/**
 * Agent名称
 */
export type AgentName = 'DeepSeek' | 'Gemini' | 'Qwen' | 'Kimi';

/**
 * 交易决策类型
 */
export type TradeDecision = 'Buy' | 'Sell' | 'Hold';

/**
 * 市场数据接口
 */
export interface MarketData {
    symbol: string;
    current_price: number;
    volume_24h?: number;
    price_change_24h?: number;
    technical_indicators?: any;
    orderbook?: any;
    [key: string]: any;
}

/**
 * 文档内容（市场分析HTML + 情绪分析TXT）
 */
export interface PDFDocuments {
    marketAnalysis: string;   // 基本面分析文档（HTML格式）
    moodAnalysis: string;      // 情绪面分析文档（TXT格式）
}

/**
 * Agent的历史教训
 */
export interface AgentLesson {
    timestamp: Date;
    errorType: string;
    errorDescription: string;
    lessonLearned: string;
}

/**
 * Agent观点（单轮讨论）
 */
export interface AgentOpinion {
    agentName: AgentName;
    role: AgentRole;
    round: number;               // 讨论轮次（1,2,3...）
    timestamp: Date;

    // 分析结果
    decision: TradeDecision;     // Buy/Sell/Hold
    confidence: number;          // 信心度 0-100
    reasoning: string;           // 推理过程
    symbol?: string;             // 推荐的币种（如 BTC/USDT）

    // 关键论据
    keyPoints: string[];         // 核心观点列表
    risks: string[];             // 识别的风险
    supportingData?: any;        // 支持数据（可选）

    // 对其他Agent的回应（Round 2+）
    responseTo?: {
        agentName: AgentName;
        agreement: 'agree' | 'disagree' | 'partial';
        counterArguments?: string[];
    }[];
}

/**
 * 讨论结果汇总
 */
export interface ForumResult {
    rounds: AgentOpinion[][];    // 每轮的所有Agent观点
    consensus: {
        reached: boolean;          // 是否达成共识
        decision: TradeDecision | null;
        agreementRate: number;     // 一致程度（0-1）
        divergentAgents?: AgentName[];  // 持异议的Agent
    };
    totalDuration: number;       // 总耗时（毫秒）
}

/**
 * 最终交易决策
 */
export interface FinalDecision {
    decision: TradeDecision;
    confidence: number;
    reasoning: string;

    // 交易参数（如果决定Buy/Sell）
    tradeParams?: {
        symbol: string;
        amount?: number;
        leverage?: number;
        stopLoss?: number;
        takeProfit?: number;
    };

    // 决策依据
    basedOn: {
        forumResult: ForumResult;
        marketData: MarketData;
        pdfInsights: string;
    };

    timestamp: Date;
}

/**
 * Agent配置
 */
export interface AgentConfig {
    name: AgentName;
    role: AgentRole;
    apiKey: string;
    model?: string;              // 模型名称（可选，使用默认）
    timeout?: number;            // 单次调用超时（毫秒）
    maxHistoryLessons?: number;  // 加载的历史教训数量
}

/**
 * Agent接口
 */
export interface IAgent {
    readonly name: AgentName;
    readonly role: AgentRole;

    /**
     * 第一轮分析：独立评估市场
     */
    analyzeMarket(
        marketData: MarketData,
        pdfDocs: PDFDocuments,
        historyLessons: AgentLesson[]
    ): Promise<AgentOpinion>;

    /**
     * 后续轮次：回应其他Agent的观点
     */
    respondToOpinions(
        myPreviousOpinion: AgentOpinion,
        othersOpinions: AgentOpinion[],
        marketData: MarketData
    ): Promise<AgentOpinion>;
}

/**
 * 决策Agent接口
 */
export interface IDecisionMaker {
    readonly name: AgentName;

    /**
     * 基于论坛讨论做出最终决策
     */
    makeDecision(
        forumResult: ForumResult,
        marketData: MarketData,
        pdfDocs: PDFDocuments
    ): Promise<FinalDecision>;
}
