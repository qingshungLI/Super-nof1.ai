"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Users, Brain, Zap, ChevronDown, ChevronUp } from "lucide-react";

// 安全的字符串处理函数
function safeString(value: any, maxLength?: number): string {
    if (value === undefined || value === null) {
        return '';
    }
    let str: string;
    if (typeof value === 'string') {
        str = value;
    } else if (typeof value === 'object') {
        try {
            str = JSON.stringify(value);
        } catch {
            str = '[对象]';
        }
    } else {
        str = String(value);
    }
    return maxLength ? str.substring(0, maxLength) : str;
}

interface AgentOpinion {
    agentName: string;
    role: string;
    round: number;
    decision: string;
    confidence: number;
    reasoning: string;
    keyPoints?: string[];
    risks?: string[];
    timestamp?: string;
}

interface ForumDecision {
    id: string;
    createdAt: string;
    finalDecision: {
        decision: string;
        confidence: number;
        reasoning: string;
        tradeParams: any;
        consensus: any;
        totalDuration: number;
        analyzedCoins: number;
    };
    agents: {
        deepseek: { name: string; role: string; rounds: AgentOpinion[]; summary: string };
        gemini: { name: string; role: string; rounds: AgentOpinion[]; summary: string };
        qwen: { name: string; role: string; rounds: AgentOpinion[]; summary: string };
    };
    marketSnapshot: any;
}

const AGENT_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    DeepSeek: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500', icon: '🔍' },
    Gemini: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-500', icon: '💎' },
    Qwen: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-500', icon: '🌿' },
    Kimi: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-500', icon: '🎯' },
};

const DECISION_COLORS: Record<string, string> = {
    Buy: 'text-green-500',
    Sell: 'text-red-500',
    Hold: 'text-yellow-500',
};

export function AgentForumPanel() {
    const [decisions, setDecisions] = useState<ForumDecision[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedRound, setSelectedRound] = useState<number>(1);

    const fetchForumData = useCallback(async () => {
        try {
            const response = await fetch("/api/forum");
            if (!response.ok) return;

            const result = await response.json();
            if (result.success && result.data) {
                setDecisions(result.data.decisions || []);
                // 自动展开最新的决策
                if (result.data.decisions?.length > 0 && !expandedId) {
                    setExpandedId(result.data.decisions[0].id);
                }
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching forum data:", err);
            setLoading(false);
        }
    }, [expandedId]);

    useEffect(() => {
        fetchForumData();
        const interval = setInterval(fetchForumData, 15000); // 每15秒刷新
        return () => clearInterval(interval);
    }, [fetchForumData]);

    const renderAgentMessage = (opinion: AgentOpinion, agentKey: string) => {
        const colors = AGENT_COLORS[opinion.agentName] || AGENT_COLORS.DeepSeek;

        return (
            <div
                key={`${opinion.agentName}-${opinion.round}`}
                className={`${colors.bg} ${colors.border} border rounded-xl p-4 space-y-3`}
            >
                {/* Agent Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{colors.icon}</span>
                        <span className={`font-bold ${colors.text}`}>{opinion.agentName}</span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                            {opinion.role.replace('-', ' ')}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`font-bold ${DECISION_COLORS[opinion.decision] || 'text-gray-500'}`}>
                            {opinion.decision}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {opinion.confidence}% 信心
                        </span>
                    </div>
                </div>

                {/* Reasoning */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {safeString(opinion.reasoning, 500)}
                    {safeString(opinion.reasoning).length > 500 && '...'}
                </p>

                {/* Key Points */}
                {opinion.keyPoints && opinion.keyPoints.length > 0 && (
                    <div className="space-y-1">
                        <div className="text-xs font-semibold text-muted-foreground">核心观点:</div>
                        <div className="flex flex-wrap gap-1">
                            {opinion.keyPoints.slice(0, 3).map((point, i) => (
                                <span key={i} className="text-xs px-2 py-1 bg-background/50 rounded-lg">
                                    {typeof point === 'string' ? point.substring(0, 50) : String(point).substring(0, 50)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Risks */}
                {opinion.risks && opinion.risks.length > 0 && (
                    <div className="space-y-1">
                        <div className="text-xs font-semibold text-red-500/80">风险提示:</div>
                        <div className="flex flex-wrap gap-1">
                            {opinion.risks.slice(0, 2).map((risk, i) => (
                                <span key={i} className="text-xs px-2 py-1 bg-red-500/10 text-red-500 rounded-lg">
                                    ⚠️ {typeof risk === 'string' ? risk.substring(0, 40) : String(risk).substring(0, 40)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderFinalDecision = (decision: ForumDecision) => {
        const fd = decision.finalDecision;
        const colors = AGENT_COLORS.Kimi;

        return (
            <div className={`${colors.bg} ${colors.border} border-2 rounded-xl p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{colors.icon}</span>
                        <span className={`font-bold text-lg ${colors.text}`}>Kimi 最终决策</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-2xl font-black ${DECISION_COLORS[fd.decision] || 'text-gray-500'}`}>
                            {fd.decision}
                        </span>
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground">信心度</div>
                            <div className="font-bold">{fd.confidence}%</div>
                        </div>
                    </div>
                </div>

                <p className="text-sm leading-relaxed">
                    {safeString(fd.reasoning, 600)}
                    {safeString(fd.reasoning).length > 600 && '...'}
                </p>

                {/* Trade Params */}
                {fd.tradeParams && fd.decision !== 'Hold' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border/50">
                        <div className="text-center p-2 bg-background/50 rounded-lg">
                            <div className="text-xs text-muted-foreground">币种</div>
                            <div className="font-bold">{fd.tradeParams.symbol}</div>
                        </div>
                        <div className="text-center p-2 bg-background/50 rounded-lg">
                            <div className="text-xs text-muted-foreground">数量</div>
                            <div className="font-bold">{fd.tradeParams.amount || 'N/A'}</div>
                        </div>
                        <div className="text-center p-2 bg-background/50 rounded-lg">
                            <div className="text-xs text-muted-foreground">杠杆</div>
                            <div className="font-bold text-purple-500">{fd.tradeParams.leverage || 1}x</div>
                        </div>
                        <div className="text-center p-2 bg-background/50 rounded-lg">
                            <div className="text-xs text-muted-foreground">耗时</div>
                            <div className="font-bold">{(fd.totalDuration / 1000).toFixed(1)}s</div>
                        </div>
                    </div>
                )}

                {/* Consensus Info */}
                {fd.consensus && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                            共识: {fd.consensus.reached ? '✅ 已达成' : '❌ 未达成'}
                        </span>
                        <span>
                            一致率: {((fd.consensus.agreementRate || 0) * 100).toFixed(1)}%
                        </span>
                        <span>
                            分析币种: {fd.analyzedCoins}个
                        </span>
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="w-5 h-5" />
                        Agent Forum
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-3 flex-shrink-0 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                        Multi-Agent Forum
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Live
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {decisions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>暂无讨论记录</p>
                        <p className="text-xs mt-1">系统运行后将自动开始Agent讨论</p>
                    </div>
                ) : (
                    decisions.map((decision) => {
                        const isExpanded = expandedId === decision.id;
                        const allRounds: AgentOpinion[][] = [];

                        // 整理每轮的讨论
                        const maxRounds = Math.max(
                            decision.agents.deepseek.rounds?.length || 0,
                            decision.agents.gemini.rounds?.length || 0,
                            decision.agents.qwen.rounds?.length || 0
                        );

                        for (let r = 0; r < maxRounds; r++) {
                            const roundOpinions: AgentOpinion[] = [];
                            if (decision.agents.deepseek.rounds?.[r]) roundOpinions.push(decision.agents.deepseek.rounds[r]);
                            if (decision.agents.gemini.rounds?.[r]) roundOpinions.push(decision.agents.gemini.rounds[r]);
                            if (decision.agents.qwen.rounds?.[r]) roundOpinions.push(decision.agents.qwen.rounds[r]);
                            if (roundOpinions.length > 0) allRounds.push(roundOpinions);
                        }

                        return (
                            <div key={decision.id} className="border rounded-xl overflow-hidden">
                                {/* Header - Always visible */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : decision.id)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${decision.finalDecision.decision === 'Buy' ? 'bg-green-500' :
                                            decision.finalDecision.decision === 'Sell' ? 'bg-red-500' : 'bg-yellow-500'
                                            }`} />
                                        <div className="text-left">
                                            <div className="font-semibold flex items-center gap-2">
                                                <span className={DECISION_COLORS[decision.finalDecision.decision]}>
                                                    {decision.finalDecision.decision}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {decision.finalDecision.confidence}% 信心
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(decision.createdAt).toLocaleString('zh-CN')}
                                            </div>
                                        </div>
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </button>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="border-t p-4 space-y-4 bg-muted/10">
                                        {/* Round Selector */}
                                        {allRounds.length > 1 && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">讨论轮次:</span>
                                                {allRounds.map((_, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedRound(idx + 1)}
                                                        className={`px-3 py-1 text-xs rounded-full transition-colors ${selectedRound === idx + 1
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted hover:bg-muted/80'
                                                            }`}
                                                    >
                                                        Round {idx + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Agent Messages */}
                                        <div className="space-y-3">
                                            {allRounds[selectedRound - 1]?.map((opinion) =>
                                                renderAgentMessage(opinion, opinion.agentName.toLowerCase())
                                            )}
                                        </div>

                                        {/* Final Decision */}
                                        <div className="pt-2">
                                            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                                                <Zap className="w-4 h-4" />
                                                最终裁定
                                            </div>
                                            {renderFinalDecision(decision)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}
