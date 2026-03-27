import React from 'react';
import { Rocket, Link as LinkIcon, Loader2 } from 'lucide-react';

interface AddRepositoryFormProps {
    repoUrl: string;
    setRepoUrl: (url: string) => void;
    onSubmit: () => void;
    isSubmitting: boolean;
    hasActiveJob: boolean;
}

export const AddRepositoryForm: React.FC<AddRepositoryFormProps> = ({
    repoUrl, setRepoUrl,
    onSubmit,
    isSubmitting,
    hasActiveJob
}) => {
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit();
    };

    return (
        <section className="relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black rounded-2xl border border-white/10" />
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className="relative p-1">
                <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                    <span className="flex items-center justify-center p-1.5 bg-emerald-500/10 rounded-lg">
                        <Rocket className="w-5 h-5 text-emerald-500" />
                    </span>
                    <h3 className="font-bold text-lg text-white">Add New Repository</h3>
                </div>

                <div className="p-6 md:p-8">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        {/* Repository URL */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Repository URL</label>
                            <div className="relative group/input">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-text-secondary group-focus-within/input:text-primary transition-colors">
                                    <LinkIcon className="w-5 h-5" />
                                </div>
                                <input
                                    type="text"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/organization/repository"
                                    className="w-full bg-black/20 border border-white/10 text-white rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all placeholder-white/20 font-mono shadow-inner"
                                />
                            </div>
                            <p className="text-xs text-text-secondary ml-1">
                                Only public GitHub repositories are supported.
                            </p>
                        </div>

                        {/* Submit Buttons */}
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={!repoUrl || isSubmitting || hasActiveJob}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-teal-600 hover:from-primary/90 hover:to-teal-600/90 text-white shadow-lg shadow-primary/25 transition-all font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
                                <span>Start Ingestion</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};
