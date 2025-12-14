/**
 * 实时连接状态指示器组件
 */

'use client';

import { useWebSocket, ConnectionStatus } from '@/lib/websocket/use-websocket';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export function ConnectionStatusIndicator({ showLabel = true, size = 'md' }: ConnectionStatusProps) {
    const { status, isConnected } = useWebSocket();

    const sizeClasses = {
        sm: 'w-2 h-2',
        md: 'w-3 h-3',
        lg: 'w-4 h-4'
    };

    const iconSizes = {
        sm: 12,
        md: 16,
        lg: 20
    };

    const statusConfig: Record<ConnectionStatus, {
        color: string;
        label: string;
        icon: React.ReactNode;
        pulse: boolean;
    }> = {
        connecting: {
            color: 'bg-yellow-500',
            label: '连接中...',
            icon: <Loader2 className="animate-spin" size={iconSizes[size]} />,
            pulse: true
        },
        connected: {
            color: 'bg-green-500',
            label: '实时连接',
            icon: <Wifi size={iconSizes[size]} />,
            pulse: false
        },
        disconnected: {
            color: 'bg-gray-500',
            label: '已断开',
            icon: <WifiOff size={iconSizes[size]} />,
            pulse: false
        },
        error: {
            color: 'bg-red-500',
            label: '连接错误',
            icon: <WifiOff size={iconSizes[size]} />,
            pulse: true
        }
    };

    const config = statusConfig[status];

    return (
        <div className="flex items-center gap-2">
            <div className="relative">
                <div className={`${sizeClasses[size]} rounded-full ${config.color}`} />
                {config.pulse && (
                    <div className={`absolute inset-0 ${sizeClasses[size]} rounded-full ${config.color} animate-ping opacity-75`} />
                )}
            </div>
            {showLabel && (
                <span className={`text-${size === 'sm' ? 'xs' : size === 'md' ? 'sm' : 'base'} text-muted-foreground flex items-center gap-1`}>
                    {config.icon}
                    {config.label}
                </span>
            )}
        </div>
    );
}

/**
 * 迷你版状态指示器 (只显示圆点)
 */
export function MiniConnectionStatus() {
    return <ConnectionStatusIndicator showLabel={false} size="sm" />;
}
