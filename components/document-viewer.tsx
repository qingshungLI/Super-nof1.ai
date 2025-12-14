"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FolderOpen, X, ChevronRight, FileCode, FileJson } from "lucide-react";

interface DocumentFile {
    name: string;
    size: number;
    modifiedAt: string;
    type: string;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
    TXT: <FileText className="w-4 h-4 text-blue-500" />,
    HTML: <FileCode className="w-4 h-4 text-orange-500" />,
    JSON: <FileJson className="w-4 h-4 text-yellow-500" />,
    MD: <FileText className="w-4 h-4 text-purple-500" />,
};

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentViewer() {
    const [files, setFiles] = useState<DocumentFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [contentLoading, setContentLoading] = useState(false);

    const fetchFiles = useCallback(async () => {
        try {
            const response = await fetch("/api/documents");
            if (!response.ok) return;

            const result = await response.json();
            if (result.success && result.data) {
                setFiles(result.data.files || []);
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching documents:", err);
            setLoading(false);
        }
    }, []);

    const fetchFileContent = useCallback(async (fileName: string) => {
        setContentLoading(true);
        try {
            const response = await fetch(`/api/documents?file=${encodeURIComponent(fileName)}`);
            if (!response.ok) return;

            const result = await response.json();
            if (result.success && result.data) {
                setFileContent(result.data.content || "");
                setSelectedFile(fileName);
            }
        } catch (err) {
            console.error("Error fetching file content:", err);
        } finally {
            setContentLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const renderFileList = () => (
        <div className="space-y-1">
            {files.map((file) => (
                <button
                    key={file.name}
                    onClick={() => fetchFileContent(file.name)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${selectedFile === file.name
                            ? 'bg-primary/10 border border-primary/30'
                            : 'hover:bg-muted/50'
                        }`}
                >
                    {FILE_ICONS[file.type] || <FileText className="w-4 h-4" />}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)} • {new Date(file.modifiedAt).toLocaleDateString()}
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
            ))}
        </div>
    );

    const renderContent = () => {
        if (!selectedFile) {
            return (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                        <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">选择文件查看内容</p>
                    </div>
                </div>
            );
        }

        if (contentLoading) {
            return (
                <div className="h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
            );
        }

        const isHTML = selectedFile.endsWith('.html');

        return (
            <div className="h-full flex flex-col">
                {/* File Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                        {FILE_ICONS[selectedFile.split('.').pop()?.toUpperCase() || ''] || <FileText className="w-4 h-4" />}
                        <span className="text-sm font-medium">{selectedFile}</span>
                    </div>
                    <button
                        onClick={() => { setSelectedFile(null); setFileContent(""); }}
                        className="p-1 hover:bg-muted rounded"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* File Content */}
                <div className="flex-1 overflow-auto p-3">
                    {isHTML ? (
                        <div
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: fileContent }}
                        />
                    ) : (
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                            {fileContent}
                        </pre>
                    )}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <Card className="h-full">
                <CardContent className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-2 flex-shrink-0 border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                    <FolderOpen className="w-5 h-5 text-amber-500" />
                    分析文档
                    <span className="text-xs text-muted-foreground font-normal ml-auto">
                        {files.length} 个文件
                    </span>
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 flex overflow-hidden p-0">
                {/* File List - Left Side */}
                <div className="w-48 border-r p-2 overflow-y-auto flex-shrink-0">
                    {files.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground">
                            暂无文档
                        </div>
                    ) : (
                        renderFileList()
                    )}
                </div>

                {/* Content - Right Side */}
                <div className="flex-1 overflow-hidden">
                    {renderContent()}
                </div>
            </CardContent>
        </Card>
    );
}
