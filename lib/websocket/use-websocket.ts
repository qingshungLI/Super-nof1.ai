/**
 * WebSocket 客户端 Hook
 * 在 React 组件中使用 WebSocket 实时数据
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// 事件数据类型
export interface MarketData {
    symbol: string;
    price: number;
    change24h: number;
    volume: number;
    timestamp: number;
}

export interface AgentDecision {
    id: string;
    decision: 'Buy' | 'Sell' | 'Hold';
    confidence: number;
    reasoning: string;
    agents: {
        name: string;
        decision: string;
        confidence: number;
    }[];
    timestamp: number;
}

export interface TradeExecuted {
    symbol: string;
    action: 'buy' | 'sell';
    amount: number;
    price: number;
    orderId: string;
    timestamp: number;
}

export interface MetricsData {
    totalBalance: number;
    availableBalance: number;
    unrealizedPnL: number;
    totalReturn: number;
    positions: {
        symbol: string;
        side: string;
        amount: number;
        entryPrice: number;
        pnl: number;
    }[];
    timestamp: number;
}

export interface SystemStatus {
    status: 'online' | 'offline' | 'maintenance';
    agentStatus: Record<string, 'active' | 'idle' | 'error'>;
    lastUpdate: number;
}

// 连接状态类型
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Hook 返回类型
export interface UseWebSocketReturn {
    // 连接状态
    status: ConnectionStatus;
    isConnected: boolean;

    // 实时数据
    marketData: MarketData[];
    latestDecision: AgentDecision | null;
    latestTrade: TradeExecuted | null;
    metrics: MetricsData | null;
    systemStatus: SystemStatus | null;

    // 操作方法
    subscribe: (channels: string[]) => void;
    unsubscribe: (channels: string[]) => void;
    reconnect: () => void;

    // 事件历史
    decisionHistory: AgentDecision[];
    tradeHistory: TradeExecuted[];
}

// 全局 socket 实例 (避免重复连接)
let globalSocket: Socket | null = null;
let connectionCount = 0;

/**
 * WebSocket 连接 Hook
 */
export function useWebSocket(): UseWebSocketReturn {
    const [status, setStatus] = useState<ConnectionStatus>('connecting');
    const [marketData, setMarketData] = useState<MarketData[]>([]);
    const [latestDecision, setLatestDecision] = useState<AgentDecision | null>(null);
    const [latestTrade, setLatestTrade] = useState<TradeExecuted | null>(null);
    const [metrics, setMetrics] = useState<MetricsData | null>(null);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [decisionHistory, setDecisionHistory] = useState<AgentDecision[]>([]);
    const [tradeHistory, setTradeHistory] = useState<TradeExecuted[]>([]);

    const socketRef = useRef<Socket | null>(null);

    // 初始化 Socket 连接
    useEffect(() => {
        connectionCount++;

        // 如果已有全局连接，复用
        if (globalSocket?.connected) {
            socketRef.current = globalSocket;
            setStatus('connected');
        } else {
            // 创建新连接
            const socketUrl = process.env.NEXT_PUBLIC_WS_URL || window.location.origin;

            const socket = io(socketUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000
            });

            socket.on('connect', () => {
                console.log('🟢 WebSocket 已连接');
                setStatus('connected');
            });

            socket.on('disconnect', (reason) => {
                console.log('🔴 WebSocket 断开:', reason);
                setStatus('disconnected');
            });

            socket.on('connect_error', (error) => {
                console.error('❌ WebSocket 连接错误:', error);
                setStatus('error');
            });

            socket.on('reconnect', (attemptNumber) => {
                console.log(`🔄 WebSocket 重连成功 (尝试 ${attemptNumber} 次)`);
                setStatus('connected');
            });

            socket.on('reconnect_attempt', (attemptNumber) => {
                console.log(`🔄 WebSocket 重连中... (尝试 ${attemptNumber})`);
                setStatus('connecting');
            });

            // 监听业务事件
            socket.on('market_update', (data: MarketData[]) => {
                setMarketData(data);
            });

            socket.on('agent_decision', (data: AgentDecision) => {
                setLatestDecision(data);
                setDecisionHistory(prev => [data, ...prev].slice(0, 50)); // 保留最近50条
            });

            socket.on('trade_executed', (data: TradeExecuted) => {
                setLatestTrade(data);
                setTradeHistory(prev => [data, ...prev].slice(0, 100)); // 保留最近100条
            });

            socket.on('metrics_update', (data: MetricsData) => {
                setMetrics(data);
            });

            socket.on('system_status', (data: SystemStatus) => {
                setSystemStatus(data);
            });

            socketRef.current = socket;
            globalSocket = socket;
        }

        // 清理函数
        return () => {
            connectionCount--;
            if (connectionCount === 0 && socketRef.current) {
                socketRef.current.disconnect();
                globalSocket = null;
            }
        };
    }, []);

    // 订阅频道
    const subscribe = useCallback((channels: string[]) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('subscribe', channels);
        }
    }, []);

    // 取消订阅
    const unsubscribe = useCallback((channels: string[]) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('unsubscribe', channels);
        }
    }, []);

    // 手动重连
    const reconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current.connect();
        }
    }, []);

    return {
        status,
        isConnected: status === 'connected',
        marketData,
        latestDecision,
        latestTrade,
        metrics,
        systemStatus,
        subscribe,
        unsubscribe,
        reconnect,
        decisionHistory,
        tradeHistory
    };
}

/**
 * 简化版 Hook - 只获取市场数据
 */
export function useMarketData(): { data: MarketData[]; isConnected: boolean } {
    const { marketData, isConnected } = useWebSocket();
    return { data: marketData, isConnected };
}

/**
 * 简化版 Hook - 只获取账户指标
 */
export function useMetrics(): { data: MetricsData | null; isConnected: boolean } {
    const { metrics, isConnected } = useWebSocket();
    return { data: metrics, isConnected };
}

/**
 * 简化版 Hook - 只获取最新决策
 */
export function useLatestDecision(): { data: AgentDecision | null; history: AgentDecision[]; isConnected: boolean } {
    const { latestDecision, decisionHistory, isConnected } = useWebSocket();
    return { data: latestDecision, history: decisionHistory, isConnected };
}
