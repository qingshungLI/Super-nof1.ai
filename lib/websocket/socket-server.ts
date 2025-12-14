/**
 * WebSocket 服务器
 * 提供实时数据推送能力
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

// 事件类型定义
export interface MarketUpdateEvent {
    type: 'market_update';
    data: {
        symbol: string;
        price: number;
        change24h: number;
        volume: number;
        timestamp: number;
    }[];
}

export interface AgentDecisionEvent {
    type: 'agent_decision';
    data: {
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
    };
}

export interface TradeExecutedEvent {
    type: 'trade_executed';
    data: {
        symbol: string;
        action: 'buy' | 'sell';
        amount: number;
        price: number;
        orderId: string;
        timestamp: number;
    };
}

export interface MetricsUpdateEvent {
    type: 'metrics_update';
    data: {
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
    };
}

export interface SystemStatusEvent {
    type: 'system_status';
    data: {
        status: 'online' | 'offline' | 'maintenance';
        agentStatus: Record<string, 'active' | 'idle' | 'error'>;
        lastUpdate: number;
    };
}

export type WebSocketEvent =
    | MarketUpdateEvent
    | AgentDecisionEvent
    | TradeExecutedEvent
    | MetricsUpdateEvent
    | SystemStatusEvent;

// 单例 Socket.IO 服务器实例
let io: SocketIOServer | null = null;

/**
 * 初始化 
 */
export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
    if (io) {
        console.log('⚡ WebSocket 服务器已存在，返回现有实例');
        return io;
    }

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? process.env.NEXT_PUBLIC_APP_URL
                : ['http://localhost:3000', 'http://127.0.0.1:3000'],
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000
    });

    io.on('connection', (socket: Socket) => {
        console.log(`🔌 客户端连接: ${socket.id}`);

        // 发送连接确认
        socket.emit('connected', {
            message: 'Connected to Super-NOF1.AI WebSocket',
            timestamp: Date.now()
        });

        // 订阅特定频道
        socket.on('subscribe', (channels: string[]) => {
            channels.forEach(channel => {
                socket.join(channel);
                console.log(`  📢 ${socket.id} 订阅频道: ${channel}`);
            });
        });

        // 取消订阅
        socket.on('unsubscribe', (channels: string[]) => {
            channels.forEach(channel => {
                socket.leave(channel);
                console.log(`  🔇 ${socket.id} 取消订阅: ${channel}`);
            });
        });

        // 断开连接
        socket.on('disconnect', (reason) => {
            console.log(`🔌 客户端断开: ${socket.id}, 原因: ${reason}`);
        });

        // 错误处理
        socket.on('error', (error) => {
            console.error(`❌ WebSocket 错误 (${socket.id}):`, error);
        });
    });

    console.log('✅ WebSocket 服务器初始化完成');
    return io;
}

/**
 * 获取 Socket.IO 服务器实例
 */
export function getSocketServer(): SocketIOServer | null {
    return io;
}

/**
 * 广播事件到所有连接的客户端
 */
export function broadcast(event: WebSocketEvent): void {
    if (!io) {

        return;
    }
    io.emit(event.type, event.data);
}

/**
 * 广播到特定频道
 */
export function broadcastToChannel(channel: string, event: WebSocketEvent): void {
    if (!io) {

        return;
    }
    io.to(channel).emit(event.type, event.data);
}

/**
 * 推送市场数据更新
 */
export function pushMarketUpdate(data: MarketUpdateEvent['data']): void {
    broadcast({ type: 'market_update', data });
}

/**
 * 推送Agent决策
 */
export function pushAgentDecision(data: AgentDecisionEvent['data']): void {
    broadcast({ type: 'agent_decision', data });
}

/**
 * 推送交易执行通知
 */
export function pushTradeExecuted(data: TradeExecutedEvent['data']): void {
    broadcast({ type: 'trade_executed', data });
}

/**
 * 推送账户指标更新
 */
export function pushMetricsUpdate(data: MetricsUpdateEvent['data']): void {
    broadcast({ type: 'metrics_update', data });
}

/**
 * 推送系统状态
 */
export function pushSystemStatus(data: SystemStatusEvent['data']): void {
    broadcast({ type: 'system_status', data });
}

/**
 * 获取连接统计
 */
export async function getConnectionStats(): Promise<{
    totalConnections: number;
    rooms: string[];
}> {
    if (!io) {
        return { totalConnections: 0, rooms: [] };
    }

    const sockets = await io.fetchSockets();
    const rooms = Array.from(io.sockets.adapter.rooms.keys());

    return {
        totalConnections: sockets.length,
        rooms: rooms.filter(room => !sockets.some(s => s.id === room)) // 排除socket自身的room
    };
}
