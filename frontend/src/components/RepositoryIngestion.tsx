import React from 'react';
import { Database, FileCode } from 'lucide-react';
import { useIngestion } from '../hooks/useIngestion';
import { AddRepositoryForm } from './ingestion/AddRepositoryForm';
import { IngestionStatus } from './ingestion/IngestionStatus';
import { RecentActivity } from './ingestion/RecentActivity';

export const RepositoryIngestion: React.FC = () => {
    const {
        repoUrl, setRepoUrl,
        currentJob,
        completedJobs,
        isSubmitting,
        startIngestion,
        getStepStatus
    } = useIngestion();

    return (
        <main className="flex-1 flex flex-col h-full relative min-w-0 bg-gradient-to-br from-background-dark via-[#0f1219] to-black overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/5 px-8 py-6 bg-white/[0.02] backdrop-blur-md z-10 sticky top-0">
                <div className="flex flex-col gap-1">
                    <h2 className="text-white text-2xl font-bold leading-tight flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-lg">
                            <Database className="w-6 h-6 text-primary" />
                        </div>
                        Repository Ingestion
                    </h2>
                    <p className="text-sm text-text-secondary pl-[52px]">Connect codebases to your Knowledge Graph.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-sm font-medium">
                        <FileCode className="w-4 h-4" />
                        Documentation
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-12">

                    {/* Add New Repository Section */}
                    <AddRepositoryForm
                        repoUrl={repoUrl}
                        setRepoUrl={setRepoUrl}
                        onSubmit={startIngestion}
                        isSubmitting={isSubmitting}
                        hasActiveJob={!!currentJob}
                    />


                    {/* Ingestion Progress */}
                    {currentJob && (
                        <IngestionStatus job={currentJob} getStepStatus={getStepStatus} />
                    )}

                    {/* Completed Jobs */}
                    <RecentActivity jobs={completedJobs} />
                </div>
            </div>
        </main>
    );
};
