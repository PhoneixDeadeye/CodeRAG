import React, { useState, useEffect } from 'react';
import { getConfig, listRepos, type AppConfig } from '../lib/api';
import { AuthModal } from './AuthModal';
import type { ChatSession } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';
import { logger } from '../lib/logger';

// Sub-components
import { RepoSwitcher, type Repository } from './sidebar/RepoSwitcher';
import { SidebarNavigation } from './sidebar/SidebarNavigation';
import { UserProfile } from './sidebar/UserProfile';

interface SidebarProps {
    onRepoSelect?: (repoId: string) => void;
    onSessionSelect?: (session: ChatSession | null) => void;
    currentSessionId?: string | null;
    onShowSearch?: () => void;
    onShowFiles?: () => void;
    onShowRepos?: () => void;
    onShowGraph?: () => void;
    onShowCodeSearch?: () => void;
    onShowVoice?: () => void;
    onShowAdmin?: () => void;
    onShowSettings?: () => void;
    isOpen: boolean;
    onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    onRepoSelect,
    onSessionSelect,
    currentSessionId,
    onShowSearch,
    onShowFiles,
    onShowRepos,
    onShowGraph,
    onShowCodeSearch,
    onShowVoice,
    onShowAdmin,
    onShowSettings,
    isOpen,
    onClose
}) => {
    const { user, logout, isGuest } = useAuth();
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>('');
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Load config and repositories on mount
    useEffect(() => {
        getConfig().then(setConfig).catch(err => {
            logger.error('Failed to load config:', err);
        });
        refreshRepos();
    }, [onRepoSelect]);

    const refreshRepos = () => {
        listRepos().then((data) => {
            const repos = data.repos || [];
            setRepositories(repos.map(r => ({ id: r.id, url: r.url, name: r.name, indexed_at: r.updated_at })));

            if (repos.length > 0) {
                const active = data.active;
                if (active) {
                    setSelectedRepoUrl(active.url);
                    // onRepoSelect?.(active.id); // Avoid re-triggering if not needed, or handle carefuly
                } else if (!selectedRepoUrl) {
                    setSelectedRepoUrl(repos[0].url);
                    onRepoSelect?.(repos[0].id);
                }
            }
        }).catch(err => {
            logger.error('Failed to load repos:', err);
        });
    };

    const handleRepoChange = (url: string) => {
        setSelectedRepoUrl(url);
        const repo = repositories.find(r => r.url === url);
        if (repo && onRepoSelect) {
            onRepoSelect(repo.id);
        }
    };



    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden animate-fade-in"
                    onClick={onClose}
                />
            )}

            <aside className={clsx(
                "fixed inset-y-0 left-0 z-40 w-80 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:relative md:flex bg-sidebar-dark backdrop-blur-xl border-r border-border-default",
                isOpen ? 'translate-x-0' : '-translate-x-full'
            )}>
                <RepoSwitcher
                    repositories={repositories}
                    selectedRepoUrl={selectedRepoUrl}
                    onRepoChange={handleRepoChange}
                    onMobileClose={onClose}
                />

                <SidebarNavigation
                    repositories={repositories}
                    currentSessionId={currentSessionId}
                    selectedRepoUrl={selectedRepoUrl || config?.current_repo || undefined}
                    onSessionSelect={onSessionSelect!}
                    onShowFiles={onShowFiles}
                    onShowSearch={onShowSearch}
                    onShowRepos={() => {
                        // Toggle ingest form or navigate to full repo manager?
                        // Original code had onShowRepos which navigated to 'repos' view
                        // BUT Sidebar also had 'showIngestForm' state which was toggled by... wait, it wasn't toggled by navigation.
                        // It was inside the 'Repositories' view.
                        // Wait, the original 'Sidebar' had a 'New Chat' button and stats.
                        // And buttons for 'Files Explorer', 'Global Search', 'Repositories'.
                        // Clicking 'Repositories' called onShowRepos().
                        // The 'Ingest Form' in original sidebar was shown when?
                        // Ah, I missed where `setShowIngestForm(true)` was called in original code!
                        // Looking back at original code view...
                        // It seems `setShowIngestForm` was initialized to false and NEVER set to true?
                        // Wait, looking at original Line 60: `const [showIngestForm, setShowIngestForm] = useState(false);`
                        // And Line 244: `{showIngestForm && (`
                        // I don't see any button setting it to true in the original code snippet I read.
                        // Start/End line 1..361.
                        // Maybe I missed a button.
                        // Ah, line 194-201 is 'New Chat'.
                        // Realization: The 'Ingest' form in the sidebar might have been a feature I missed the trigger for, or it was dead code, or I missed the 'Plus' button for it.
                        // Actually, 'Repositories' link (line 225) calls `onShowRepos`.
                        // The `RepositoryIngestion` component (view) has the form.
                        // So the `SidebarIngestForm` I just extracted might be redundant or unused in the previous Sidebar.
                        // However, keeping it as a component is fine. 

                        onShowRepos?.();
                    }}
                    onShowGraph={onShowGraph}
                    onShowCodeSearch={onShowCodeSearch}
                    onShowVoice={onShowVoice}
                    onShowAdmin={onShowAdmin}
                    onShowSettings={onShowSettings}
                    onMobileClose={onClose}
                />

                {/* 
                   If the original sidebar had a way to show ingest form inline, 
                   we would render SidebarIngestForm here. 
                   Since I couldn't find the trigger, I'll omit it for now or check if I missed it.
                   Wait, I see `handleIngest` in original code.
                   But no `setShowIngestForm(true)`. 
                   Maybe it was intended for the 'Repositories' view but placed in sidebar file?
                   Regardless, `RepositoryIngestion` view exists.
                */}

                <UserProfile
                    user={user}
                    isGuest={isGuest}
                    logout={logout}
                    onShowVoice={onShowVoice}
                    onShowAuth={() => setShowAuthModal(true)}
                    onMobileClose={onClose}
                />
            </aside>

            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                message="Log in to save your chat history and access it from any device."
            />
        </>
    );
};
