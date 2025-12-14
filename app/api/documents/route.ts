/**
 * API: 获取分析文档列表和内容
 * 支持查看 app/pdf 目录下的所有文档
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

// 文档目录
const DOCUMENTS_DIR = path.join(process.cwd(), "app/pdf");

export const GET = async (request: NextRequest) => {
    try {
        const { searchParams } = new URL(request.url);
        const fileName = searchParams.get("file");

        // 确保目录存在
        if (!fs.existsSync(DOCUMENTS_DIR)) {
            return NextResponse.json({
                success: true,
                data: { files: [], content: null },
            });
        }

        // 如果请求特定文件内容
        if (fileName) {
            const filePath = path.join(DOCUMENTS_DIR, fileName);

            // 安全检查：防止路径遍历
            if (!filePath.startsWith(DOCUMENTS_DIR)) {
                return NextResponse.json(
                    { success: false, error: "Invalid file path" },
                    { status: 400 }
                );
            }

            if (!fs.existsSync(filePath)) {
                return NextResponse.json(
                    { success: false, error: "File not found" },
                    { status: 404 }
                );
            }

            const content = fs.readFileSync(filePath, "utf-8");
            const stats = fs.statSync(filePath);

            return NextResponse.json({
                success: true,
                data: {
                    fileName,
                    content,
                    size: stats.size,
                    modifiedAt: stats.mtime.toISOString(),
                },
            });
        }

        // 列出所有文件
        const files = fs.readdirSync(DOCUMENTS_DIR)
            .filter(f => {
                const ext = path.extname(f).toLowerCase();
                return [".txt", ".html", ".md", ".json"].includes(ext);
            })
            .map(f => {
                const filePath = path.join(DOCUMENTS_DIR, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    size: stats.size,
                    modifiedAt: stats.mtime.toISOString(),
                    type: path.extname(f).replace(".", "").toUpperCase(),
                };
            })
            .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

        return NextResponse.json({
            success: true,
            data: { files },
        });
    } catch (error) {
        console.error("Failed to fetch documents:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
};
