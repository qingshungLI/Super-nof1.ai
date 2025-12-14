/**
 * 每日市场报告生成任务
 * 每天凌晨5点执行，生成加密货币市场分析报告
 */

import { generateDailyMarketReport } from '@/lib/ai/gemini-search';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const CRON_SECRET = process.env.CRON_SECRET_KEY || 'your-secret-key-change-this';

/**
 * POST /api/cron/daily-market-report
 * 生成每日市场分析报告
 */
export async function POST(req: Request) {
    try {
        // 验证 cron token
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.substring(7);
        try {
            jwt.verify(token, CRON_SECRET);
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        console.log('\n📊 [Daily Market Report] 开始生成每日市场报告...');
        console.log(`⏰ 执行时间: ${new Date().toLocaleString('zh-CN')}`);

        // 要分析的币种
        const symbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB'];

        // 生成报告
        const startTime = Date.now();
        const report = await generateDailyMarketReport(symbols);
        const duration = Date.now() - startTime;

        console.log(`✅ [Daily Market Report] 报告生成完成，耗时 ${duration}ms`);

        // 保存到文件
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const filename = `${year}_${month}_${day}.txt`;

        // 确保目录存在
        const reportDir = join(process.cwd(), 'app', 'pdf');
        await mkdir(reportDir, { recursive: true });

        // 写入文件
        const filepath = join(reportDir, filename);
        await writeFile(filepath, report, 'utf-8');

        console.log(`💾 [Daily Market Report] 报告已保存: ${filename}`);
        console.log(`📁 文件路径: ${filepath}`);
        console.log(`📝 报告长度: ${report.length} 字符\n`);

        return NextResponse.json({
            success: true,
            message: 'Daily market report generated successfully',
            filename,
            filepath,
            reportLength: report.length,
            duration,
            timestamp: date.toISOString()
        });

    } catch (error: any) {
        console.error('❌ [Daily Market Report] 生成失败:', error);
        return NextResponse.json(
            {
                error: 'Failed to generate report',
                message: error.message,
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

/**
 * GET /api/cron/daily-market-report
 * 手动触发（用于测试）
 */
export async function GET(req: Request) {
    // 允许手动触发（无需token验证，仅用于测试）
    console.log('🧪 [Daily Market Report] 手动触发测试...');

    try {
        const symbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB'];
        const report = await generateDailyMarketReport(symbols);

        const date = new Date();
        const filename = `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}_${String(date.getDate()).padStart(2, '0')}.txt`;

        const reportDir = join(process.cwd(), 'app', 'pdf');
        await mkdir(reportDir, { recursive: true });

        const filepath = join(reportDir, filename);
        await writeFile(filepath, report, 'utf-8');

        return NextResponse.json({
            success: true,
            message: 'Test report generated',
            filename,
            preview: report.substring(0, 500) + '...',
            fullLength: report.length
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
