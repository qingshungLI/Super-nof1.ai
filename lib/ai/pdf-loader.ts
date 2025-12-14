/**
 * 文档加载器
 * 用于读取市场分析(HTML)和情绪分析(TXT)文档，并提供缓存机制
 */

import fs from 'fs';
import path from 'path';

/**
 * 文档缓存结构
 */
interface DocumentCache {
    content: string;
    timestamp: number;
    filePath: string;
}

/**
 * 文档缓存存储（内存级别，1小时过期）
 */
const documentCache: Map<string, DocumentCache> = new Map();

/**
 * 缓存过期时间（毫秒）
 */
const CACHE_EXPIRY = 60 * 60 * 1000; // 1小时

/**
 * 获取当前日期的文档文件名
 * @returns { txt: string, html: string } 文件名（不含路径）
 */
function getCurrentDocumentNames(): { txt: string; html: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return {
        txt: `${year}_${month}_${day}.txt`,      // 例: 2025_11_24.txt
        html: `${year}${month}${day}.html`       // 例: 20251124.html
    };
}

/**
 * 从缓存或文件系统读取文档内容
 * 
 * @param filePath 文档文件路径
 * @returns 文档内容（文本格式）
 */
export async function loadDocument(filePath: string): Promise<string> {
    const now = Date.now();

    // 检查缓存
    const cached = documentCache.get(filePath);
    if (cached && (now - cached.timestamp) < CACHE_EXPIRY) {
        console.log(`📄 文档缓存命中: ${path.basename(filePath)}`);
        return cached.content;
    }

    // 检查文件是否存在
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ 文档文件不存在: ${fullPath}`);
        // 返回占位内容
        return generatePlaceholderContent(filePath);
    }

    try {
        // 读取文件内容
        const content = fs.readFileSync(fullPath, 'utf-8');

        // 缓存内容
        documentCache.set(filePath, {
            content,
            timestamp: now,
            filePath: fullPath
        });

        console.log(`✅ 文档加载成功: ${path.basename(filePath)} (${content.length} 字符)`);
        return content;
    } catch (error: any) {
        console.error(`❌ 文档读取失败: ${filePath}`, error.message);
        return generatePlaceholderContent(filePath);
    }
}

/**
 * 生成占位内容（当文档不存在时）
 */
function generatePlaceholderContent(filePath: string): string {
    if (filePath.endsWith('.html') || filePath.includes('market')) {
        return `# 市场分析报告 (占位内容)

## 当前市场环境
- BTC正处于关键技术位，需关注支撑/阻力
- 宏观经济环境：美联储政策、通胀数据影响
- 链上数据显示大户持仓变化

## 行业趋势
- DeFi/NFT/GameFi等板块热度分析
- 监管动态与合规进展

## 基本面分析
- 项目开发进度
- 社区活跃度
- 技术创新评估

**注意：这是占位内容，请上传真实文档到 ${filePath}**
`;
    }

    if (filePath.endsWith('.txt') || filePath.includes('mood')) {
        return `# 市场情绪分析报告 (占位内容)

## 社交媒体情绪
- Twitter/Reddit讨论热度：中性偏多
- KOL观点：分歧较大
- FOMO指数：适中

## 新闻舆情
- 主流媒体报道倾向
- 负面/正面新闻比例
- 突发事件影响

## 恐慌贪婪指数
- 当前值：50 (中性)
- 历史对比：接近均值
- 极端情绪警示

**注意：这是占位内容，请上传真实文档到 ${filePath}**
`;
    }

    return `# 文档占位内容\n\n文件路径: ${filePath}\n\n请上传实际内容。`;
}

/**
 * 批量加载文档文件（使用当前日期）
 */
export async function loadAllDocuments(): Promise<{
    marketAnalysis: string;
    moodAnalysis: string;
}> {
    const docNames = getCurrentDocumentNames();

    // 支持环境变量覆盖路径
    const baseDir = process.env.DOCUMENTS_DIR || 'app/pdf';
    const htmlPath = process.env.MARKET_ANALYSIS_HTML || path.join(baseDir, docNames.html);
    const txtPath = process.env.MOOD_ANALYSIS_TXT || path.join(baseDir, docNames.txt);

    const [marketAnalysis, moodAnalysis] = await Promise.all([
        loadDocument(htmlPath),
        loadDocument(txtPath)
    ]);

    return {
        marketAnalysis,
        moodAnalysis
    };
}

/**
 * 向后兼容：保留旧函数名
 * @deprecated 请使用 loadAllDocuments
 */
export async function loadAllPDFs(): Promise<{
    marketAnalysis: string;
    moodAnalysis: string;
}> {
    console.warn('⚠️ loadAllPDFs() 已废弃，请使用 loadAllDocuments()');
    return loadAllDocuments();
}

/**
 * 清除文档缓存
 */
export function clearDocumentCache(): void {
    documentCache.clear();
    console.log('🗑️ 文档缓存已清除');
}

/**
 * 向后兼容
 * @deprecated 请使用 clearDocumentCache
 */
export function clearPDFCache(): void {
    clearDocumentCache();
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): {
    size: number;
    entries: Array<{ path: string; age: number }>
} {
    const now = Date.now();
    const entries = Array.from(documentCache.entries()).map(([path, cache]) => ({
        path: path,
        age: Math.floor((now - cache.timestamp) / 1000) // 秒
    }));

    return {
        size: documentCache.size,
        entries
    };
}
