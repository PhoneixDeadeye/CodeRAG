import React, { useState, useEffect, useCallback } from 'react';
import { listSessions, deleteSession, type ChatSession } from '../lib/api';
import { useToast } from '../contexts/ToastContextCore';
import { useAuth } from '../contexts/AuthContext';

interface SessionManagerProps {
    currentSessionId: string | null;
    onSessionSelect: (session: ChatSession | null) => void;
    repoUrl?: string;
}

export const SessionManager: React.FC<SessionManagerProps> = ({
    currentSessionId,
    onSessionSelect,
}) => {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const { showToast } = useToast();
    const { isAuthenticated, isGuest } = useAuth();

    const loadSessions = useCallback(async () => {
        // Only fetch sessions for authenticated users
        if (!isAuthenticated) {
            setSessions([]);
            return;
        }

        setLoading(true);
        try {
            const data = await listSessions();
            setSessions(data.sessions);
        } catch (err) {
            if (import.meta.env.MODE === 'development') {
                console.error('Failed to load sessions:', err);
            }
            // Don't show toast for auth errors in guest mode
            if (!isGuest) {
                showToast('Failed to load sessions', 'error');
            }
        } finally {
            setLoading(false);
        }
    }, [showToast, isAuthenticated, isGuest]);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();

        if (deleteConfirmId !== sessionId) {
            setDeleteConfirmId(sessionId);
            // Auto-reset confirm state after 3 seconds
            setTimeout(() => setDeleteConfirmId(null), 3000);
            return;
        }

        try {
            await deleteSession(sessionId);
            showToast('Session deleted', 'success');
            if (currentSessionId === sessionId) {
                onSessionSelect(null);
            }
            await loadSessions();
        } catch (err) {
            if (import.meta.env.MODE === 'development') {
                console.error('Failed to delete session:', err);
            }
            showToast('Failed to delete session', 'error');
        } finally {
            setDeleteConfirmId(null);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return '1d ago';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="flex flex-col gap-1 px-1">
                <div className="skeleton h-12 rounded-lg" />
                <div className="skeleton h-12 rounded-lg" />
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">
                {isGuest ? (
                    <span className="flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">lock</span>
                        Log in to view history
                    </span>
                ) : (
                    'No saved chats yet'
                )}
            </div>
        );
    }

    // Show only first 5 sessions in sidebar
    const displayedSessions = sessions.slice(0, 5);

    return (
        <div className="flex flex-col gap-1">
            {displayedSessions.map((session) => (
                <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSessionSelect(session)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSessionSelect(session);
                        }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group w-full text-left cursor-pointer ${currentSessionId === session.id
                        ? 'bg-border-dark border border-border-dark/50'
                        : 'hover:bg-[#192233]'
                        }`}
                >
                    <span className={`material-symbols-outlined text-[20px] ${currentSessionId === session.id ? 'text-primary' : 'text-text-secondary group-hover:text-white'
                        }`}>
                        chat_bubble
                    </span>
                    <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                        <span className={`text-sm font-medium truncate ${currentSessionId === session.id ? 'text-white' : 'text-text-secondary group-hover:text-white'
                            }`}>
                            {session.name}
                        </span>
                        <span className="text-xs text-[#5f7192]">
                            {formatDate(session.updated_at)}
                        </span>
                    </div>
                    <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${deleteConfirmId === session.id
                            ? 'opacity-100 bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                            : 'hover:bg-red-500/20 text-red-400'
                            }`}
                        title={deleteConfirmId === session.id ? "Click to confirm delete" : "Delete session"}
                    >
                        <span className="material-symbols-outlined text-[16px]">
                            {deleteConfirmId === session.id ? 'check' : 'delete'}
                        </span>
                    </button>
                </div>
            ))}

            {sessions.length > 5 && (
                <div className="px-3 py-1 text-xs text-text-secondary">
                    +{sessions.length - 5} more sessions
                </div>
            )}
        </div>
    );
};
