import { useState, useEffect } from 'react';
import { listRepos, ingestRepo, type Repository } from '../lib/api';
import { logger } from '../lib/logger';

export interface IngestionJob {
    id: string;
    repoUrl: string;
    branch: string;
    status: 'cloning' | 'parsing' | 'chunking' | 'embedding' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    startedAt: Date;
    error?: string;
}

export interface CompletedJob {
    repoName: string;
    repoUrl: string;
    chunkCount: number;
    status: 'completed' | 'failed';
    error?: string;
    completedAt: string;
}

export const STEPS = ['Cloning', 'Parsing', 'Chunking', 'Embedding'] as const;

export function useIngestion() {
    const [repoUrl, setRepoUrl] = useState('');

    const [currentJob, setCurrentJob] = useState<IngestionJob | null>(null);
    const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load completed jobs
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
        }).catch(logger.error);
    }, []);

    const pollStatus = async (url: string) => {
        const interval = setInterval(async () => {
            try {
                const data = await listRepos();
                if (!data.repos) return;

                const repo = data.repos.find((r: Repository) => r.url === url);
                if (!repo) return;

                const isComplete = repo.status === 'ready' || repo.status === 'failed';

                let status: IngestionJob['status'] = 'cloning';
                let progress = 10;

                if (repo.status === 'cloning') { status = 'cloning'; progress = 20; }
                else if (repo.status === 'indexing') { status = 'embedding'; progress = 60; }
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
                logger.error("Polling error", e);
            }
        }, 2000);
    };

    const startIngestion = async () => {
        if (!repoUrl || isSubmitting || currentJob) return;

        setIsSubmitting(true);
        const jobId = `job_${Date.now()}`;

        setCurrentJob({
            id: jobId,
            repoUrl,
            branch: 'main',
            status: 'cloning',
            progress: 5,
            logs: [`[${new Date().toLocaleTimeString()}] Request sent to server...`],
            startedAt: new Date()
        });

        try {
            await ingestRepo(repoUrl, false);
            pollStatus(repoUrl);
            setRepoUrl('');
        } catch (error: any) {
            const err = error as { response?: { data?: { detail?: string | Array<{ msg: string }> } }; message?: string };
            let errorMessage = 'Ingestion failed';

            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                if (Array.isArray(detail)) {
                    errorMessage = detail.map(d => d.msg).join(', ');
                } else {
                    errorMessage = detail;
                }
            } else if (err.message) {
                errorMessage = err.message;
            }

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

    return {
        // Form State
        repoUrl, setRepoUrl,

        // Job State
        currentJob,
        completedJobs,
        isSubmitting,

        // Actions
        startIngestion,
        getStepStatus
    };
}

