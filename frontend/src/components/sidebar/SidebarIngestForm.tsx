import React, { useState } from 'react';
import { Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { ingestRepo } from '../../lib/api';

interface SidebarIngestFormProps {
    onIngestComplete: () => void;
    onClose: () => void;
}

export const SidebarIngestForm: React.FC<SidebarIngestFormProps> = ({
    onIngestComplete,
    onClose
}) => {
    const [repoUrl, setRepoUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

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
            // Optional: Close form after delay or immediately? Original implementation closed it.
            // But here we might want to keep success msg visible.
            // Let's rely on parent to hide or just reset. 
            // The original logic called setShowIngestForm(false).
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: any) {
            setStatus('error');
            setMessage(err.response?.data?.detail || 'Failed to ingest repository.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-1 p-4 bg-bg-surface border border-border-default mb-4 animate-fade-in">
            <h3 className="text-xs font-bold text-primary mb-3 uppercase tracking-wider font-mono">// INGEST_REPOSITORY</h3>
            <form onSubmit={handleIngest} className="space-y-3">
                <div className="relative group">
                    <input
                        type="url"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="GITHUB_URL..."
                        className="w-full bg-black border border-border-default rounded-none px-3 py-2 text-xs text-white focus:outline-none focus:border-primary focus:shadow-[4px_4px_0px_0px_#CCFF00] placeholder:text-text-muted font-mono transition-all"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !repoUrl}
                    className={clsx(
                        "w-full font-bold py-2 px-3 rounded-none transition-all flex items-center justify-center gap-2 text-xs font-mono uppercase border border-transparent",
                        loading || !repoUrl
                            ? "bg-border-default text-text-muted cursor-not-allowed"
                            : "bg-primary text-black hover:bg-white hover:border-white shadow-[4px_4px_0px_0px_white] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
                    )}
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>PROCESSING...</span>
                        </>
                    ) : (
                        <>
                            <Download className="w-3.5 h-3.5" />
                            <span>INIT_INGESTION</span>
                        </>
                    )}
                </button>
            </form>

            {status !== 'idle' && (
                <div className={clsx("mt-3 p-3 border-l-2 text-xs flex items-start gap-2 font-mono",
                    status === 'success' ? 'bg-primary/10 border-primary text-primary' : 'bg-accent-rose/10 border-accent-rose text-accent-rose'
                )}>
                    {status === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <p className="uppercase tracking-wide">{message}</p>
                </div>
            )}
        </div>
    );
};
