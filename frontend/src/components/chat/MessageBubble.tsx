import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '../CodeBlock';
import { type SourceDocument } from '../../lib/api';
import {
    User, Bot, Check, Copy, ThumbsUp,
    ThumbsDown, FileText, Sparkles, Clock,
    ExternalLink
} from 'lucide-react';
import clsx from 'clsx';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: SourceDocument[];
    timestamp?: number;
}

// Typing indicator animation
export const TypingIndicator = () => (
    <div className="flex w-full gap-4 max-w-4xl animate-fade-in px-4 md:px-0">
        <div className="shrink-0 size-9 bg-primary border border-primary flex items-center justify-center mt-1">
            <Bot className="w-5 h-5 text-black animate-pulse" />
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-2">
            <div className="bg-bg-surface border border-border-default px-4 py-3 inline-flex w-fit items-center gap-3">
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-primary animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-primary animate-bounce"></span>
                </div>
                <span className="text-xs text-primary font-mono font-medium tracking-tight uppercase">PROCESSING_REQUEST...</span>
            </div>
        </div>
    </div>
);

export const MessageSkeleton = () => (
    <div className="flex w-full gap-4 max-w-4xl animate-pulse px-4 md:px-0">
        <div className="shrink-0 size-9 rounded-none bg-white/5 border border-white/5 flex items-center justify-center opacity-50">
            <Bot className="w-5 h-5 text-text-muted" />
        </div>
        <div className="flex flex-col gap-3 flex-1 min-w-0 pt-1">
            <div className="space-y-2">
                <div className="h-3 w-full bg-white/5 rounded-none"></div>
                <div className="h-3 w-4/5 bg-white/5 rounded-none"></div>
                <div className="h-3 w-3/5 bg-white/5 rounded-none"></div>
            </div>
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
    const [copied, setCopied] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFeedback = (isPositive: boolean) => {
        setFeedbackGiven(isPositive ? 'up' : 'down');
        onFeedback(index, isPositive);
    };

    if (message.role === 'user') {
        return (
            <div className="flex justify-end w-full animate-fade-in-up px-4 md:px-0" style={{ animationDelay: '50ms' }}>
                <div className="flex items-start gap-3 max-w-[85%]">
                    <div className="flex flex-col items-end">
                        <div className="bg-bg-elevated border border-border-default text-text-primary px-5 py-3.5 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                            <p className="text-sm leading-relaxed font-mono whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-2 mr-1">
                            <span className="text-[10px] text-text-secondary font-mono font-bold uppercase tracking-wider">{formatTime(message.timestamp)}</span>
                        </div>
                    </div>
                    <div className="shrink-0 size-9 bg-black border border-border-default flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full gap-4 max-w-4xl group animate-fade-in-up px-4 md:px-0" style={{ animationDelay: '100ms' }}>
            <div className="shrink-0 size-9 bg-primary border border-primary flex items-center justify-center mt-1">
                <Bot className="w-5 h-5 text-black" />
            </div>
            <div className="flex flex-col gap-4 flex-1 min-w-0">
                {/* Response Content Card */}
                <div className="bg-bg-surface border border-border-default px-6 py-5 relative overflow-hidden group/content">

                    <div className="text-gray-200 text-sm leading-7 font-body prose prose-invert prose-sm max-w-none 
                        prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight prose-headings:uppercase prose-headings:font-display
                        prose-p:text-gray-300 prose-p:leading-relaxed
                        prose-a:text-primary prose-a:no-underline hover:prose-a:text-white prose-a:transition-colors prose-a:font-bold
                        prose-strong:text-white prose-strong:font-bold
                        prose-ul:my-4 prose-li:my-1 prose-li:text-gray-300
                        prose-pre:bg-transparent prose-pre:p-0">
                        <ReactMarkdown
                            components={{
                                code({ className, children, ...props }) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const isInline = !match;
                                    return isInline ? (
                                        <code className="bg-black text-primary px-1.5 py-0.5 text-[13px] font-mono border border-border-default" {...props}>
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

                    {/* Citations/Sources within context */}
                    {message.sources && message.sources.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-border-default flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[10px] text-primary uppercase tracking-widest font-bold font-mono">Verified Sources</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {message.sources.map((src, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onSourceClick(src, src.start_line && src.end_line ?
                                            Array.from({ length: src.end_line - src.start_line + 1 }, (_, i) => src.start_line! + i) :
                                            undefined
                                        )}
                                        className="flex items-center gap-2 bg-black hover:bg-bg-elevated border border-border-default hover:border-primary rounded-none px-3 py-2 cursor-pointer transition-all group/source active:translate-y-1"
                                    >
                                        <FileText className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-xs font-mono text-gray-400 group-hover/source:text-white transition-colors truncate max-w-[150px]">
                                            {src.source.split('/').pop()}
                                        </span>
                                        {src.start_line && (
                                            <span className="text-[10px] text-text-secondary bg-bg-surface px-1.5 py-0.5 font-mono border border-border-subtle">
                                                L{src.start_line}{src.end_line && src.end_line !== src.start_line ? `-${src.end_line}` : ''}
                                            </span>
                                        )}
                                        <ExternalLink className="w-3 h-3 text-text-muted opacity-0 group-hover/source:opacity-100 transition-opacity ml-1" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bubble Footer / Actions */}
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 p-0">
                            <button
                                onClick={handleCopy}
                                aria-label="Copy message"
                                className={clsx(
                                    "flex items-center justify-center size-8 border border-transparent hover:border-border-default transition-all active:translate-y-1 rounded-none",
                                    copied ? "text-primary" : "text-text-secondary hover:text-white"
                                )}
                                title={copied ? 'COPIED' : 'COPY'}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <div className="w-px h-4 bg-border-default mx-1" />
                            <button
                                onClick={() => handleFeedback(true)}
                                aria-label="Thumbs up"
                                disabled={feedbackGiven !== null}
                                className={clsx(
                                    "flex items-center justify-center size-8 border border-transparent hover:border-border-default transition-all active:translate-y-1 rounded-none",
                                    feedbackGiven === 'up' ? "text-primary bg-bg-elevated" : feedbackGiven !== null ? "opacity-30" : "text-text-secondary hover:text-primary"
                                )}
                            >
                                <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleFeedback(false)}
                                aria-label="Thumbs down"
                                disabled={feedbackGiven !== null}
                                className={clsx(
                                    "flex items-center justify-center size-8 border border-transparent hover:border-border-default transition-all active:translate-y-1 rounded-none",
                                    feedbackGiven === 'down' ? "text-accent-rose bg-bg-elevated" : feedbackGiven !== null ? "opacity-30" : "text-text-secondary hover:text-accent-rose"
                                )}
                            >
                                <ThumbsDown className="w-4 h-4" />
                            </button>
                        </div>
                        <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest flex items-center gap-1.5 font-mono">
                            <Clock className="w-3 h-3" />
                            {formatTime(message.timestamp)}
                        </span>
                    </div>

                    <div className="text-[10px] text-primary font-bold uppercase tracking-widest hidden group-hover:flex items-center gap-1 animate-fade-in font-mono">
                        <Sparkles className="w-3 h-3" />
                        AI_VERIFIED
                    </div>
                </div>
            </div>
        </div>
    );
};

