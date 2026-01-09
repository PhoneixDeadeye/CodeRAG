import React, { useRef, useEffect, useState } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { FileContentResponse } from '../lib/api';

interface CodeViewerProps {
    file: FileContentResponse | null;
    highlightLines?: number[];
    onClose: () => void;
    onExplainCode?: (code: string, context: string) => void;
    onGenerateTests?: (code: string, filePath: string) => void;
    onGenerateDocs?: (code: string, filePath: string) => void;
    onShowDependencies?: (filePath: string) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
    file,
    highlightLines = [],
    onClose,
    onExplainCode,
    onGenerateTests,
    onGenerateDocs,
    onShowDependencies
}) => {
    const [copied, setCopied] = useState(false);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    // Handle editor mount
    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Add "Explain This" context menu action
        editor.addAction({
            id: 'explain-code',
            label: '✨ Explain This Code',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1,
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE],
            run: (ed: editor.ICodeEditor) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const selectedText = ed.getModel()?.getValueInRange(selection);
                if (selectedText && onExplainCode) {
                    onExplainCode(selectedText, file?.path || 'selected code');
                }
            }
        });

        // Add "Generate Tests" context menu action
        editor.addAction({
            id: 'generate-tests',
            label: '🧪 Generate Unit Tests',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 2,
            run: (ed: editor.ICodeEditor) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const selectedText = ed.getModel()?.getValueInRange(selection);
                if (selectedText && onGenerateTests) {
                    onGenerateTests(selectedText, file?.path || '');
                }
            }
        });

        // Add "Generate Docs" context menu action
        editor.addAction({
            id: 'generate-docs',
            label: '📝 Generate Documentation',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 3,
            run: (ed: editor.ICodeEditor) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const selectedText = ed.getModel()?.getValueInRange(selection);
                if (selectedText && onGenerateDocs) {
                    onGenerateDocs(selectedText, file?.path || '');
                }
            }
        });

        // Highlight lines if specified
        if (highlightLines.length > 0) {
            const decorations = highlightLines.map(line => ({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    isWholeLine: true,
                    className: 'highlighted-line',
                    glyphMarginClassName: 'highlighted-glyph'
                }
            }));
            editor.deltaDecorations([], decorations);

            // Scroll to first highlighted line
            editor.revealLineInCenter(Math.min(...highlightLines));
        }
    };

    // Update highlights when they change
    useEffect(() => {
        if (editorRef.current && monacoRef.current && highlightLines.length > 0) {
            const monaco = monacoRef.current;
            const decorations = highlightLines.map(line => ({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    isWholeLine: true,
                    className: 'highlighted-line',
                    glyphMarginClassName: 'highlighted-glyph'
                }
            }));
            editorRef.current.deltaDecorations([], decorations);
            editorRef.current.revealLineInCenter(Math.min(...highlightLines));
        }
    }, [highlightLines]);

    const copyToClipboard = async () => {
        if (file) {
            await navigator.clipboard.writeText(file.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const getMonacoLanguage = (lang: string): string => {
        const langMap: Record<string, string> = {
            'python': 'python',
            'javascript': 'javascript',
            'typescript': 'typescript',
            'java': 'java',
            'go': 'go',
            'rust': 'rust',
            'cpp': 'cpp',
            'c': 'c',
            'text': 'plaintext'
        };
        return langMap[lang] || 'plaintext';
    };

    if (!file) {
        return (
            <div className="h-full flex items-center justify-center bg-[#0b0f17]">
                <div className="text-center space-y-4 animate-fade-in">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-text-secondary/10 rounded-full blur-xl" />
                        <div className="relative p-4 bg-border-dark rounded-2xl border border-border-dark">
                            <span className="material-symbols-outlined text-[40px] text-text-secondary">code</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-medium text-text-secondary">No file selected</p>
                        <p className="text-sm text-text-secondary/70 max-w-xs mx-auto">
                            Click a file in the explorer or a source citation to view it here
                        </p>
                    </div>
                    <div className="text-xs text-text-secondary/70 mt-4">
                        <p>💡 Tip: Right-click code for AI features:</p>
                        <ul className="mt-2 space-y-1">
                            <li>✨ Explain This Code</li>
                            <li>🧪 Generate Unit Tests</li>
                            <li>📝 Generate Documentation</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    const lineCount = file.content.split('\n').length;
    const fileSize = (new Blob([file.content]).size / 1024).toFixed(1);
    const pathParts = file.path.split('/');
    const fileName = pathParts.pop() || '';

    return (
        <div className="h-full flex flex-col bg-[#0b0f17]">
            {/* Breadcrumb Navigation */}
            <div className="h-12 border-b border-border-dark flex items-center justify-between px-6 bg-sidebar-dark shrink-0">
                <nav className="flex items-center text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    {pathParts.map((part, index) => (
                        <span key={index} className="flex items-center">
                            <span className="text-[#92a4c9] hover:text-white transition-colors cursor-pointer">{part}</span>
                            <span className="mx-2 text-[#566585]">/</span>
                        </span>
                    ))}
                    <span className="text-white bg-[#232f48] px-2 py-0.5 rounded border border-[#3a4b6e]">{fileName}</span>
                </nav>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-transparent hover:bg-[#232f48] text-[#92a4c9] hover:text-white transition-colors text-sm font-medium">
                        <span className="material-symbols-outlined text-[18px]">history</span>
                        <span className="hidden lg:inline">History</span>
                    </button>
                    <button
                        onClick={() => onExplainCode?.(file.content, file.path)}
                        className="flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 transition-all"
                    >
                        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                        <span className="hidden lg:inline">Ask AI</span>
                    </button>
                </div>
            </div>

            {/* File Toolbar */}
            <div className="h-12 border-b border-border-dark flex items-center justify-between px-6 bg-sidebar-dark/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-[#3178c6]">description</span>
                    <div className="flex flex-col justify-center">
                        <span className="text-white text-sm font-bold leading-none">{fileName}</span>
                        <span className="text-[#92a4c9] text-[10px] mt-0.5">{fileSize} KB • {file.language} • {lineCount} lines</span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={copyToClipboard}
                        className="p-1.5 rounded text-[#92a4c9] hover:text-white hover:bg-[#232f48] transition-colors"
                        title="Copy Content"
                    >
                        <span className="material-symbols-outlined text-[20px]">
                            {copied ? 'check' : 'content_copy'}
                        </span>
                    </button>
                    {(file.language === 'python' || file.language === 'javascript' || file.language === 'typescript') && (
                        <button
                            onClick={() => onShowDependencies?.(file.path)}
                            className="p-1.5 rounded text-[#92a4c9] hover:text-purple-400 hover:bg-[#232f48] transition-colors"
                            title="Show Dependencies"
                        >
                            <span className="material-symbols-outlined text-[20px]">account_tree</span>
                        </button>
                    )}
                    {file.github_link && (
                        <a
                            href={file.github_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded text-[#92a4c9] hover:text-white hover:bg-[#232f48] transition-colors"
                            title="Open in GitHub"
                        >
                            <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                        </a>
                    )}
                    <button
                        onClick={() => onExplainCode?.(file.content, file.path)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded ml-2 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-bold uppercase tracking-wide"
                    >
                        <span className="material-symbols-outlined text-[16px]">psychology</span>
                        Explain
                    </button>
                    <div className="w-px h-4 bg-border-dark mx-1" />
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded text-[#92a4c9] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Close"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden relative">
                <Editor
                    height="100%"
                    language={getMonacoLanguage(file.language)}
                    value={file.content}
                    theme="vs-dark"
                    onMount={handleEditorDidMount}
                    options={{
                        readOnly: true,
                        minimap: { enabled: true },
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'off',
                        folding: true,
                        glyphMargin: true,
                        contextmenu: true,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        renderLineHighlight: 'all',
                    }}
                />

                {/* Floating AI Action Button */}
                <div className="absolute bottom-6 right-8">
                    <button
                        onClick={() => onExplainCode?.(file.content, file.path)}
                        className="flex items-center gap-3 bg-primary hover:bg-primary/90 text-white px-5 py-3 rounded-full shadow-xl shadow-black/50 transition-transform hover:scale-105 active:scale-95 group"
                    >
                        <span className="material-symbols-outlined text-[24px] animate-pulse">chat</span>
                        <span className="font-bold pr-1">Ask about this file</span>
                    </button>
                </div>
            </div>

            {/* Status Bar */}
            <footer className="h-8 bg-primary border-t border-primary flex items-center justify-between px-4 text-white text-xs select-none">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">
                        <span className="material-symbols-outlined text-[14px]">source</span>
                        <span className="font-medium">main</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="font-medium px-2 py-0.5 rounded bg-white/10 uppercase tracking-tighter">
                        {file.language}
                    </span>
                    {highlightLines.length > 0 && (
                        <span className="hover:bg-white/10 px-2 py-0.5 rounded">
                            L{Math.min(...highlightLines)}-L{Math.max(...highlightLines)}
                        </span>
                    )}
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">UTF-8</span>
                    <span className="material-symbols-outlined text-[14px] hover:bg-white/10 p-0.5 rounded cursor-pointer">notifications</span>
                </div>
            </footer>
        </div>
    );
};
