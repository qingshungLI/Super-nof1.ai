/**
 * Agent Forum 测试脚本
 * 用于诊断多Agent系统问题
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function testAgentForum() {
    console.log('🔍 开始 Agent Forum 诊断...\n');

    // 1. 检查环境变量
    console.log('📋 检查 API Keys:');
    const keys = {
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        QWEN_API_KEY: process.env.QWEN_API_KEY,
        KIMI_API_KEY: process.env.KIMI_API_KEY
    };

    for (const [name, value] of Object.entries(keys)) {
        const status = value && value.length > 10 ? '✅' : '❌';
        console.log(`   ${status} ${name}: ${value ? `${value.substring(0, 10)}...` : '未设置'}`);
    }

    // 2. 测试单个 Agent API 调用
    console.log('\n📡 测试 API 连接:');

    // 测试 DeepSeek
    console.log('\n   Testing DeepSeek...');
    try {
        const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: 'Say "OK" if you receive this.' }],
                max_tokens: 10
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (deepseekRes.ok) {
            const data = await deepseekRes.json();
            console.log(`   ✅ DeepSeek: ${data.choices?.[0]?.message?.content || 'OK'}`);
        } else {
            const errorText = await deepseekRes.text();
            console.log(`   ❌ DeepSeek: HTTP ${deepseekRes.status} - ${errorText.substring(0, 100)}`);
        }
    } catch (err: any) {
        console.log(`   ❌ DeepSeek: ${err.message}`);
    }

    // 测试 Gemini
    console.log('\n   Testing Gemini...');
    try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Say "OK" if you receive this.' }] }]
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (geminiRes.ok) {
            const data = await geminiRes.json();
            console.log(`   ✅ Gemini: ${data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK'}`);
        } else {
            const errorText = await geminiRes.text();
            console.log(`   ❌ Gemini: HTTP ${geminiRes.status} - ${errorText.substring(0, 100)}`);
        }
    } catch (err: any) {
        console.log(`   ❌ Gemini: ${err.message}`);
    }

    // 测试 Qwen (DashScope)
    console.log('\n   Testing Qwen...');
    try {
        const qwenRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.QWEN_API_KEY}`
            },
            body: JSON.stringify({
                model: 'qwen-turbo',
                input: {
                    messages: [{ role: 'user', content: 'Say "OK" if you receive this.' }]
                }
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (qwenRes.ok) {
            const data = await qwenRes.json();
            console.log(`   ✅ Qwen: ${data.output?.text || data.output?.choices?.[0]?.message?.content || 'OK'}`);
        } else {
            const errorText = await qwenRes.text();
            console.log(`   ❌ Qwen: HTTP ${qwenRes.status} - ${errorText.substring(0, 100)}`);
        }
    } catch (err: any) {
        console.log(`   ❌ Qwen: ${err.message}`);
    }

    // 测试 Kimi (Moonshot)
    console.log('\n   Testing Kimi...');
    try {
        const kimiRes = await fetch('https://api.moonshot.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'moonshot-v1-8k',
                messages: [{ role: 'user', content: 'Say "OK" if you receive this.' }],
                max_tokens: 10
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (kimiRes.ok) {
            const data = await kimiRes.json();
            console.log(`   ✅ Kimi: ${data.choices?.[0]?.message?.content || 'OK'}`);
        } else {
            const errorText = await kimiRes.text();
            console.log(`   ❌ Kimi: HTTP ${kimiRes.status} - ${errorText.substring(0, 100)}`);
        }
    } catch (err: any) {
        console.log(`   ❌ Kimi: ${err.message}`);
    }

    // 3. 测试文档加载
    console.log('\n📄 测试文档加载:');
    try {
        const { loadAllDocuments } = await import('../lib/ai/pdf-loader');
        const docs = await loadAllDocuments();
        console.log(`   ✅ marketAnalysis: ${docs.marketAnalysis.length} 字符`);
        console.log(`   ✅ moodAnalysis: ${docs.moodAnalysis.length} 字符`);

        if (docs.marketAnalysis.includes('占位内容')) {
            console.log('   ⚠️ 警告: marketAnalysis 使用的是占位内容');
        }
        if (docs.moodAnalysis.includes('占位内容')) {
            console.log('   ⚠️ 警告: moodAnalysis 使用的是占位内容');
        }
    } catch (err: any) {
        console.log(`   ❌ 文档加载失败: ${err.message}`);
    }

    // 4. 测试数据库连接
    console.log('\n💾 测试数据库连接:');
    try {
        const { prisma } = await import('../lib/prisma');
        const count = await prisma.tradingDecision.count();
        console.log(`   ✅ 数据库连接成功，已有 ${count} 条决策记录`);
    } catch (err: any) {
        console.log(`   ❌ 数据库连接失败: ${err.message}`);
    }

    // 5. 测试市场数据获取
    console.log('\n📊 测试市场数据获取:');
    try {
        const { getCurrentMarketState } = await import('../lib/trading/current-market-state');
        const btcData = await getCurrentMarketState('BTC/USDT');
        console.log(`   ✅ BTC/USDT 当前价格: $${btcData.current_price}`);
    } catch (err: any) {
        console.log(`   ❌ 市场数据获取失败: ${err.message}`);
    }

    console.log('\n🎯 诊断完成\n');
}

// 运行测试
testAgentForum().catch(console.error);
