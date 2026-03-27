import type { ReactNode } from 'react';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../Toast';
import { ErrorBoundary } from '../ErrorBoundary';

interface AppProvidersProps {
    children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
    return (
        <AuthProvider>
            <ToastProvider>
                <ErrorBoundary name="App Root">
                    {children}
                </ErrorBoundary>
            </ToastProvider>
        </AuthProvider>
    );
}
