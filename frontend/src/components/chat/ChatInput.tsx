import React, { useRef, useEffect, useState } from 'react';
import { VoiceInput } from '../VoiceInput';

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    isLoading: boolean;
    suggestions: string[];
    onSuggestionClick: (suggestion: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    value,
    onChange,
    onSend,
    isLoading,
    suggestions,
    onSuggestionClick
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [userDismissed, setUserDismissed] = useState(false);
    const [prevSuggestions, setPrevSuggestions] = useState(suggestions);

    if (suggestions !== prevSuggestions) {
        setPrevSuggestions(suggestions);
        setUserDismissed(false);
    }

    const showSuggestions = !userDismissed && suggestions.length > 0;

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
        }
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && !isLoading) {
                onSend();
            }
        }
    };

    const handleVoiceTranscript = (text: string) => {
        onChange(value + (value ? ' ' : '') + text);
    };

    return (
        <div className="absolute bottom-0 left-0 w-full bg-background-dark/95 backdrop-blur border-t border-border-dark p-5">
            <div className="max-w-4xl mx-auto">
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute bottom-full mb-2 left-5 right-5 max-w-4xl mx-auto bg-sidebar-dark border border-border-dark rounded-xl shadow-xl animate-scale-in overflow-hidden">
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    onSuggestionClick(s);
                                    setUserDismissed(true);
                                    textareaRef.current?.focus();
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-border-dark hover:text-white transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[16px]">description</span>
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                <div className="relative flex items-end gap-2 bg-input-dark border border-border-dark rounded-xl p-2 shadow-lg focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
                    <button
                        className="flex items-center justify-center size-10 rounded-lg text-text-secondary hover:text-white hover:bg-border-dark transition-colors shrink-0"
                        title="Upload file (Coming soon)"
                    >
                        <span className="material-symbols-outlined">attach_file</span>
                    </button>
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-transparent border-none text-white placeholder-text-secondary text-sm font-body focus:ring-0 focus:outline-none resize-none py-2.5 max-h-32 min-h-[44px]"
                        placeholder="Ask a question about your repository..."
                        rows={1}
                        disabled={isLoading}
                    />
                    <div className="flex items-center gap-1 shrink-0 pb-0.5">
                        <VoiceInput onTranscript={handleVoiceTranscript} disabled={isLoading} />
                        <button
                            onClick={onSend}
                            disabled={!value.trim() || isLoading}
                            className="flex items-center justify-center size-9 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-md shadow-primary/20 transition-all transform active:scale-95"
                            title="Send Message"
                        >
                            <span className="material-symbols-outlined text-[20px]">send</span>
                        </button>
                    </div>
                </div>
                <p className="text-center text-[10px] text-text-secondary/50 mt-2">
                    CodeRAG can make mistakes. Verify critical logic.
                </p>
            </div>
        </div>
    );
};
