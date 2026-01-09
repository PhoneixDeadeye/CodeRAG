import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

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
        // Log to console in development only
        if (import.meta.env.MODE === 'development') {
            console.error(`Uncaught error in ${this.props.name || 'component'}:`, error, errorInfo);
        }
        // In production, send to error tracking service
        // e.g., Sentry, LogRocket, etc.
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="p-4 m-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center animate-fade-in">
                    <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-4xl text-red-500">
                            error_outline
                        </span>
                        <h3 className="text-lg font-bold text-red-400">Something went wrong</h3>
                        <p className="text-sm text-text-secondary max-w-md">
                            {this.state.error?.message || 'An unexpected error occurred in this component.'}
                        </p>
                        <button
                            onClick={() => this.setState({ hasError: false })}
                            className="mt-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-bold"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
