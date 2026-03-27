import React, { useRef, useEffect, useState } from 'react';
import { type SourceDocument } from '../lib/api';
import { ArrowDown, Paperclip, AlertCircle, RefreshCw } from 'lucide-react';

// Components
import { MessageBubble, TypingIndicator } from './chat/MessageBubble';
import { ChatInput } from './chat/ChatInput';
import { ChatHeader } from './chat/ChatHeader';
import { ChatEmptyState } from './chat/ChatEmptyState';

// Hooks
import { useChatSession } from '../hooks/useChatSession';

interface ChatInterfaceProps {
    onSourceClick: (source: SourceDocument, lines?: number[]) => void;
    sessionId: string | null;
    contextFiles: string[];
    sessionName: string;
    repoName: string;
    repoId?: string;
    onNewChat: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    onSourceClick,
    sessionId,
    contextFiles,
    sessionName,
    repoId,
    onNewChat
}) => {
    const {
        messages,
        input,
        setInput,
        loading,
        error,
        setError,
        suggestions,
        handleSendMessage,
        handleFeedback,
        handleSuggestionClick
    } = useChatSession({ sessionId, repoId, contextFiles, onNewChat });

    // UI Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            setShowScrollButton(scrollHeight - scrollTop - clientHeight > 300);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <main className="flex-1 flex flex-col h-full relative min-w-0 bg-bg-base">
            <ChatHeader
                sessionName={sessionName}
                sessionId={sessionId}
                messages={messages}
            />

            {/* Chat Area */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-8 pb-40 scroll-smooth custom-scrollbar"
            >
                {messages.length === 0 ? (
                    <ChatEmptyState onOptionClick={handleSendMessage} />
                ) : (
                    <div className="max-w-4xl mx-auto w-full flex flex-col gap-10">
                        {messages.map((msg, idx) => (
                            <MessageBubble
                                key={idx}
                                index={idx}
                                message={msg}
                                formatTime={(ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                onSourceClick={onSourceClick}
                                onFeedback={handleFeedback}
                            />
                        ))}
                        {loading && <TypingIndicator />}
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="max-w-4xl mx-auto w-full animate-fade-in px-4">
                        <div className="flex items-center justify-between gap-4 p-5 bg-black border-l-4 border-accent-rose shadow-[4px_4px_0px_0px_rgba(255,0,60,0.5)]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-accent-rose/20">
                                    <AlertCircle className="w-5 h-5 text-accent-rose" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white font-mono uppercase">EXECUTION_ERROR</span>
                                    <span className="text-xs text-accent-rose font-mono">{error}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setError(null);
                                    // Retry last user message if available
                                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                                    if (lastUserMsg) handleSendMessage(lastUserMsg.content);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-accent-rose/10 hover:bg-accent-rose/20 border border-accent-rose text-xs font-bold text-accent-rose transition-all active:translate-y-1 rounded-none uppercase font-mono"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                RETRY
                            </button>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Scroll Button */}
            <div className="absolute bottom-32 right-8 flex flex-col gap-3 z-30">
                {showScrollButton && (
                    <button
                        onClick={scrollToBottom}
                        className="p-3 bg-primary text-black shadow-[4px_4px_0px_0px_white] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all border-2 border-transparent hover:border-white active:scale-95 rounded-none"
                        title="SCROLL_TO_BOTTOM"
                    >
                        <ArrowDown className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Context Badge */}
            {contextFiles.length > 0 && (
                <div className="px-5 py-2 bg-black border-t border-primary flex items-center gap-3 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.5)]">
                    <div className="p-1 bg-primary/20">
                        <Paperclip className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-primary font-bold uppercase tracking-widest font-mono">ACTIVE_CONTEXT_LOADED</span>
                        <div className="flex flex-wrap gap-2 mt-0.5">
                            {contextFiles.map((f, i) => (
                                <span key={i} className="px-2 py-0.5 bg-bg-surface border border-border-default text-[10px] text-text-secondary font-mono uppercase">
                                    {f.split('/').pop()}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSendMessage}
                isLoading={loading}
                suggestions={suggestions}
                onSuggestionClick={handleSuggestionClick}
            />
        </main>
    );
};
