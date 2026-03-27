import React, { useRef, useEffect, useState } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { FileCode, MessageSquare, TestTube, Check, Copy, X, FileText, Bot } from 'lucide-react';
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
    onGenerateDocs
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

    const handleCopy = async () => {
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
            <div className="h-full flex items-center justify-center bg-bg-base">
                <div className="text-center space-y-4 animate-fade-in flex flex-col items-center">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-primary/20 blur-xl" />
                        <div className="relative p-6 bg-black border border-primary shadow-[4px_4px_0px_0px_rgba(204,255,0,0.2)]">
                            <FileCode className="w-12 h-12 text-primary" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xl font-bold text-white font-display uppercase tracking-tight">NO_FILE_SELECTED</p>
                        <p className="text-sm text-text-muted font-mono max-w-xs mx-auto">
                            SELECT_FILE_FROM_EXPLORER_OR_CITATION
                        </p>
                    </div>
                    <div className="text-xs text-text-secondary mt-8 font-mono border border-border-default p-4 bg-bg-surface w-full max-w-sm text-left">
                        <p className="border-b border-border-default pb-2 mb-2 font-bold text-primary uppercase">// AVAILABLE_ACTIONS</p>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2">
                                <MessageSquare className="w-3 h-3" />
                                <span>EXPLAIN_CODE</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <TestTube className="w-3 h-3" />
                                <span>GEN_UNIT_TESTS</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FileText className="w-3 h-3" />
                                <span>GEN_DOCUMENTATION</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-bg-base">
            {/* File Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-border-default">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 bg-primary border border-primary text-black">
                        <FileCode className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider font-mono">Viewing_File:</span>
                        <span className="text-sm font-bold text-white truncate font-mono" title={file.path}>
                            {file.path.split('/').pop()}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Explain Code */}
                    <button
                        onClick={() => onExplainCode?.(file.content, file.path)}
                        className="p-2 text-text-secondary hover:text-primary hover:bg-bg-elevated transition-colors border border-transparent hover:border-primary rounded-none"
                        title="EXPLAIN_CODE"
                    >
                        <MessageSquare className="w-4 h-4" />
                    </button>

                    {/* Generate Tests */}
                    <button
                        onClick={() => onGenerateTests?.(file.content, file.path)}
                        className="p-2 text-text-secondary hover:text-primary hover:bg-bg-elevated transition-colors border border-transparent hover:border-primary rounded-none"
                        title="GEN_TESTS"
                    >
                        <TestTube className="w-4 h-4" />
                    </button>

                    {/* Copy Code */}
                    <button
                        onClick={handleCopy}
                        className="p-2 text-text-secondary hover:text-white hover:bg-bg-elevated transition-colors border border-transparent hover:border-white rounded-none"
                        title="COPY_SOURCE"
                    >
                        {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                    </button>

                    <button
                        onClick={onClose}
                        className="p-2 text-text-secondary hover:text-accent-rose hover:bg-accent-rose/10 transition-colors border border-transparent hover:border-accent-rose rounded-none ml-2"
                        title="CLOSE_VIEWER"
                    >
                        <X className="w-4 h-4" />
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
                        className="flex items-center gap-3 bg-primary hover:bg-white text-black px-6 py-3 border border-primary hover:border-white shadow-[4px_4px_0px_0px_black] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all group rounded-none"
                    >
                        <Bot className="w-5 h-5 text-black" />
                        <span className="font-bold font-mono uppercase tracking-tight">ASK_ABOUT_FILE</span>
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
