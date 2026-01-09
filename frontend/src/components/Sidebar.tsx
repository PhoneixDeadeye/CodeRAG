import React, { useState, useEffect } from 'react';
import { ingestRepo, getConfig, listRepos, type AppConfig } from '../lib/api';
import { SessionManager } from './SessionManager';
import { AuthModal } from './AuthModal';
import type { ChatSession } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
    onIngestComplete: () => void;
    onRepoSelect?: (repoId: string) => void;
    onSessionSelect?: (session: ChatSession | null) => void;
    currentSessionId?: string | null;
    onShowSearch?: () => void;
    onShowFiles?: () => void;
    onShowRepos?: () => void;
    onShowGraph?: () => void;
    onShowCodeSearch?: () => void;
    onShowVoice?: () => void;
    isOpen: boolean;
    onClose: () => void;
}

interface Repository {
    id: string; // Added ID
    url: string;
    name: string;
    indexed_at: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
    onIngestComplete,
    onRepoSelect,
    onSessionSelect,
    currentSessionId,
    onShowSearch,
    onShowFiles,
    onShowRepos,
    onShowGraph,
    onShowCodeSearch,
    onShowVoice,
    isOpen,
    onClose
}) => {
    const { user, logout, isGuest } = useAuth();
    const [repoUrl, setRepoUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>('');
    const [showIngestForm, setShowIngestForm] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Load config and repositories on mount
    useEffect(() => {
        getConfig().then(setConfig).catch(err => {
            if (import.meta.env.MODE === 'development') {
                console.error('Failed to load config:', err);
            }
        });
        listRepos().then((data) => {
            const repos = data.repos || [];
            // Store ID as well
            setRepositories(repos.map(r => ({ id: r.id, url: r.url, name: r.name, indexed_at: r.updated_at })));

            if (repos.length > 0) {
                // If config has current activity, try to match? 
                // For now default to first or currently active from backend
                const active = data.active;
                if (active) {
                    setSelectedRepoUrl(active.url);
                    onRepoSelect?.(active.id);
                } else {
                    setSelectedRepoUrl(repos[0].url);
                    onRepoSelect?.(repos[0].id);
                }
            }
        }).catch(err => {
            if (import.meta.env.MODE === 'development') {
                console.error('Failed to load repos:', err);
            }
        });
    }, [onRepoSelect]); // Include onRepoSelect in dependency? Safe to ignore if stable.

    const handleIngest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl) return;

        setLoading(true);
        setStatus('idle');
        try {
            const result = await ingestRepo(repoUrl);
            setStatus('success');
            setMessage(result.message || 'Repository ingested successfully!');
            onIngestComplete();
            setShowIngestForm(false);
            // Refresh repositories list
            listRepos().then((data) => {
                const repos = data.repos || [];
                setRepositories(repos.map(r => ({ id: r.id, url: r.url, name: r.name, indexed_at: r.updated_at })));
                setSelectedRepoUrl(repoUrl);
                // Find ID of new repo
                const newRepo = repos.find(r => r.url === repoUrl);
                if (newRepo && onRepoSelect) {
                    onRepoSelect(newRepo.id);
                }
            }).catch(err => {
                if (import.meta.env.MODE === 'development') {
                    console.error('Failed to refresh repos:', err);
                }
            });
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setStatus('error');
            setMessage(error.response?.data?.detail || 'Failed to ingest repository.');
        } finally {
            setLoading(false);
        }
    };

    const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const url = e.target.value;
        setSelectedRepoUrl(url);
        // Find ID
        const repo = repositories.find(r => r.url === url);
        if (repo && onRepoSelect) {
            onRepoSelect(repo.id);
        }
        // Trigger re-ingestion or switch context
        // onIngestComplete(); // No need to refresh tree immediately if just switching context? FileTree should update via prop change
    };

    const getRepoDisplayName = (url: string) => {
        const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
        return match ? match[1] : url;
    };

    // Sidebar classes handling visibility
    const sidebarClasses = `
        fixed inset-y-0 left-0 z-40 w-80 bg-sidebar-dark border-r border-border-dark flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:relative md:flex
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `;

    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden animate-fade-in"
                    onClick={onClose}
                />
            )}

            <aside className={sidebarClasses}>
                {/* Brand & Repo Switcher */}
                <div className="p-5 flex flex-col gap-6 border-b border-border-dark/50">
                    <div className="flex items-center gap-2">
                        <div className="size-8 rounded bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-white shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-[20px]">terminal</span>
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">CodeRAG</h1>
                        <button onClick={onClose} className="md:hidden ml-auto text-text-secondary">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {repositories.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Active Repository</label>
                            <div className="relative group">
                                <select
                                    value={selectedRepoUrl}
                                    onChange={handleRepoChange}
                                    className="appearance-none w-full bg-input-dark border border-border-dark group-hover:border-primary/50 text-white rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-medium cursor-pointer transition-colors"
                                >
                                    {repositories.map((repo) => (
                                        <option key={repo.url} value={repo.url}>
                                            {getRepoDisplayName(repo.url)}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-text-secondary">
                                    <span className="material-symbols-outlined text-[20px]">expand_more</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6">
                    {/* Main Actions */}
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => { onSessionSelect?.(null); if (window.innerWidth < 768) onClose(); }}
                            className="w-full bg-primary hover:bg-primary-hover active:scale-95 transition-all text-white font-bold rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 mb-4 shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                            <span>New Chat</span>
                        </button>

                        <nav className="flex flex-col gap-1">
                            {[
                                { icon: 'folder_open', label: 'Files Explorer', action: onShowFiles },
                                { icon: 'search', label: 'Global Search', action: onShowSearch },
                                { icon: 'source', label: 'Repositories', action: onShowRepos },
                                { icon: 'hub', label: 'Dependency Graph', action: onShowGraph },
                                { icon: 'code_blocks', label: 'Code Search', action: onShowCodeSearch },
                                { icon: 'mic', label: 'Voice Settings', action: onShowVoice }
                            ].map((item, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => { item.action?.(); if (window.innerWidth < 768) onClose(); }}
                                    className="flex items-center gap-3 px-3 py-2 text-white hover:bg-border-dark active:scale-95 rounded-lg transition-all group w-full text-left"
                                >
                                    <span className="material-symbols-outlined text-text-secondary group-hover:text-white transition-colors">{item.icon}</span>
                                    <span className="text-sm font-medium">{item.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Ingest Form (Collapsible) */}
                    {showIngestForm && (
                        <div className="px-1 animate-fade-in">
                            <form onSubmit={handleIngest} className="space-y-3">
                                <input
                                    type="url"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                    className="w-full bg-input-dark border border-border-dark rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-text-secondary/50"
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !repoUrl}
                                    className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed text-primary font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm active:scale-95"
                                >
                                    {loading ? (
                                        <>
                                            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                            <span>Ingesting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[18px]">download</span>
                                            <span>Ingest Repository</span>
                                        </>
                                    )}
                                </button>
                            </form>

                            {status !== 'idle' && (
                                <div className={`mt-3 p-3 rounded-lg border animate-fade-in ${status === 'success'
                                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                                    }`}>
                                    <div className="flex items-start gap-2">
                                        <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                                            {status === 'success' ? 'check_circle' : 'error'}
                                        </span>
                                        <p className="text-xs">{message}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Session Manager (History) */}
                    {onSessionSelect && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-3">
                                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Recent Sessions</h3>
                                <button className="text-text-secondary hover:text-white hover:rotate-180 transition-transform duration-500">
                                    <span className="material-symbols-outlined text-[16px]">history</span>
                                </button>
                            </div>
                            <SessionManager
                                currentSessionId={currentSessionId || null}
                                onSessionSelect={(s) => { onSessionSelect(s); if (window.innerWidth < 768) onClose(); }}
                                repoUrl={selectedRepoUrl || config?.current_repo || undefined}
                            />
                        </div>
                    )}
                </div>

                {/* User Footer */}
                <div className="p-4 border-t border-border-dark mt-auto bg-[#0d121c]">

                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => { onShowVoice?.(); if (window.innerWidth < 768) onClose(); }}
                            className="flex items-center gap-3 px-2 py-2 text-white hover:bg-border-dark rounded-lg transition-colors active:scale-95 w-full text-left"
                        >
                            <span className="material-symbols-outlined text-text-secondary">settings</span>
                            <span className="text-sm font-medium">Settings</span>
                        </button>

                        {isGuest ? (
                            <button
                                onClick={() => setShowAuthModal(true)}
                                className="flex items-center gap-3 px-2 py-2 group cursor-pointer hover:bg-border-dark rounded-lg transition-colors w-full text-left"
                            >
                                <div className="size-6 rounded-full bg-gradient-to-r from-gray-500 to-gray-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white text-[14px]">person</span>
                                </div>
                                <span className="text-sm font-medium text-text-secondary">Sign In</span>
                                <span className="material-symbols-outlined text-text-secondary text-[18px] ml-auto">login</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-3 px-2 py-2 group cursor-pointer hover:bg-border-dark rounded-lg transition-colors">
                                <div className="size-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-md"></div>
                                <span className="text-sm font-medium truncate max-w-[120px] group-hover:text-white transition-colors" title={user?.email}>{user?.email || 'Developer'}</span>
                                <button onClick={logout} className="ml-auto text-text-secondary hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors" title="Logout">
                                    <span className="material-symbols-outlined text-[18px]">logout</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Auth Modal */}
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                message="Log in to save your chat history and access it from any device."
            />
        </>
    );
};
