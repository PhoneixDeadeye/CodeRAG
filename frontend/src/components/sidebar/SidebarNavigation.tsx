import React from 'react';
import {
    Plus, FolderOpen, Search, Database,
    Network, Code, ArrowRight, Mic, History, BarChart3, Settings
} from 'lucide-react';
import { SessionManager } from '../SessionManager';
import type { ChatSession } from '../../lib/api'; // Adjust path based on location
import type { Repository } from './RepoSwitcher'; // Import type if needed or redefine

interface SidebarNavigationProps {
    repositories: Repository[];
    currentSessionId?: string | null;
    selectedRepoUrl?: string; // For session manager
    onSessionSelect: (session: ChatSession | null) => void;
    onShowFiles?: () => void;
    onShowSearch?: () => void;
    onShowRepos?: () => void;
    onShowGraph?: () => void;
    onShowCodeSearch?: () => void;
    onShowVoice?: () => void;
    onShowAdmin?: () => void;
    onShowSettings?: () => void;
    onMobileClose: () => void;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
    repositories,
    currentSessionId,
    selectedRepoUrl,
    onSessionSelect,
    onShowFiles,
    onShowSearch,
    onShowRepos,
    onShowGraph,
    onShowCodeSearch,
    onShowVoice,
    onShowAdmin,
    onShowSettings,
    onMobileClose
}) => {

    const handleAction = (action?: () => void) => {
        action?.();
        if (window.innerWidth < 768) onMobileClose();
    };

    return (
        <div className="flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-8 scrollbar-thin">
            {/* Main Actions */}
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => handleAction(() => onSessionSelect(null))}
                    className="w-full btn-primary flex items-center justify-center gap-3 transition-all group relative overflow-hidden"
                >
                    <Plus className="w-5 h-5 relative z-10" />
                    <span className="relative z-10 font-mono text-sm leading-none pt-0.5">INIT_NEW_SESSION</span>
                </button>

                {/* Quick Stats (Raw Data) */}
                {repositories.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="border border-border-default p-2 text-center group hover:border-primary transition-colors bg-bg-surface">
                            <div className="text-xl font-bold text-primary font-mono group-hover:translate-x-1 transition-transform">{repositories.length}</div>
                            <div className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">REPOS</div>
                        </div>
                        <div className="border border-border-default p-2 text-center group hover:border-primary transition-colors bg-bg-surface">
                            <div className="text-xl font-bold text-primary font-mono group-hover:translate-x-1 transition-transform">ON</div>
                            <div className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">SYSTEM</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Menu (Terminal List) */}
            <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-3 mb-1 font-mono border-b border-border-subtle pb-2">
                    // SYSTEM_MODULES
                </h3>
                <nav className="flex flex-col gap-0 border-l border-border-subtle ml-2 pl-2">
                    {[
                        { icon: FolderOpen, label: 'FILESYSTEM', action: onShowFiles },
                        { icon: Search, label: 'GLOBAL_SEARCH', action: onShowSearch },
                        { icon: Database, label: 'REPOSITORIES', action: onShowRepos },
                        { icon: Network, label: 'DEP_GRAPH', action: onShowGraph },
                        { icon: Code, label: 'CODE_QUERY', action: onShowCodeSearch },
                        { icon: Mic, label: 'VOICE_CMD', action: onShowVoice },
                        { icon: BarChart3, label: 'ADMIN_PANEL', action: onShowAdmin },
                        { icon: Settings, label: 'SETTINGS', action: onShowSettings }
                    ].map((item, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleAction(item.action)}
                            className="flex items-center gap-3 px-3 py-3 text-text-muted hover:text-black hover:bg-primary active:translate-x-1 transition-all group w-full text-left relative overflow-hidden font-mono text-xs tracking-wider"
                        >
                            <item.icon className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-all" />
                            <span className="font-bold">{item.label}</span>
                            <ArrowRight className="w-3 h-3 text-black opacity-0 group-hover:opacity-100 transition-all ml-auto" />
                        </button>
                    ))}
                </nav>
            </div>

            {/* Session Manager (History) */}
            {onSessionSelect && (
                <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-border-default">
                    <div className="flex items-center justify-between px-3">
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest font-mono">
                            // SESSION_LOGS
                        </h3>
                        <button className="text-text-secondary hover:text-primary transition-colors">
                            <History className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="rounded-none mx-1">
                        <SessionManager
                            currentSessionId={currentSessionId || null}
                            onSessionSelect={(s) => handleAction(() => onSessionSelect(s))}
                            repoUrl={selectedRepoUrl}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
