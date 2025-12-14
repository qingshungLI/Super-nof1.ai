/**
 * 自定义 Next.js 服务器
 * 集成 Socket.io WebSocket 支持
 * 
 * 注意: 此服务器用于生产环境
 * 开发环境请使用 npm run dev 并通过 instrumentation.ts 初始化 WebSocket
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketServer } from './lib/websocket/socket-server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
    const app = next({ dev, hostname, port });
    const handle = app.getRequestHandler();

    await app.prepare();

    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url!, true);
        handle(req, res, parsedUrl);
    });

    // 初始化 Socket.io
    const io = initSocketServer(httpServer);

    // 将 io 实例挂载到全局
    (global as any).io = io;

    httpServer.listen(port, () => {
        console.log(`
🚀 Super-NOF1.AI 服务器已启动
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 HTTP:      http://${hostname}:${port}
⚡ WebSocket: ws://${hostname}:${port}
🌍 环境:      ${dev ? '开发模式' : '生产模式'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `);
    });
}

main().catch((err) => {
    console.error('❌ 服务器启动失败:', err);
    process.exit(1);
});
