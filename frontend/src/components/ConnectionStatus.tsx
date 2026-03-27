import React, { useState, useEffect, useCallback } from 'react';
import { checkBackendHealth, checkAIHealth, type AIHealthStatus } from '../lib/api';
import {
    Activity, RefreshCw, Server, Cpu,
    AlertTriangle, ShieldCheck, Clock
} from 'lucide-react';
import clsx from 'clsx';

interface ConnectionStatusProps {
    className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ className = '' }) => {
    const [backendStatus, setBackendStatus] = useState<'checking' | 'healthy' | 'error'>('checking');
    const [aiStatus, setAiStatus] = useState<AIHealthStatus | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const checkStatus = useCallback(async () => {
        // Check backend
        try {
            await checkBackendHealth();
            setBackendStatus('healthy');
        } catch {
            setBackendStatus('error');
        }

        // Check AI (only if backend is healthy)
        try {
            const aiHealth = await checkAIHealth();
            setAiStatus(aiHealth);
        } catch {
            setAiStatus({ status: 'error', provider: 'unknown', model: 'unknown', error: 'Failed to check' });
        }

        setLastChecked(new Date());
    }, []);

    // Initial check and periodic refresh
    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [checkStatus]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy':
                return 'bg-emerald-500';
            case 'degraded':
                return 'bg-amber-500';
            case 'checking':
                return 'bg-blue-500 animate-pulse';
            default:
                return 'bg-rose-500';
        }
    };

    const getStatusText = () => {
        if (backendStatus === 'checking') return 'Checking...';
        if (backendStatus === 'error') return 'Backend Offline';
        if (!aiStatus) return 'Backend Online';
        if (aiStatus.status === 'healthy') return 'Operational';
        if (aiStatus.status === 'degraded') return 'Degraded';
        return 'AI Unavailable';
    };

    const overallStatus = backendStatus === 'error' ? 'error' :
        backendStatus === 'checking' ? 'checking' :
            aiStatus?.status === 'healthy' ? 'healthy' :
                aiStatus?.status === 'degraded' ? 'degraded' : 'error';

    return (
        <div className={clsx("relative", className)}>
            {/* Compact indicator */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-all text-[11px] font-bold uppercase tracking-wider group"
                title="System Status"
            >
                <div className="relative">
                    <span className={clsx("block w-2 h-2 rounded-full", getStatusColor(overallStatus))} />
                    {overallStatus === 'healthy' && (
                        <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40"></span>
                    )}
                </div>
                <span className="text-text-secondary group-hover:text-white transition-colors">{getStatusText()}</span>
            </button>

            {/* Expanded panel */}
            {isExpanded && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
                        onClick={() => setIsExpanded(false)}
                    />
                    <div className="absolute top-full right-0 mt-3 w-80 glass-strong border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-fade-in-up origin-top-right">
                        {/* Header */}
                        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                <h3 className="text-sm font-bold text-white tracking-tight">System Identity</h3>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    checkStatus();
                                }}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-text-secondary hover:text-white transition-all active:rotate-180 duration-500"
                                title="Refresh Status"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Status List */}
                        <div className="p-5 space-y-5">
                            {/* Backend Status */}
                            <div className="flex items-center justify-between group/status">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                        <Server className="w-4 h-4 text-indigo-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-200">Core API</span>
                                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Backend Server</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter",
                                        backendStatus === 'healthy' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                    )}>
                                        {backendStatus}
                                    </span>
                                </div>
                            </div>

                            {/* AI Service Status */}
                            <div className="flex items-center justify-between group/status">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                                        <Cpu className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-200">Intelligence</span>
                                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">LLM Provider</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter",
                                        aiStatus?.status === 'healthy' ? "bg-emerald-500/20 text-emerald-400" :
                                            aiStatus?.status === 'degraded' ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
                                    )}>
                                        {aiStatus?.status || 'checking'}
                                    </span>
                                </div>
                            </div>

                            {/* Provider Details Panel */}
                            {aiStatus && (
                                <div className="mt-4 p-4 bg-black/40 border border-white/5 rounded-xl space-y-3 relative overflow-hidden group/details">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover/details:opacity-20 transition-opacity">
                                        <Activity className="w-10 h-10 text-primary" />
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] text-text-muted font-bold uppercase">Provider</span>
                                        <span className="text-xs text-white font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                            {aiStatus.provider}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] text-text-muted font-bold uppercase">Active Model</span>
                                        <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                            {aiStatus.model}
                                        </span>
                                    </div>
                                    {aiStatus.error && (
                                        <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-2">
                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                            <span className="text-[10px] text-rose-300 font-medium leading-relaxed">
                                                {aiStatus.error}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-white/5 bg-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                <Clock className="w-3 h-3" />
                                {lastChecked ? lastChecked.toLocaleTimeString() : 'Never'}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">Real-time</span>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
