"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Info, Bot, Code, FileCode } from "lucide-react";

interface AgentPrompt {
    id?: string;
    name: string;
    role: string;
    prompt: string;
    description: string;
    model?: string;
}

interface TradingPrompt {
    name: string;
    description: string;
    prompt: string;
}

const AGENT_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
    "tech-analyst": { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: "text-blue-500" },
    "fundamental-analyst": { bg: "bg-purple-500/10", border: "border-purple-500/30", icon: "text-purple-500" },
    "sentiment-analyst": { bg: "bg-green-500/10", border: "border-green-500/30", icon: "text-green-500" },
    "decision-maker": { bg: "bg-orange-500/10", border: "border-orange-500/30", icon: "text-orange-500" },
    "trading-system": { bg: "bg-red-500/10", border: "border-red-500/30", icon: "text-red-500" },
    deepseek: { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: "text-blue-500" },
    gemini: { bg: "bg-purple-500/10", border: "border-purple-500/30", icon: "text-purple-500" },
    qwen: { bg: "bg-green-500/10", border: "border-green-500/30", icon: "text-green-500" },
    kimi: { bg: "bg-orange-500/10", border: "border-orange-500/30", icon: "text-orange-500" },
};

const FILE_PATHS: Record<string, string> = {
    'deepseek': 'lib/ai/agents/base-agent.ts',
    'gemini': 'lib/ai/agents/base-agent.ts',
    'qwen': 'lib/ai/agents/base-agent.ts',
    'kimi': 'lib/ai/agents/kimi-agent.ts',
    'tech-analyst': 'lib/ai/agents/base-agent.ts',
    'fundamental-analyst': 'lib/ai/agents/base-agent.ts',
    'sentiment-analyst': 'lib/ai/agents/base-agent.ts',
    'decision-maker': 'lib/ai/agents/kimi-agent.ts',
    'trading-system': 'lib/ai/prompt.ts',
};

export function AgentPromptEditor() {
    const [agents, setAgents] = useState<AgentPrompt[]>([]);
    const [tradingPrompt, setTradingPrompt] = useState<TradingPrompt | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

    const fetchPrompts = useCallback(async () => {
        try {
            const response = await fetch("/api/agent-prompts");
            if (!response.ok) return;

            const result = await response.json();
            if (result.success && result.data) {
                // Map API response to component format
                const mappedAgents = (result.data.agents || []).map((agent: any) => ({
                    id: agent.id || agent.role || agent.name?.toLowerCase(),
                    name: agent.name,
                    role: agent.role,
                    prompt: agent.systemPrompt || agent.prompt || '',
                    description: agent.description,
                    model: agent.model,
                }));
                setAgents(mappedAgents);

                // Set trading system prompt
                if (result.data.tradingSystemPrompt) {
                    setTradingPrompt(result.data.tradingSystemPrompt);
                }

                if (mappedAgents.length > 0 && !selectedAgent) {
                    setSelectedAgent(mappedAgents[0].id);
                }
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching agent prompts:", err);
            setLoading(false);
        }
    }, [selectedAgent]);

    useEffect(() => {
        fetchPrompts();
    }, [fetchPrompts]);

    const selectedAgentData = agents.find(a => a.id === selectedAgent);
    const showTradingPrompt = selectedAgent === 'trading-system';

    const currentPrompt = showTradingPrompt
        ? (tradingPrompt?.prompt ?? "")
        : (selectedAgentData?.prompt ?? "");

    const currentFilePath = showTradingPrompt
        ? FILE_PATHS['trading-system']
        : FILE_PATHS[selectedAgent || ''] || FILE_PATHS[selectedAgentData?.role || ''];

    if (loading) {
        return (
            <Card className="h-full">
                <CardContent className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-2 flex-shrink-0 border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="w-5 h-5 text-slate-500" />
                    Agent 提示词查看器
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 flex overflow-hidden p-0">
                {/* Agent List - Left Side */}
                <div className="w-44 border-r p-2 space-y-1 flex-shrink-0 overflow-y-auto">
                    {agents.map((agent) => {
                        const agentId = agent.id || agent.role || agent.name?.toLowerCase() || 'unknown';
                        const colors = AGENT_COLORS[agentId] || AGENT_COLORS.deepseek;
                        const isSelected = selectedAgent === agentId;

                        return (
                            <button
                                key={agentId}
                                onClick={() => setSelectedAgent(agentId)}
                                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all ${isSelected
                                    ? `${colors.bg} ${colors.border} border`
                                    : 'hover:bg-muted/50'
                                    }`}
                            >
                                <Bot className={`w-4 h-4 flex-shrink-0 ${colors.icon}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{agent.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{agent.model}</div>
                                </div>
                            </button>
                        );
                    })}

                    {/* Trading System Prompt */}
                    {tradingPrompt && (
                        <>
                            <div className="border-t my-2"></div>
                            <button
                                onClick={() => setSelectedAgent('trading-system')}
                                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all ${selectedAgent === 'trading-system'
                                    ? `${AGENT_COLORS['trading-system'].bg} ${AGENT_COLORS['trading-system'].border} border`
                                    : 'hover:bg-muted/50'
                                    }`}
                            >
                                <Code className={`w-4 h-4 flex-shrink-0 ${AGENT_COLORS['trading-system'].icon}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">Trading System</div>
                                    <div className="text-xs text-muted-foreground truncate">主交易策略</div>
                                </div>
                            </button>
                        </>
                    )}
                </div>

                {/* Editor - Right Side */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {(selectedAgentData || showTradingPrompt) ? (
                        <>
                            {/* Editor Header */}
                            <div className="px-4 py-2 border-b bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium">
                                            {showTradingPrompt ? tradingPrompt?.name : selectedAgentData?.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {showTradingPrompt ? tradingPrompt?.description : selectedAgentData?.description}
                                        </div>
                                    </div>
                                </div>

                                {/* File path info */}
                                <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                                    <FileCode className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                    <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                                        {currentFilePath}
                                    </span>
                                </div>
                            </div>

                            {/* Read-only notice */}
                            <div className="px-4 py-2 bg-blue-500/5 border-b border-blue-500/10">
                                <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div className="text-xs text-blue-600 dark:text-blue-400">
                                        <strong>只读模式：</strong>Prompts 直接定义在源代码中以确保版本化和可追踪性。
                                        如需修改，请直接编辑上方显示的文件。
                                    </div>
                                </div>
                            </div>

                            {/* Textarea (Read-only) */}
                            <div className="flex-1 p-3 overflow-hidden">
                                <textarea
                                    value={currentPrompt}
                                    readOnly
                                    className="w-full h-full resize-none rounded-lg border bg-muted/30 p-3 text-sm font-mono focus:outline-none cursor-default"
                                    placeholder="加载中..."
                                />
                            </div>

                            {/* Word Count */}
                            <div className="px-4 py-1 border-t text-xs text-muted-foreground text-right">
                                {currentPrompt.length} 字符 | {currentPrompt.split('\n').length} 行
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="text-sm">选择一个 Agent 查看提示词</p>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
