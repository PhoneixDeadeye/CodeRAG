import React from 'react';
import { Terminal, X, ArrowRight } from 'lucide-react';

export interface Repository {
    id: string;
    url: string;
    name: string;
    indexed_at: string;
}

interface RepoSwitcherProps {
    repositories: Repository[];
    selectedRepoUrl: string;
    onRepoChange: (url: string) => void;
    onMobileClose: () => void;
}

export const RepoSwitcher: React.FC<RepoSwitcherProps> = ({
    repositories,
    selectedRepoUrl,
    onRepoChange,
    onMobileClose
}) => {

    const getRepoDisplayName = (url: string) => {
        const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
        return match ? match[1] : url;
    };

    return (
        <div className="p-5 flex flex-col gap-6 border-b border-border-default bg-bg-surface">
            {/* Header / Brand */}
            <div className="flex items-center gap-3">
                <div className="relative group">
                    <div className="size-10 border border-primary flex items-center justify-center text-primary shadow-[4px_4px_0px_0px_rgba(204,255,0,0.2)] group-hover:translate-x-1 group-hover:translate-y-1 group-hover:shadow-none transition-all">
                        <Terminal className="w-6 h-6" />
                    </div>
                </div>
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold tracking-tight text-white font-display uppercase">CodeRAG</h1>
                    <span className="text-[10px] text-primary font-mono tracking-wider uppercase opacity-80">v1.0.0_beta</span>
                </div>
                <button onClick={onMobileClose} className="md:hidden ml-auto p-2 text-primary hover:bg-primary hover:text-black transition-colors border border-transparent hover:border-primary">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Repo Dropdown */}
            {repositories.length > 0 && (
                <div className="flex flex-col gap-2 animate-fade-in-up">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider font-mono pl-1">
                        Select_Repository:
                    </label>
                    <div className="relative group">
                        <select
                            value={selectedRepoUrl}
                            onChange={(e) => onRepoChange(e.target.value)}
                            className="appearance-none w-full bg-black border border-border-default text-white rounded-none pl-4 pr-10 py-3 text-sm focus:outline-none focus:border-primary focus:shadow-[4px_4px_0px_0px_#CCFF00] font-mono cursor-pointer transition-all hover:border-text-secondary"
                        >
                            {repositories.map((repo) => (
                                <option key={repo.url} value={repo.url} className="bg-black text-white font-mono">
                                    {getRepoDisplayName(repo.url)}
                                </option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-primary bg-border-subtle/20 border-l border-border-default">
                            <ArrowRight className="w-4 h-4 rotate-90" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
