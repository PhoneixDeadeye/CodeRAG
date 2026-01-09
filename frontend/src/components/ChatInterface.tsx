import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, submitFeedback, loadSession, getSymbols, exportSession, type SourceDocument, type ChatResponse } from '../lib/api';
import { useToast } from '../contexts/ToastContextCore';

// Components
import { MessageBubble, MessageSkeleton, type Message } from './chat/MessageBubble';
import { ChatInput } from './chat/ChatInput';

interface ChatInterfaceProps {
    onSourceClick: (source: SourceDocument, lines?: number[]) => void;
    sessionId: string | null;
    contextFiles: string[];
    sessionName: string;
    repoName: string;
    repoId?: string; // Added repoId
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
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState(''); // Lifted state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // UI Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const { showToast } = useToast();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            setShowScrollButton(scrollHeight - scrollTop - clientHeight > 300);
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load session messages
    useEffect(() => {
        if (sessionId) {
            loadSession(sessionId).then(session => {
                if (session.messages) {
                    setMessages(session.messages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        sources: m.sources,
                        timestamp: m.timestamp
                    })));
                }
            }).catch(err => {
                if (import.meta.env.MODE === 'development') {
                    console.error('Failed to load session:', err);
                }
                showToast('Failed to load session messages', 'error');
            });
        } else {
            setMessages([]);
        }
    }, [sessionId, showToast]);

    // Handle file explanation requests
    useEffect(() => {
        const handleExplainFile = (event: CustomEvent) => {
            if (event.detail.isCode) {
                setInput(event.detail.filePath);
            } else {
                setInput(`Explain the code in ${event.detail.filePath}`);
            }
        };

        window.addEventListener('explainFile', handleExplainFile as EventListener);
        return () => window.removeEventListener('explainFile', handleExplainFile as EventListener);
    }, []);

    // Auto-complete suggestions based on @ mentions
    useEffect(() => {
        if (input.includes('@') && !input.endsWith(' ')) {
            const match = input.match(/@(\w*)$/);
            if (match) {
                const query = match[1].toLowerCase();
                getSymbols()
                    .then(data => {
                        const allSuggestions = [
                            ...data.files.map((f: string) => ({ type: 'file', name: f })),
                            ...data.symbols.map((s) => ({ type: s.type, name: s.name, file: s.file }))
                        ];
                        const filtered = allSuggestions
                            .filter((s: { type: string; name: string }) => s.name.toLowerCase().includes(query))
                            .slice(0, 10);
                        setSuggestions(filtered.map((s: { type: string; name: string }) =>
                            s.type === 'file' ? s.name : `${s.name} (${s.type})`
                        ));
                    })
                    .catch(() => {
                        // Silent fail - autocomplete is optional
                        setSuggestions([]);
                    });
            } else {
                setSuggestions([]);
            }
        } else {
            setSuggestions([]);
        }
    }, [input]);

    const onSendMessage = async (overrideMessage?: string | React.MouseEvent) => {
        // Handle case where this is called with an event object instead of a string
        const messageToSend = typeof overrideMessage === 'string'
            ? overrideMessage
            : input.trim();
        if (!messageToSend || loading) return;

        // Slash command handling
        if (messageToSend.startsWith('/')) {
            const command = messageToSend.toLowerCase().trim();
            if (!overrideMessage) setInput(''); // Only clear input if not override (though override usually implies click)
            // Actually if override, input might still constitute "draft". But for suggestions, we want to clear or ignore input. 
            // If I click suggestion, input should probably be cleared if I was typing? 
            // Original logic: setInput('') was called. 
            setInput('');

            switch (command) {
                case '/clear':
                    setMessages([]);
                    return;
                case '/reset':
                    if (onNewChat) onNewChat();
                    return;
                case '/help':
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `**Available Commands:**
- \`/clear\` - Clear the current chat history
- \`/reset\` - Start a new chat session
- \`/help\` - Show this help message

**Tips:**
- Use \`@\` to mention files or symbols
- Click "Ask AI" in the file explorer to chat about a file`,
                        timestamp: Date.now()
                    }]);
                    return;
                default:
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `Unknown command: \`${command}\`. Type \`/help\` for available commands.`,
                        timestamp: Date.now()
                    }]);
                    return;
            }
        }

        const userMessage: Message = { role: 'user', content: messageToSend, timestamp: Date.now() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);
        setError(null);

        try {
            let fullQuery = messageToSend;
            if (contextFiles.length > 0) {
                fullQuery = `[Context files: ${contextFiles.join(', ')}]\n\n${messageToSend}`;
            }

            // Pass repoId as 3rd argument
            const response: ChatResponse = await sendChatMessage(fullQuery, sessionId || undefined, repoId);

            const assistantMessage: Message = {
                role: 'assistant',
                content: response.answer,
                sources: response.sources,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to get response.');
        } finally {
            setLoading(false);
        }
    };

    const handleFeedback = async (messageIndex: number, isPositive: boolean) => {
        try {
            const msg = messages[messageIndex];
            const prevMsg = messageIndex > 0 ? messages[messageIndex - 1] : null;
            const question = prevMsg?.role === 'user' ? prevMsg.content : '';
            await submitFeedback(question, msg.content, isPositive ? 5 : 1, '');
        } catch (err) {
            console.error('Failed to submit feedback', err);
        }
    };

    // Callback from ChatInput when a suggestion is clicked
    const handleSuggestionClick = (suggestion: string) => {
        const match = input.match(/@\w*$/);
        if (match) {
            setInput(input.replace(/@\w*$/, '@' + suggestion + ' '));
        }
    };

    const formatTime = (timestamp?: number) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <main className="flex-1 flex flex-col h-full relative min-w-0 bg-background-dark">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border-dark px-6 py-4 pl-16 md:pl-6 bg-background-dark/80 backdrop-blur-md z-10 sticky top-0 transition-all">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <h2 className="text-white text-lg font-bold leading-tight">
                            {sessionName}
                        </h2>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            disabled={!sessionId || messages.length === 0}
                            className="flex items-center justify-center rounded-lg size-9 bg-border-dark hover:bg-[#324467] text-white transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Export Session"
                        >
                            <span className="material-symbols-outlined text-[20px]">download</span>
                        </button>
                        {showExportMenu && (
                            <div className="absolute top-full right-0 mt-2 bg-sidebar-dark border border-border-dark rounded-lg shadow-xl p-1 flex flex-col gap-1 min-w-[140px] z-50 animate-fade-in">
                                <button
                                    onClick={() => {
                                        if (sessionId) exportSession(sessionId, 'json');
                                        setShowExportMenu(false);
                                    }}
                                    className="text-left px-3 py-2 hover:bg-white/5 rounded text-sm text-text-secondary hover:text-white transition-colors flex items-center gap-2"
                                    disabled={!sessionId}
                                >
                                    <span className="material-symbols-outlined text-[16px]">data_object</span>
                                    JSON
                                </button>
                                <button
                                    onClick={() => {
                                        if (sessionId) exportSession(sessionId, 'markdown');
                                        setShowExportMenu(false);
                                    }}
                                    className="text-left px-3 py-2 hover:bg-white/5 rounded text-sm text-text-secondary hover:text-white transition-colors flex items-center gap-2"
                                    disabled={!sessionId}
                                >
                                    <span className="material-symbols-outlined text-[16px]">description</span>
                                    Markdown
                                </button>
                            </div>
                        )}
                        {showExportMenu && (
                            <div
                                className="fixed inset-0 z-40 bg-transparent"
                                onClick={() => setShowExportMenu(false)}
                            />
                        )}
                    </div>
                    <button
                        onClick={() => {
                            const transcript = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
                            navigator.clipboard.writeText(transcript).then(() => {
                                showToast("Conversation transcript copied to clipboard!", "success");
                            }).catch(err => {
                                console.error('Clipboard copy failed:', err);
                                showToast("Failed to copy transcript", "error");
                            });
                        }}
                        className="flex items-center justify-center rounded-lg size-9 bg-border-dark hover:bg-[#324467] text-white transition-colors active:scale-95"
                        title="Copy Transcript"
                    >
                        <span className="material-symbols-outlined text-[20px]">share</span>
                    </button>
                    <button
                        onClick={() => {
                            showToast(`Session ID: ${sessionId || 'Unsaved'} • Messages: ${messages.length}`, 'info');
                        }}
                        className="flex items-center justify-center rounded-lg size-9 bg-border-dark hover:bg-[#324467] text-white transition-colors active:scale-95"
                        title="Session Info"
                    >
                        <span className="material-symbols-outlined text-[20px]">info</span>
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-8 pb-32 scroll-smooth"
            >
                {/* Empty State */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                        <div className="bg-border-dark p-4 rounded-full mb-4">
                            <span className="material-symbols-outlined text-4xl text-primary">smart_toy</span>
                        </div>
                        <h3 className="text-xl font-bold mb-2">How can I help with your code today?</h3>
                        <p className="text-text-secondary text-sm max-w-md mb-6">
                            Ask me anything about your codebase. I can explain code, find bugs, suggest improvements, and more.
                        </p>
                        <div className="flex flex-wrap gap-3 justify-center max-w-lg">
                            {['Explain the main entry point', 'Find potential bugs', 'How does auth work?', 'Generate unit tests'].map((suggestion, i) => (
                                <button
                                    key={i}
                                    onClick={() => onSendMessage(suggestion)}
                                    className="px-4 py-2 bg-border-dark hover:bg-[#324467] border border-border-dark/50 rounded-full text-sm text-text-secondary hover:text-white transition-all"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Messages */}
                {messages.map((msg, idx) => (
                    <MessageBubble
                        key={idx}
                        index={idx}
                        message={msg}
                        formatTime={formatTime}
                        onSourceClick={onSourceClick}
                        onFeedback={handleFeedback}
                    />
                ))}

                {loading && <MessageSkeleton />}

                {error && (
                    <div className="max-w-4xl mx-auto animate-fade-in">
                        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                            <span className="material-symbols-outlined">error</span>
                            <span>{error}</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Scroll to Bottom Button */}
            {showScrollButton && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-28 right-8 z-20 p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary-hover transition-all animate-bounce"
                    title="Scroll to bottom"
                >
                    <span className="material-symbols-outlined">arrow_downward</span>
                </button>
            )}

            {/* Context files badge */}
            {contextFiles.length > 0 && (
                <div className="px-4 py-2 border-t border-border-dark bg-emerald-500/10 text-xs text-emerald-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">attach_file</span>
                    <span>Context:</span>
                    {contextFiles.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 bg-emerald-500/20 rounded">{f.split('/').pop()}</span>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <ChatInput
                value={input}
                onChange={setInput}
                onSend={onSendMessage}
                isLoading={loading}
                suggestions={suggestions}
                onSuggestionClick={handleSuggestionClick}
            />
        </main>
    );
};
