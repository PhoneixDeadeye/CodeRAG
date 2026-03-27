import React from 'react';
import { Clock, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { CompletedJob } from '../../hooks/useIngestion';

interface RecentActivityProps {
    jobs: CompletedJob[];
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ jobs }) => {
    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };

    if (jobs.length === 0) return null;

    return (
        <section>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recent Activity
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map((job, i) => (
                    <div
                        key={i}
                        className="bg-white/[0.03] border border-white/5 hover:border-white/20 hover:bg-white/[0.05] rounded-xl p-4 flex items-center justify-between group transition-all cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        <div className="flex items-center gap-4">
                            <div className={clsx(
                                "size-12 rounded-xl flex items-center justify-center border",
                                job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                            )}>
                                {job.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                                    {job.repoName}
                                </div>
                                <div className={clsx("text-xs mt-0.5", job.status === 'completed' ? 'text-text-secondary' : 'text-red-400')}>
                                    {job.status === 'completed'
                                        ? `${job.chunkCount.toLocaleString()} chunks • ${formatTimeAgo(job.completedAt)}`
                                        : `Failed • ${formatTimeAgo(job.completedAt)}`
                                    }
                                </div>
                                {job.status === 'failed' && job.error && (
                                    <div className="text-[10px] text-red-400/80 mt-1 max-w-[200px] truncate">
                                        {job.error}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button className="text-text-muted hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
};
