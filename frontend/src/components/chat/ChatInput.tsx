import React, { useRef, useEffect, useState } from 'react';
import { VoiceInput } from '../VoiceInput';
import { uploadFile } from '../../lib/api';
import { Paperclip, X, ArrowUp, Lightbulb, ArrowRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { logger } from '../../lib/logger';

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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const latestValueRef = useRef(value);
    const [userDismissed, setUserDismissed] = useState(false);
    const [prevSuggestions, setPrevSuggestions] = useState(suggestions);
    const [isUploading, setIsUploading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    // Keep latest value in ref for async operations
    useEffect(() => {
        latestValueRef.current = value;
    }, [value]);

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
            if (value.trim() && !isLoading && !isUploading) {
                onSend();
            }
        }
    };

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input so same file can be selected again
        e.target.value = '';

        try {
            setIsUploading(true);
            const response = await uploadFile(file);

            const contextBlock = `\n\n--- Context from ${response.filename} ---\n${response.content}\n--- End Context ---\n\n`;

            // Append to LATEST value
            const newValue = latestValueRef.current + (latestValueRef.current ? '\n' : '') + contextBlock;
            onChange(newValue);

            // Focus back on textarea
            textareaRef.current?.focus();

        } catch (error: any) {
            logger.error("Upload failed", error);
            alert(error.response?.data?.detail || "Failed to upload file");
        } finally {
            setIsUploading(false);
        }
    };

    const handleVoiceTranscript = (text: string) => {
        onChange(value + (value ? ' ' : '') + text);
    };

    const charCount = value.length;
    const showCharCount = charCount > 100;

    return (
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-background-dark via-background-dark/95 to-transparent backdrop-blur-sm pt-8 pb-5 px-5 z-20">
            <div className="max-w-4xl mx-auto">
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute bottom-full mb-4 left-5 right-5 max-w-4xl mx-auto z-30">
                        <div className="bg-[#1e2330]/95 backdrop-blur-md border border-border-default rounded-none shadow-2xl overflow-hidden animate-fade-in-up">
                            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between bg-black/20">
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Suggested follow-ups</span>
                                <button
                                    onClick={() => setUserDismissed(true)}
                                    className="text-text-muted hover:text-white transition-colors p-1"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        onSuggestionClick(s);
                                        setUserDismissed(true);
                                        textareaRef.current?.focus();
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all flex items-center gap-3 group border-b border-white/5 last:border-b-0"
                                >
                                    <div className="p-1.5 rounded-none bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                                        <Lightbulb className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="flex-1 truncate">{s}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main input container with sharp border effect */}
                <div className={clsx(
                    "relative transition-all duration-100",
                    isFocused ? 'shadow-[4px_4px_0px_0px_rgba(204,255,0,0.5)]' : 'shadow-none'
                )}>
                    {/* Sharp border container */}
                    <div className={clsx(
                        "absolute inset-0 bg-primary opacity-0 transition-opacity duration-100",
                        isFocused ? 'opacity-100' : ''
                    )} style={{ padding: '2px' }}>
                        <div className="w-full h-full bg-input-dark" />
                    </div>

                    <div className="relative flex items-end gap-2 bg-input-dark border border-border-default hover:border-text-secondary p-3 z-10 transition-colors">
                        {/* File Upload Button and Hidden Input */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept=".txt,.md,.py,.js,.ts,.tsx,.jsx,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.php,.rb,.sh,.yaml,.yml,.json,.html,.css,.sql,.xml"
                        />
                        <button
                            onClick={handleFileClick}
                            disabled={isLoading || isUploading}
                            className="flex items-center justify-center size-9 bg-black border border-border-default hover:border-primary text-text-secondary hover:text-primary transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-1 rounded-none"
                            title="UPLOAD_CONTEXT"
                        >
                            {isUploading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                                <Paperclip className="w-4 h-4" />
                            )}
                        </button>

                        <div className="flex-1 relative py-1">
                            <textarea
                                ref={textareaRef}
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                className="w-full bg-transparent border-none text-white placeholder-text-muted text-sm font-mono focus:ring-0 focus:outline-none resize-none py-1 px-1 max-h-32 min-h-[24px] leading-relaxed"
                                placeholder={isUploading ? "UPLOADING_FILE..." : "ENTER_COMMAND_OR_QUERY..."}
                                rows={1}
                                disabled={isLoading || isUploading}
                            />
                            {showCharCount && (
                                <span className={clsx(
                                    "absolute right-2 bottom-1 text-[10px] transition-colors font-mono",
                                    charCount > 2000 ? 'text-accent-amber' : 'text-text-muted'
                                )}>
                                    {charCount.toLocaleString()}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <VoiceInput onTranscript={handleVoiceTranscript} disabled={isLoading || isUploading} />
                            <button
                                onClick={onSend}
                                disabled={!value.trim() || isLoading || isUploading}
                                className={clsx(
                                    "flex items-center justify-center size-9 text-black shadow-none transition-all transform active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed rounded-none border border-transparent",
                                    value.trim() && !isLoading && !isUploading
                                        ? 'bg-primary hover:bg-white hover:border-white'
                                        : 'bg-border-default text-text-muted'
                                )}
                                title="EXECUTE (ENTER)"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <ArrowUp className="w-4.5 h-4.5" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex items-center gap-3 text-[10px] text-text-secondary/60">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-px bg-white/5 rounded-none border border-border-default font-mono">Enter</kbd>
                            <span>to send</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-px bg-white/5 rounded-none border border-border-default font-mono">Shift+Enter</kbd>
                            <span>newline</span>
                        </span>
                    </div>
                    <p className="text-[10px] text-text-muted/40 font-medium">
                        CodeRAG AI Assistant
                    </p>
                </div>
            </div>
        </div>
    );
};

