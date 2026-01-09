import React, { useState, useEffect, useRef } from 'react';
import { ingestRepo, listRepos, type Repository } from '../lib/api';

interface IngestionJob {
    id: string;
    repoUrl: string;
    branch: string;
    status: 'cloning' | 'parsing' | 'chunking' | 'embedding' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    startedAt: Date;
    error?: string;
}

interface CompletedJob {
    repoName: string;
    repoUrl: string;
    chunkCount: number;
    status: 'completed' | 'failed';
    error?: string;
    completedAt: string;
}

const STEPS = ['Cloning', 'Parsing', 'Chunking', 'Embedding'] as const;

export const RepositoryIngestion: React.FC = () => {
    const [repoUrl, setRepoUrl] = useState('');
    const [branch, setBranch] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [excludePatterns, setExcludePatterns] = useState('**/dist, *.md');
    const [chunkStrategy, setChunkStrategy] = useState('semantic');

    const [autoSync, setAutoSync] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [currentJob, setCurrentJob] = useState<IngestionJob | null>(null);
    const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const logContainerRef = useRef<HTMLDivElement>(null);

    // Load completed jobs from repos
    useEffect(() => {
        listRepos().then(data => {
            const jobs: CompletedJob[] = data.repos?.map((r: Repository) => ({
                repoName: r.name,
                repoUrl: r.url,
                chunkCount: r.chunk_count,
                status: 'completed' as const,
                completedAt: r.updated_at
            })) || [];
            setCompletedJobs(jobs.slice(0, 4));
        }).catch(console.error);
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [currentJob?.logs]);

    const pollStatus = async (repoUrl: string) => {
        const interval = setInterval(async () => {
            try {
                const data = await listRepos();
                if (!data.repos) return;

                // Find our repo
                const repo = data.repos.find((r: Repository) => r.url === repoUrl);
                if (!repo) return;

                const isComplete = repo.status === 'ready' || repo.status === 'failed';

                // Map backend status to UI Steps
                let status: IngestionJob['status'] = 'cloning';
                let progress = 10;

                if (repo.status === 'cloning') { status = 'cloning'; progress = 20; }
                else if (repo.status === 'indexing') { status = 'embedding'; progress = 60; } // Assuming indexing covers everything
                else if (repo.status === 'ready') { status = 'completed'; progress = 100; }
                else if (repo.status === 'failed') { status = 'failed'; progress = 100; }

                setCurrentJob(prev => prev ? {
                    ...prev,
                    status,
                    progress,
                    error: repo.status === 'failed' ? 'Ingestion Failed' : undefined
                } : null);

                if (isComplete) {
                    clearInterval(interval);
                    if (repo.status === 'ready') {
                        setCompletedJobs(prev => [{
                            repoName: repo.name,
                            repoUrl: repo.url,
                            chunkCount: repo.chunk_count,
                            status: 'completed',
                            completedAt: new Date().toISOString()
                        }, ...prev]);
                        setTimeout(() => setCurrentJob(null), 3000);
                    } else {
                        setTimeout(() => setCurrentJob(null), 5000);
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 2000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl || isSubmitting || currentJob) return;

        // No longer checking for guest - ingestion works for everyone

        setIsSubmitting(true);

        const jobId = `job_${Date.now()}`;
        const job: IngestionJob = {
            id: jobId,
            repoUrl,
            branch: branch || 'main',
            status: 'cloning',
            progress: 5,
            logs: [`[${new Date().toLocaleTimeString()}] Request sent to server...`],
            startedAt: new Date()
        };
        setCurrentJob(job);

        try {
            await ingestRepo(repoUrl, false);
            // Start polling
            pollStatus(repoUrl);
            // Clear inputs only on success or when starting poll
            setRepoUrl('');
            setBranch('');
            setAccessToken('');
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string } }; message?: string };
            const errorMessage = err.response?.data?.detail || err.message || 'Ingestion failed';
            setCurrentJob(prev => prev ? {
                ...prev,
                status: 'failed',
                logs: [...prev.logs, `Error: ${errorMessage}`],
                error: errorMessage
            } : null);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStepStatus = (step: typeof STEPS[number]) => {
        if (!currentJob) return 'pending';
        const stepMap: Record<string, number> = { 'Cloning': 0, 'Parsing': 1, 'Chunking': 2, 'Embedding': 3 };
        const statusToStep: Record<string, string> = { 'cloning': 'Cloning', 'parsing': 'Parsing', 'chunking': 'Chunking', 'embedding': 'Embedding' };
        const stepIndex = stepMap[step] ?? -1;
        const currentStepName = statusToStep[currentJob.status] || '';
        const currentIndex = stepMap[currentStepName] ?? -1;

        if (currentJob.status === 'completed') return 'completed';
        if (currentJob.status === 'failed') return stepIndex <= currentIndex ? 'failed' : 'pending';
        if (stepIndex < currentIndex) return 'completed';
        if (stepIndex === currentIndex) return 'active';
        return 'pending';
    };

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };

    return (
        <main className="flex-1 flex flex-col h-full relative min-w-0 bg-background-dark overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border-dark px-8 py-5 bg-background-dark/80 backdrop-blur-md z-10">
                <div className="flex flex-col">
                    <h2 className="text-white text-xl font-bold leading-tight flex items-center gap-2">
                        Repository Ingestion
                    </h2>
                    <p className="text-sm text-text-secondary">Connect new codebases to the CodeRAG knowledge engine.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-dark hover:bg-border-dark text-text-secondary hover:text-white transition-colors text-sm font-medium">
                        <span className="material-symbols-outlined text-[18px]">help</span>
                        Documentation
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
                <div className="max-w-5xl mx-auto flex flex-col gap-8 pb-12">

                    {/* Add New Repository Section */}
                    <section className="bg-[#161b26] border border-border-dark rounded-xl shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#192233]/50 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">add_circle</span>
                            <h3 className="font-bold text-lg">Add New Repository</h3>
                        </div>
                        <div className="p-6 md:p-8">
                            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                                {/* Repository URL */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-text-secondary">Repository URL</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-secondary group-focus-within:text-primary transition-colors">
                                            <span className="material-symbols-outlined">link</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={repoUrl}
                                            onChange={(e) => setRepoUrl(e.target.value)}
                                            placeholder="https://github.com/organization/repository"
                                            className="w-full bg-[#0d1117] border border-border-dark text-white rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder-gray-600 font-mono"
                                        />
                                    </div>
                                    <p className="text-xs text-text-secondary/70">Supported: GitHub, GitLab, Bitbucket. Public or private repositories.</p>
                                </div>

                                {/* Branch & Token */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-text-secondary">Branch (Optional)</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-secondary">
                                                <span className="material-symbols-outlined text-[18px]">call_split</span>
                                            </div>
                                            <input
                                                type="text"
                                                value={branch}
                                                onChange={(e) => setBranch(e.target.value)}
                                                placeholder="main"
                                                className="w-full bg-[#0d1117] border border-border-dark text-white rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-text-secondary flex justify-between">
                                            Personal Access Token
                                            <span className="text-[10px] text-primary uppercase bg-primary/10 px-1.5 py-0.5 rounded font-bold">Secure</span>
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-secondary">
                                                <span className="material-symbols-outlined text-[18px]">key</span>
                                            </div>
                                            <input
                                                type="password"
                                                value={accessToken}
                                                onChange={(e) => setAccessToken(e.target.value)}
                                                placeholder="ghp_************************"
                                                className="w-full bg-[#0d1117] border border-border-dark text-white rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Advanced Options */}
                                <div className="border-t border-border-dark/50 pt-4 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-white transition-colors"
                                    >
                                        <span className={`material-symbols-outlined transition-transform text-[18px] ${showAdvanced ? 'rotate-90' : ''}`}>
                                            chevron_right
                                        </span>
                                        Advanced Ingestion Preferences
                                    </button>

                                    {showAdvanced && (
                                        <div className="pl-7 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-medium text-text-secondary">Exclude Patterns (Glob)</label>
                                                <input
                                                    type="text"
                                                    value={excludePatterns}
                                                    onChange={(e) => setExcludePatterns(e.target.value)}
                                                    className="w-full bg-[#0d1117] border border-border-dark text-white rounded px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-primary focus:border-primary"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-medium text-text-secondary">Chunk Strategy</label>
                                                <select
                                                    value={chunkStrategy}
                                                    onChange={(e) => setChunkStrategy(e.target.value)}
                                                    className="w-full bg-[#0d1117] border border-border-dark text-white rounded px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:border-primary"
                                                >
                                                    <option value="semantic">Semantic (Recommended)</option>
                                                    <option value="fixed-512">Fixed Size (512 tokens)</option>
                                                    <option value="fixed-1024">Fixed Size (1024 tokens)</option>
                                                </select>
                                            </div>
                                            <div className="md:col-span-2 flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    id="auto-sync"
                                                    checked={autoSync}
                                                    onChange={(e) => setAutoSync(e.target.checked)}
                                                    className="rounded bg-[#0d1117] border-border-dark text-primary focus:ring-0"
                                                />
                                                <label htmlFor="auto-sync" className="text-sm text-text-secondary select-none cursor-pointer">
                                                    Enable daily auto-sync for this repository
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Submit Buttons */}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        className="px-5 py-2.5 rounded-lg border border-border-dark text-white hover:bg-[#232f48] transition-colors font-medium text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!repoUrl || isSubmitting || !!currentJob}
                                        className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/25 transition-all font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                                        Start Ingestion
                                    </button>
                                </div>
                            </form>
                        </div>
                    </section>

                    {/* Ingestion Progress */}
                    {currentJob && (
                        <section className="animate-fade-in">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                    </span>
                                    Ingestion in Progress
                                </h3>
                                <span className="text-xs text-text-secondary font-mono">ID: {currentJob.id}</span>
                            </div>

                            <div className="bg-[#161b26] border border-border-dark rounded-xl shadow-lg p-6 flex flex-col gap-6">
                                {/* Job Info */}
                                <div className="flex items-start justify-between">
                                    <div className="flex gap-4">
                                        <div className="size-12 rounded-lg bg-[#0d1117] border border-border-dark flex items-center justify-center">
                                            <span className="material-symbols-outlined text-[24px] text-white opacity-80">code</span>
                                        </div>
                                        <div>
                                            <h4 className="text-base font-bold text-white">{currentJob.repoUrl.split('/').slice(-2).join('/')}</h4>
                                            <div className="flex items-center gap-2 text-sm text-text-secondary mt-0.5">
                                                <span className="material-symbols-outlined text-[14px]">call_split</span>
                                                <span className="font-mono">{currentJob.branch}</span>
                                                <span className="text-border-dark">•</span>
                                                <span className="text-xs">Started {Math.floor((Date.now() - currentJob.startedAt.getTime()) / 1000)}s ago</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${currentJob.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                        currentJob.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        }`}>
                                        <span className={`material-symbols-outlined text-[16px] ${currentJob.status !== 'completed' && currentJob.status !== 'failed' ? 'animate-spin' : ''}`}>
                                            {currentJob.status === 'completed' ? 'check_circle' : currentJob.status === 'failed' ? 'error' : 'sync'}
                                        </span>
                                        <span className="text-xs font-bold uppercase tracking-wide">
                                            {currentJob.status === 'completed' ? 'Complete' : currentJob.status === 'failed' ? 'Failed' : 'Processing'}
                                        </span>
                                    </div>
                                </div>

                                {/* Progress Steps */}
                                <div className="relative">
                                    <div className="flex items-center justify-between relative z-10">
                                        {STEPS.map((step, index) => {
                                            const status = getStepStatus(step);
                                            return (
                                                <React.Fragment key={step}>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className={`size-8 rounded-full flex items-center justify-center font-bold shadow-lg ${status === 'completed' ? 'bg-green-500 text-black shadow-green-500/20' :
                                                            status === 'active' ? 'bg-primary text-white shadow-primary/40 border-4 border-[#161b26]' :
                                                                status === 'failed' ? 'bg-red-500 text-white shadow-red-500/20' :
                                                                    'bg-[#232f48] text-text-secondary border-4 border-[#161b26]'
                                                            }`}>
                                                            {status === 'completed' ? (
                                                                <span className="material-symbols-outlined text-[18px]">check</span>
                                                            ) : status === 'active' ? (
                                                                <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                                            ) : status === 'failed' ? (
                                                                <span className="material-symbols-outlined text-[16px]">close</span>
                                                            ) : (
                                                                <span className="material-symbols-outlined text-[16px]">
                                                                    {index === 0 ? 'download' : index === 1 ? 'account_tree' : index === 2 ? 'data_object' : 'database'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className={`text-xs font-medium ${status === 'completed' ? 'text-green-400' :
                                                            status === 'active' ? 'text-white font-bold' :
                                                                'text-text-secondary'
                                                            }`}>{step}</span>
                                                    </div>
                                                    {index < STEPS.length - 1 && (
                                                        <div className={`flex-grow h-0.5 mx-4 ${getStepStatus(STEPS[index + 1]) !== 'pending' ? 'bg-primary' : 'bg-[#232f48]'
                                                            }`} />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Terminal Log */}
                                <div
                                    ref={logContainerRef}
                                    className="bg-[#0d1117] rounded-lg border border-border-dark p-4 font-mono text-xs text-gray-400 max-h-48 overflow-y-auto"
                                >
                                    <div className="flex flex-col gap-1">
                                        {currentJob.logs.map((log, i) => (
                                            <div key={i} className={`flex items-start gap-2 ${log.includes('✓') ? 'text-green-400' :
                                                log.includes('✗') ? 'text-red-400' :
                                                    log.includes('➤') ? 'text-primary animate-pulse' :
                                                        'text-text-secondary'
                                                }`}>
                                                {log}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Completed Jobs */}
                    {completedJobs.length > 0 && (
                        <section>
                            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">Completed Recently</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {completedJobs.map((job, i) => (
                                    <div
                                        key={i}
                                        className="bg-[#161b26] border border-border-dark/50 hover:border-border-dark rounded-lg p-4 flex items-center justify-between group transition-all cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`size-10 rounded flex items-center justify-center ${job.status === 'completed' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                                }`}>
                                                <span className="material-symbols-outlined">
                                                    {job.status === 'completed' ? 'check_circle' : 'error'}
                                                </span>
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                                                    {job.repoName}
                                                </div>
                                                <div className={`text-xs ${job.status === 'completed' ? 'text-text-secondary' : 'text-red-400'}`}>
                                                    {job.status === 'completed'
                                                        ? `Indexed ${job.chunkCount.toLocaleString()} chunks • ${formatTimeAgo(job.completedAt)}`
                                                        : `Failed: ${job.error || 'Unknown error'} • ${formatTimeAgo(job.completedAt)}`
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                        <button className="text-text-secondary hover:text-white p-2">
                                            <span className="material-symbols-outlined text-[20px]">
                                                {job.status === 'completed' ? 'chevron_right' : 'refresh'}
                                            </span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </main>
    );
};
