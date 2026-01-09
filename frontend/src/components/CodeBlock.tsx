import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
        <div className="rounded-lg overflow-hidden my-4 border border-border-dark/50 shadow-xl bg-[#1e1e1e]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-white/5">
                <span className="text-xs font-mono text-gray-400 capitalize flex items-center gap-2">
                    {fileName && <span className="material-symbols-outlined text-[14px]">description</span>}
                    {fileName || language}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined text-[14px]">
                        {copied ? 'check' : 'content_copy'}
                    </span>
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <div className="relative group">
                <SyntaxHighlighter
                    language={language || 'text'}
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                        backgroundColor: '#1e1e1e'
                    }}
                    showLineNumbers={true}
                    wrapLines={true}
                >
                    {children}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};
