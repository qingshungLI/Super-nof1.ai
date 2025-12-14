"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MarketDashboard } from "@/components/market-dashboard";
import { AgentForumPanel } from "@/components/agent-forum-panel";
import { PnLCurve } from "@/components/pnl-curve";
import { DocumentViewer } from "@/components/document-viewer";
import { AgentPromptEditor } from "@/components/agent-prompt-editor";
import {
    Activity,
    Users,
    FileText,
    Settings,
    TrendingUp,
    LayoutDashboard,
    ChevronRight,
    Zap,
    LineChart,
    ArrowLeftRight,
} from "lucide-react";

type TabId = 'dashboard' | 'forum' | 'documents' | 'prompts';

interface NavItem {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    description: string;
}

const NAV_ITEMS: NavItem[] = [
    {
        id: 'dashboard',
        label: '市场概览',
        icon: <LayoutDashboard className="w-5 h-5" />,
        description: '实时市场数据与持仓信息'
    },
    {
        id: 'forum',
        label: 'Agent 论坛',
        icon: <Users className="w-5 h-5" />,
        description: '多Agent讨论与交易决策'
    },
    {
        id: 'documents',
        label: '分析文档',
        icon: <FileText className="w-5 h-5" />,
        description: '查看日报与研究报告'
    },
    {
        id: 'prompts',
        label: 'Prompt 编辑',
        icon: <Settings className="w-5 h-5" />,
        description: '自定义Agent系统提示词'
    },
];

export default function TradingDashboard() {
    const [activeTab, setActiveTab] = useState<TabId>('dashboard');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [currentTime, setCurrentTime] = useState<string>('');

    // 实时更新时间
    useEffect(() => {
        const updateTime = () => {
            setCurrentTime(new Date().toLocaleTimeString('zh-CN'));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return (
                    <div className="space-y-6">
                        {/* 市场概览 */}
                        <MarketDashboard />

                        {/* 收益曲线 - 单独一行，全宽显示 */}
                        <PnLCurve />
                    </div>
                );
            case 'forum':
                return (
                    <div className="h-[calc(100vh-12rem)]">
                        <AgentForumPanel />
                    </div>
                );
            case 'documents':
                return (
                    <div className="h-[calc(100vh-12rem)]">
                        <DocumentViewer />
                    </div>
                );
            case 'prompts':
                return (
                    <div className="h-[calc(100vh-12rem)]">
                        <AgentPromptEditor />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
            {/* Animated Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-indigo-500/3 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <div className="relative flex">
                {/* Sidebar */}
                <aside className={`fixed left-0 top-0 h-full bg-background/80 backdrop-blur-xl border-r border-border/50 transition-all duration-300 z-50 ${sidebarCollapsed ? 'w-16' : 'w-64'
                    }`}>
                    {/* Logo */}
                    <div className="p-4 border-b border-border/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
                                <Zap className="w-6 h-6 text-white" />
                            </div>
                            {!sidebarCollapsed && (
                                <div>
                                    <h1 className="text-lg font-black tracking-tight">Super Nof1</h1>
                                    <p className="text-[10px] text-muted-foreground">AI Trading Platform</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="p-2 space-y-1">
                        {/* 切换到 Live 页面 */}
                        <Link
                            href="/"
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-dashed border-border/50"
                        >
                            <LineChart className="w-5 h-5" />
                            {!sidebarCollapsed && (
                                <div className="flex-1 text-left">
                                    <div className="text-sm font-medium flex items-center gap-1">
                                        Live 页面
                                        <ArrowLeftRight className="w-3 h-3" />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                        切换到经典视图
                                    </div>
                                </div>
                            )}
                        </Link>

                        <div className="h-px bg-border/50 my-2" />

                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === item.id
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <span className={activeTab === item.id ? 'text-primary' : ''}>
                                    {item.icon}
                                </span>
                                {!sidebarCollapsed && (
                                    <div className="flex-1 text-left">
                                        <div className="text-sm font-medium">{item.label}</div>
                                        <div className="text-[10px] text-muted-foreground truncate">
                                            {item.description}
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </nav>

                    {/* Collapse Button */}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="absolute bottom-4 right-0 translate-x-1/2 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                        <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} />
                    </button>

                    {/* Status */}
                    {!sidebarCollapsed && (
                        <div className="absolute bottom-4 left-4 right-4">
                            <div className="p-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    <span className="text-xs font-medium text-green-600">系统运行中</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    {process.env.NEXT_PUBLIC_TRADING_MODE === 'dry-run' ? '虚拟盘模式' : '实盘模式'}
                                </p>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Main Content */}
                <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
                    {/* Header */}
                    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
                        <div className="px-6 py-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {NAV_ITEMS.find(i => i.id === activeTab)?.icon}
                                    {NAV_ITEMS.find(i => i.id === activeTab)?.label}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {NAV_ITEMS.find(i => i.id === activeTab)?.description}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                {/* Quick Stats */}
                                <div className="hidden md:flex items-center gap-6 text-sm">
                                    <div className="flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-green-500" />
                                        <span className="text-muted-foreground">市场</span>
                                        <span className="font-bold text-green-500">活跃</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-blue-500" />
                                        <span className="text-muted-foreground">今日</span>
                                        <span className="font-bold text-blue-500">+2.4%</span>
                                    </div>
                                </div>

                                {/* Time */}
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground">北京时间</div>
                                    <div className="text-sm font-mono font-bold">
                                        {currentTime}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Page Content */}
                    <div className="p-6">
                        {renderContent()}
                    </div>
                </main>
            </div>
        </div>
    );
}
