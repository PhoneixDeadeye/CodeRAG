import React, { useState } from 'react';
import {
    Plus, X, MessageSquarePlus, Search,
    FolderOpen, ArrowUp, type LucideIcon
} from 'lucide-react';
import clsx from 'clsx';

interface FloatingAction {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    color?: string;
}

interface FloatingActionsProps {
    actions: FloatingAction[];
    position?: 'bottom-right' | 'bottom-left';
}

export const FloatingActions: React.FC<FloatingActionsProps> = ({
    actions,
    position = 'bottom-right'
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const positionClasses = position === 'bottom-right'
        ? 'right-8 bottom-8 md:right-10 md:bottom-10'
        : 'left-8 bottom-8 md:left-10 md:bottom-10';

    const actionOrigin = position === 'bottom-right' ? 'items-end' : 'items-start';

    return (
        <div className={clsx("fixed z-50 flex flex-col gap-4", positionClasses, actionOrigin)}>
            {/* Action buttons - shown when expanded */}
            <div className={clsx(
                "flex flex-col gap-3 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
                actionOrigin,
                isExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
            )}>
                {actions.map((action, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            action.onClick();
                            setIsExpanded(false);
                        }}
                        className="group flex items-center gap-4 pl-5 pr-2.5 py-2.5 glass-strong border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:border-primary/40 hover:bg-white/5 transition-all duration-300 hover:scale-[1.05] active:scale-[0.98] group/item"
                        style={{
                            transitionDelay: isExpanded ? `${index * 60}ms` : '0ms'
                        }}
                    >
                        <span className="text-sm text-text-secondary font-bold tracking-tight group-hover/item:text-white transition-colors">
                            {action.label}
                        </span>
                        <div className={clsx(
                            "size-10 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover/item:rotate-12",
                            action.color || 'bg-primary'
                        )}>
                            <action.icon className="w-5 h-5 text-white" />
                        </div>
                    </button>
                ))}
            </div>

            {/* Main FAB button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                    "relative size-16 rounded-2xl flex items-center justify-center shadow-[0_15px_40px_rgba(0,0,0,0.4)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group",
                    isExpanded
                        ? "bg-[#1a1d26] border border-white/10 rotate-[135deg] scale-90"
                        : "bg-gradient-to-br from-primary via-indigo-600 to-indigo-700 hover:scale-110 active:scale-90"
                )}
            >
                {/* Visual pulse for attention */}
                {!isExpanded && (
                    <div className="absolute inset-0 bg-primary/40 rounded-2xl blur-xl animate-pulse group-hover:bg-primary/60"></div>
                )}

                {isExpanded ? (
                    <X className="w-7 h-7 text-white relative z-10" />
                ) : (
                    <Plus className="w-8 h-8 text-white relative z-10 group-hover:rotate-90 transition-transform duration-500" />
                )}
            </button>
        </div>
    );
};

// Preset configurations for common use cases
export const useFloatingActions = (callbacks: {
    onNewChat?: () => void;
    onSearch?: () => void;
    onFiles?: () => void;
    onScrollTop?: () => void;
}) => {
    const actions: FloatingAction[] = [];

    if (callbacks.onNewChat) {
        actions.push({
            icon: MessageSquarePlus,
            label: 'New Chat',
            onClick: callbacks.onNewChat,
            color: 'bg-emerald-500',
        });
    }

    if (callbacks.onSearch) {
        actions.push({
            icon: Search,
            label: 'Quick Search',
            onClick: callbacks.onSearch,
            color: 'bg-amber-500',
        });
    }

    if (callbacks.onFiles) {
        actions.push({
            icon: FolderOpen,
            label: 'Files & Explorer',
            onClick: callbacks.onFiles,
            color: 'bg-indigo-500',
        });
    }

    if (callbacks.onScrollTop) {
        actions.push({
            icon: ArrowUp,
            label: 'Scroll to Top',
            onClick: callbacks.onScrollTop,
            color: 'bg-slate-600',
        });
    }

    return actions;
};

export default FloatingActions;
