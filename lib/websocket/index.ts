/**
 * WebSocket 模块统一导出
 */

// 服务端
export {
    initSocketServer,
    getSocketServer,
    broadcast,
    broadcastToChannel,
    pushMarketUpdate,
    pushAgentDecision,
    pushTradeExecuted,
    pushMetricsUpdate,
    pushSystemStatus,
    getConnectionStats
} from './socket-server';

// 客户端 Hooks
export {
    useWebSocket,
    useMarketData,
    useMetrics,
    useLatestDecision
} from './use-websocket';

// 类型
export type {
    MarketData,
    AgentDecision,
    TradeExecuted,
    MetricsData,
    SystemStatus,
    ConnectionStatus,
    UseWebSocketReturn
} from './use-websocket';
