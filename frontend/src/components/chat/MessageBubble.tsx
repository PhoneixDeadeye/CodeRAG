import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '../CodeBlock';
import { type SourceDocument } from '../../lib/api';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: SourceDocument[];
    timestamp?: number;
}

export const MessageSkeleton = () => (
    <div className="flex w-full gap-4 max-w-4xl animate-pulse">
        <div className="shrink-0 size-8 rounded-lg bg-gradient-to-br from-indigo-500/50 to-purple-600/50 flex items-center justify-center opacity-70">
            <span className="material-symbols-outlined text-white text-[18px]">smart_toy</span>
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary font-medium">Analyzing codebase...</span>
            </div>
            <div className="h-2 w-32 bg-border-dark rounded-full"></div>
        </div>
    </div>
);

interface MessageBubbleProps {
    message: Message;
    index: number;
    formatTime: (timestamp?: number) => string;
    onSourceClick: (source: SourceDocument, highlightLines?: number[]) => void;
    onFeedback: (index: number, isPositive: boolean) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    index,
    formatTime,
    onSourceClick,
    onFeedback
}) => {
    if (message.role === 'user') {
        return (
            <div className="flex justify-end w-full">
                <div className="flex flex-col items-end max-w-[80%]">
                    <div className="bg-primary text-white px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-md">
                        <p className="text-sm leading-relaxed font-body whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <span className="text-xs text-text-secondary mt-1 mr-1">{formatTime(message.timestamp)}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full gap-4 max-w-4xl">
            <div className="shrink-0 size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 mt-1">
                <span className="material-symbols-outlined text-white text-[18px]">smart_toy</span>
            </div>
            <div className="flex flex-col gap-3 flex-1 min-w-0">
                {/* Response Text */}
                <div className="text-gray-200 text-sm leading-7 font-body prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                        components={{
                            code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = !match;
                                return isInline ? (
                                    <code className="bg-[#232f48] text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono border border-white/5" {...props}>
                                        {children}
                                    </code>
                                ) : (
                                    <CodeBlock language={match[1]}>
                                        {String(children).replace(/\n$/, '')}
                                    </CodeBlock>
                                );
                            },
                        }}
                        remarkPlugins={[remarkGfm]}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>

                {/* Sources / Citations */}
                {message.sources && message.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                        {message.sources.map((src, i) => (
                            <button
                                key={i}
                                onClick={() => onSourceClick(src, src.start_line && src.end_line ?
                                    Array.from({ length: src.end_line - src.start_line + 1 }, (_, i) => src.start_line! + i) :
                                    undefined
                                )}
                                className="flex items-center gap-2 bg-[#1c2433] hover:bg-[#232f48] border border-border-dark/60 rounded px-2.5 py-1.5 cursor-pointer transition-colors group"
                            >
                                <span className="material-symbols-outlined text-[16px] text-primary">description</span>
                                <span className="text-xs font-mono text-gray-300 group-hover:text-white">
                                    {src.source.split('/').pop()}
                                </span>
                                {src.start_line && (
                                    <span className="text-[10px] text-text-secondary ml-1 bg-[#111722] px-1 rounded">
                                        L{src.start_line}{src.end_line && src.end_line !== src.start_line ? `-L${src.end_line}` : ''}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Message Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => navigator.clipboard.writeText(message.content)}
                        className="flex items-center justify-center size-8 rounded text-text-secondary hover:text-white hover:bg-border-dark transition-colors active:scale-95"
                        title="Copy"
                    >
                        <span className="material-symbols-outlined text-[18px]">content_copy</span>
                    </button>
                    <button
                        onClick={() => onFeedback(index, true)}
                        className="flex items-center justify-center size-8 rounded text-text-secondary hover:text-green-400 hover:bg-green-500/20 transition-colors active:scale-95"
                        title="Good response"
                    >
                        <span className="material-symbols-outlined text-[18px]">thumb_up</span>
                    </button>
                    <button
                        onClick={() => onFeedback(index, false)}
                        className="flex items-center justify-center size-8 rounded text-text-secondary hover:text-red-400 hover:bg-red-500/20 transition-colors active:scale-95"
                        title="Bad response"
                    >
                        <span className="material-symbols-outlined text-[18px]">thumb_down</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
