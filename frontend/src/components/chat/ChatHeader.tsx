import React, { useState } from 'react';
import { MessageSquare, Download, Share2, Info, ArrowDown, FileJson, FileType } from 'lucide-react';
import { exportSession } from '../../lib/api';
import { useToast } from '../Toast';
import type { Message } from './MessageBubble';

interface ChatHeaderProps {
    sessionName: string;
    sessionId: string | null;
    messages: Message[];
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ sessionName, sessionId, messages }) => {
    const [showExportMenu, setShowExportMenu] = useState(false);
    const { addToast } = useToast();

    const handleExport = (format: 'json' | 'markdown') => {
        if (sessionId) exportSession(sessionId, format);
        setShowExportMenu(false);
    };

    const handleCopyTranscript = () => {
        const transcript = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
        navigator.clipboard.writeText(transcript).then(() => {
            addToast("Copied to clipboard!", "success");
        });
    };

    return (
        <header className="flex items-center justify-between border-b border-border-default px-6 py-4 pl-16 md:pl-6 bg-bg-base z-20 sticky top-0 transition-all">
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-9 bg-primary border border-primary text-black shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                    <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                    <h2 className="text-white text-base font-bold tracking-tight font-display uppercase">
                        {sessionName}
                    </h2>
                    <span className="text-[10px] text-primary font-bold uppercase tracking-widest flex items-center gap-1.5 font-mono">
                        <span className="size-2 bg-primary animate-pulse" />
                        SYSTEM_ACTIVE
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {/* Export Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        disabled={!sessionId || messages.length === 0}
                        className="flex items-center justify-center size-9 bg-black border border-border-default hover:border-primary hover:bg-bg-elevated text-text-secondary hover:text-primary transition-all active:translate-y-1 disabled:opacity-20 disabled:cursor-not-allowed group rounded-none"
                        title="EXPORT_SESSION"
                    >
                        <Download className="w-4.5 h-4.5" />
                    </button>
                    {showExportMenu && (
                        <>
                            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowExportMenu(false)} />
                            <div className="absolute top-full right-0 mt-3 bg-black border border-border-default shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-0 flex flex-col min-w-[180px] z-50 animate-fade-in-up origin-top-right rounded-none">
                                <button
                                    onClick={() => handleExport('json')}
                                    className="text-left px-4 py-3 hover:bg-primary hover:text-black text-sm text-text-secondary transition-all flex items-center justify-between group border-b border-border-subtle font-mono uppercase"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileJson className="w-4 h-4" />
                                        <span>JSON</span>
                                    </div>
                                    <ArrowDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <button
                                    onClick={() => handleExport('markdown')}
                                    className="text-left px-4 py-3 hover:bg-primary hover:text-black text-sm text-text-secondary transition-all flex items-center justify-between group font-mono uppercase"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileType className="w-4 h-4" />
                                        <span>MARKDOWN</span>
                                    </div>
                                    <ArrowDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Copy Transcript */}
                <button
                    onClick={handleCopyTranscript}
                    className="flex items-center justify-center size-9 bg-black border border-border-default hover:border-primary hover:bg-bg-elevated text-text-secondary hover:text-primary transition-all active:translate-y-1 rounded-none"
                    title="COPY_TRANSCRIPT"
                >
                    <Share2 className="w-4.5 h-4.5" />
                </button>

                {/* Info */}
                <button
                    onClick={() => addToast(`ID: ${sessionId || 'New'} • ${messages.length} msgs`, 'info')}
                    className="flex items-center justify-center size-9 bg-black border border-border-default hover:border-primary hover:bg-bg-elevated text-text-secondary hover:text-primary transition-all active:translate-y-1 rounded-none"
                    title="SESSION_INFO"
                >
                    <Info className="w-4.5 h-4.5" />
                </button>
            </div>
        </header>
    );
};
