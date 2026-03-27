import { useState, useEffect, useRef } from 'react';
import { sendChatMessage, streamChatMessage, submitFeedback, loadSession, getSymbols, type ChatResponse } from '../lib/api';
import { useToast } from '../components/Toast';
import type { Message } from '../components/chat/MessageBubble';
import { logger } from '../lib/logger';

interface UseChatSessionProps {
    sessionId: string | null;
    repoId?: string;
    contextFiles: string[];
    onNewChat?: () => void;
}

export function useChatSession({ sessionId, repoId, contextFiles, onNewChat }: UseChatSessionProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const { addToast } = useToast();

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
                logger.error('Failed to load session:', err);
                addToast('Failed to load session messages', 'error');
            });
        } else {
            setMessages([]);
        }
    }, [sessionId, addToast]);

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

    // Auto-complete suggestions
    useEffect(() => {
        if (input.includes('@') && !input.endsWith(' ')) {
            const match = input.match(/@(\w*)$/);
            if (match) {
                const query = match[1].toLowerCase();
                getSymbols()
                    .then(data => {
                        const allSuggestions = [
                            ...data.files.map((f: string) => ({ type: 'file', name: f })),
                            ...data.symbols.map((s: any) => ({ type: s.type, name: s.name, file: s.file }))
                        ];
                        const filtered = allSuggestions
                            .filter((s: { type: string; name: string }) => s.name.toLowerCase().includes(query))
                            .slice(0, 10);
                        setSuggestions(filtered.map((s: { type: string; name: string }) =>
                            s.type === 'file' ? s.name : `${s.name} (${s.type})`
                        ));
                    })
                    .catch(() => setSuggestions([]));
            } else {
                setSuggestions([]);
            }
        } else {
            setSuggestions([]);
        }
    }, [input]);

    const streamBufferRef = useRef('');

    const handleSendMessage = async (overrideMessage?: string | React.MouseEvent) => {
        const messageToSend = typeof overrideMessage === 'string' ? overrideMessage : input.trim();
        if (!messageToSend || loading) return;

        // Slash commands
        if (messageToSend.startsWith('/')) {
            const command = messageToSend.toLowerCase().trim();
            setInput('');
            if (command === '/clear') {
                setMessages([]);
                return;
            }
            if (command === '/reset') {
                onNewChat?.();
                return;
            }
            if (command === '/help') {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `**Available Commands:**\n- \`/clear\` - Clear chat\n- \`/reset\` - New session\n- \`/help\` - Show help`,
                    timestamp: Date.now()
                }]);
                return;
            }
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Unknown command: \`${command}\``,
                timestamp: Date.now()
            }]);
            return;
        }

        const userMessage: Message = { role: 'user', content: messageToSend, timestamp: Date.now() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);
        setError(null);

        let fullQuery = messageToSend;
        if (contextFiles.length > 0) {
            fullQuery = `[Context files: ${contextFiles.join(', ')}]\n\n${messageToSend}`;
        }

        // Try streaming first, fall back to regular chat
        try {
            streamBufferRef.current = '';

            // Add empty assistant message that we'll fill with streamed tokens
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '',
                timestamp: Date.now()
            }]);

            await streamChatMessage(fullQuery, {
                onToken: (token: string) => {
                    streamBufferRef.current += token;
                    const currentContent = streamBufferRef.current;
                    setMessages(prev => {
                        const updated = [...prev];
                        const lastMsg = updated[updated.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            updated[updated.length - 1] = { ...lastMsg, content: currentContent };
                        }
                        return updated;
                    });
                },
                onSources: (sources: any[]) => {
                    setMessages(prev => {
                        const updated = [...prev];
                        const lastMsg = updated[updated.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            updated[updated.length - 1] = { ...lastMsg, sources };
                        }
                        return updated;
                    });
                },
                onSessionId: () => {
                    // Session ID from stream — could update session state if needed
                },
                onDone: () => {
                    setLoading(false);
                },
                onError: (errorMsg: string) => {
                    setError(errorMsg);
                    setLoading(false);
                    // Remove the empty assistant message if no content was streamed
                    if (!streamBufferRef.current) {
                        setMessages(prev => prev.filter((_, i) => i !== prev.length - 1));
                    }
                }
            }, sessionId || undefined, repoId);

            setLoading(false);
        } catch {
            // Streaming failed (network, server down) — fall back to non-streaming
            // Remove the empty streaming placeholder
            setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.content === '' && m === prev[prev.length - 1])));

            try {
                const response: ChatResponse = await sendChatMessage(fullQuery, sessionId || undefined, repoId);
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: response.answer,
                    sources: response.sources,
                    timestamp: Date.now()
                };
                setMessages(prev => [...prev, assistantMessage]);
            } catch (err: any) {
                const error = err as { response?: { data?: { detail?: string }, status?: number }, isTimeout?: boolean, message?: string };
                let errorMessage = 'Failed to get response.';
                if (error.isTimeout) {
                    errorMessage = 'Request timed out.';
                } else if (error.response?.status === 400) {
                    errorMessage = error.response?.data?.detail || 'Invalid request.';
                } else if (error.response?.status === 500) {
                    errorMessage = 'Server error.';
                } else if (error.message) {
                    errorMessage = error.message;
                }
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleFeedback = async (index: number, isPositive: boolean) => {
        try {
            const msg = messages[index];
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const question = prevMsg?.role === 'user' ? prevMsg.content : '';
            await submitFeedback(question, msg.content, isPositive ? 5 : 1, '');
        } catch (err) {
            logger.error('Feedback failed', err);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        const match = input.match(/@\w*$/);
        if (match) {
            setInput(input.replace(/@\w*$/, '@' + suggestion + ' '));
        }
    };

    return {
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
    };
}
