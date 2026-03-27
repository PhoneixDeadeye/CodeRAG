import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy, Terminal } from 'lucide-react';

interface CodeBlockProps {
    language: string;
    children: string;
    fileName?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, children, fileName }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-none overflow-hidden my-4 border border-border-default bg-bg-surface group/code relative">
            {/* Brutalist Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated border-b border-border-default">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-6 bg-black border border-border-default">
                        <Terminal className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs font-bold text-text-primary font-mono uppercase tracking-wider">
                        {fileName || language || 'CODE_SNIPPET'}
                    </span>
                </div>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1.5 bg-black hover:bg-primary border border-border-default hover:border-primary text-xs font-bold text-text-secondary hover:text-black transition-all rounded-none uppercase font-mono group/btn"
                >
                    {copied ? (
                        <Check className="w-3.5 h-3.5" />
                    ) : (
                        <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copied ? 'COPIED' : 'COPY'}</span>
                </button>
            </div>

            {/* Code Content */}
            <div className="relative border-l-2 border-primary/0 group-hover/code:border-primary/100 transition-colors duration-300">
                <SyntaxHighlighter
                    language={language || 'text'}
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        backgroundColor: '#050505', // Match bg-dark
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                    }}
                    showLineNumbers={true}
                    lineNumberStyle={{ minWidth: '3em', paddingRight: '1em', color: '#333333', textAlign: 'right' }}
                    wrapLines={true}
                >
                    {children}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};
