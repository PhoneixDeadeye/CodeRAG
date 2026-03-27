import React, { useRef, useEffect } from 'react';
import { Terminal, GitBranch, Clock, CheckCircle2, AlertCircle, Loader2, Download, FileCode, Layers, Database } from 'lucide-react';
import clsx from 'clsx';
import type { IngestionJob } from '../../hooks/useIngestion';
import { STEPS } from '../../hooks/useIngestion';

interface IngestionStatusProps {
    job: IngestionJob;
    getStepStatus: (step: typeof STEPS[number]) => 'pending' | 'active' | 'completed' | 'failed';
}

export const IngestionStatus: React.FC<IngestionStatusProps> = ({ job, getStepStatus }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [job.logs]);

    return (
        <section className="animate-slide-in-right">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-3">
                    <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </div>
                    Ingestion in Progress
                </h3>
                <span className="text-xs text-text-secondary font-mono bg-white/5 px-2 py-1 rounded">ID: {job.id}</span>
            </div>

            <div className="glass border border-white/10 rounded-2xl shadow-xl p-6 flex flex-col gap-6">
                {/* Job Info */}
                <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                        <div className="size-14 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center">
                            <Terminal className="w-7 h-7 text-white/80" />
                        </div>
                        <div>
                            <h4 className="text-lg font-bold text-white tracking-tight">{job.repoUrl.split('/').slice(-2).join('/')}</h4>
                            <div className="flex items-center gap-3 text-sm text-text-secondary mt-1">
                                <span className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded text-xs font-mono border border-white/5">
                                    <GitBranch className="w-3 h-3" />
                                    {job.branch}
                                </span>
                                <span className="text-white/20">•</span>
                                <span className="text-xs flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Started {Math.floor((Date.now() - job.startedAt.getTime()) / 1000)}s ago
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-bold shadow-lg",
                        job.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            job.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    )}>
                        {job.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
                            job.status === 'failed' ? <AlertCircle className="w-4 h-4" /> :
                                <Loader2 className="w-4 h-4 animate-spin" />}
                        <span className="uppercase tracking-wide">
                            {job.status === 'completed' ? 'Complete' : job.status === 'failed' ? 'Failed' : 'Processing'}
                        </span>
                    </div>
                </div>

                {/* Progress Steps */}
                <div className="relative py-4">
                    <div className="flex items-center justify-between relative z-10">
                        {STEPS.map((step, index) => {
                            const status = getStepStatus(step);
                            return (
                                <React.Fragment key={step}>
                                    <div className="flex flex-col items-center gap-3">
                                        <div className={clsx(
                                            "size-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 border-4 border-[#161b26]",
                                            status === 'completed' ? 'bg-emerald-500 text-black shadow-emerald-500/20' :
                                                status === 'active' ? 'bg-primary text-white shadow-primary/40 scale-110' :
                                                    status === 'failed' ? 'bg-red-500 text-white shadow-red-500/20' :
                                                        'bg-slate-800 text-text-secondary'
                                        )}>
                                            {status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> :
                                                status === 'active' ? <Loader2 className="w-5 h-5 animate-spin" /> :
                                                    status === 'failed' ? <AlertCircle className="w-5 h-5" /> :
                                                        index === 0 ? <Download className="w-5 h-5" /> :
                                                            index === 1 ? <FileCode className="w-5 h-5" /> :
                                                                index === 2 ? <Layers className="w-5 h-5" /> :
                                                                    <Database className="w-5 h-5" />}
                                        </div>
                                        <span className={clsx(
                                            "text-xs font-bold uppercase tracking-wider transition-colors duration-300",
                                            status === 'completed' ? 'text-emerald-400' :
                                                status === 'active' ? 'text-white' :
                                                    status === 'failed' ? 'text-red-400' :
                                                        'text-text-muted'
                                        )}>{step}</span>
                                    </div>
                                    {index < STEPS.length - 1 && (
                                        <div className="flex-grow h-1 mx-4 bg-slate-800 rounded-full overflow-hidden relative">
                                            <div className={clsx(
                                                "h-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-700",
                                                getStepStatus(STEPS[index + 1]) !== 'pending' ? 'w-full' : 'w-0'
                                            )} />
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Terminal Log */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span className="font-mono">Real-time Logs</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live</span>
                    </div>
                    <div
                        ref={logContainerRef}
                        className="bg-black/40 rounded-xl border border-white/10 p-4 font-mono text-xs text-gray-400 max-h-48 overflow-y-auto scrollbar-thin"
                    >
                        <div className="flex flex-col gap-1.5">
                            {job.logs.map((log, i) => (
                                <div key={i} className={clsx(
                                    "flex items-start gap-2 border-l-2 pl-2 transition-opacity duration-300 animate-fade-in",
                                    log.includes('✓') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' :
                                        log.includes('✗') ? 'border-red-500 text-red-400 bg-red-500/5' :
                                            log.includes('➤') ? 'border-primary text-primary' :
                                                'border-transparent text-text-secondary'
                                )}>
                                    {log}
                                </div>
                            ))}
                            <div className="h-0" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
