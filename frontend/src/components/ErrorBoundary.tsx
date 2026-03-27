import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '../lib/logger';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error(`Uncaught error in ${this.props.name || 'component'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-bg-base text-primary font-display p-6">
                    <div className="max-w-md w-full border border-border-default shadow-[4px_4px_0_0_rgb(var(--primary))] p-8 space-y-6 animate-fade-in bg-black">
                        <div className="flex items-center space-x-3 text-red-500">
                            <AlertTriangle className="w-8 h-8" />
                            <h1 className="text-2xl font-bold uppercase tracking-wider">System Error</h1>
                        </div>
                        
                        <p className="text-text-secondary leading-relaxed">
                            We encountered an unexpected application error in <strong>{this.props.name || 'Core System'}</strong>.
                        </p>
                        
                        <div className="bg-bg-elevation-1 p-4 rounded text-xs font-mono text-text-muted overflow-auto max-h-40 break-all border border-border-default">
                            {this.state.error?.toString() || 'An unexpected error occurred.'}
                        </div>
                        
                        <button
                            onClick={() => {
                                this.setState({ hasError: false });
                                window.location.reload();
                            }}
                            className="w-full flex items-center justify-center space-x-2 bg-primary text-black font-semibold py-3 px-4 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_white] border border-transparent transition-all"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span>RESTART SYSTEM</span>
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
