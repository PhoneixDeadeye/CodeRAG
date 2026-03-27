import React, { useEffect, useState, createContext, useContext, useCallback } from 'react';

// Toast types
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    addToast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// Hook for using toasts
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// Individual Toast component
const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onRemove(toast.id), 300);
        }, toast.duration || 4000);

        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onRemove]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => onRemove(toast.id), 300);
    };

    const typeConfig = {
        success: {
            bg: 'bg-bg-surface',
            border: 'border-primary',
            icon: 'check_circle',
            iconColor: 'text-primary',
            textColor: 'text-primary'
        },
        error: {
            bg: 'bg-bg-surface',
            border: 'border-accent-rose',
            icon: 'error',
            iconColor: 'text-accent-rose',
            textColor: 'text-accent-rose'
        },
        warning: {
            bg: 'bg-bg-surface',
            border: 'border-accent-amber',
            icon: 'warning',
            iconColor: 'text-accent-amber',
            textColor: 'text-accent-amber'
        },
        info: {
            bg: 'bg-bg-surface',
            border: 'border-text-secondary',
            icon: 'info',
            iconColor: 'text-text-secondary',
            textColor: 'text-white'
        },
    };

    const config = typeConfig[toast.type];

    return (
        <div
            className={`flex items-start gap-3 px-4 py-3 border-l-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] transition-all duration-300 min-w-[300px] max-w-md ${config.bg} ${config.border} ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
                }`}
            role="alert"
        >
            <span className={`material-symbols-outlined mt-0.5 ${config.iconColor}`}>
                {config.icon}
            </span>
            <div className="flex-1">
                <p className={`text-xs font-bold uppercase tracking-wider font-mono mb-1 ${config.textColor}`}>
                    {toast.type}
                </p>
                <p className="text-sm text-white font-medium font-mono leading-snug">{toast.message}</p>
            </div>
            <button
                onClick={handleClose}
                className="p-1 -mr-2 -mt-1 text-text-muted hover:text-white transition-colors hover:bg-white/10"
            >
                <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
        </div>
    );
};

// Toast container and provider
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts(prev => [...prev, { id, message, type, duration }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            {/* Toast container - fixed position */}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-3 pointer-events-none">
                {toasts.map(toast => (
                    <div key={toast.id} className="pointer-events-auto animate-slide-in-right">
                        <ToastItem toast={toast} onRemove={removeToast} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

// Simple standalone toast function for use outside React components
let toastFunction: ((message: string, type?: ToastType, duration?: number) => void) | null = null;

export const setToastFunction = (fn: typeof toastFunction) => {
    toastFunction = fn;
};

export const toast = {
    success: (message: string, duration?: number) => toastFunction?.(message, 'success', duration),
    error: (message: string, duration?: number) => toastFunction?.(message, 'error', duration),
    warning: (message: string, duration?: number) => toastFunction?.(message, 'warning', duration),
    info: (message: string, duration?: number) => toastFunction?.(message, 'info', duration),
};
