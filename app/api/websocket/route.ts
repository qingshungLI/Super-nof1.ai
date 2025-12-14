/**
 * WebSocket API 端点
 * 用于检查 WebSocket 状态和手动触发推送
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    getSocketServer,
    getConnectionStats,
    pushMarketUpdate,
    pushSystemStatus
} from '@/lib/websocket/socket-server';

export async function GET(request: NextRequest) {
    try {
        const stats = await getConnectionStats();

        return NextResponse.json({
            success: true,
            data: {
                status: stats.totalConnections > 0 ? 'active' : 'no_connections',
                connections: stats.totalConnections,
                rooms: stats.rooms,
                timestamp: Date.now()
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// POST 用于手动触发推送 (测试/调试用)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { type, data } = body;

        switch (type) {
            case 'system_status':
                pushSystemStatus(data);
                break;
            case 'market_update':
                pushMarketUpdate(data);
                break;
            default:
                return NextResponse.json({
                    success: false,
                    error: `Unknown event type: ${type}`
                }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: `Event ${type} pushed successfully`
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
