import React, { useState, useEffect } from 'react';

interface Shortcut {
    keys: string[];
    description: string;
    category: string;
}

const shortcuts: Shortcut[] = [
    { keys: ['Ctrl', 'K'], description: 'Focus chat input', category: 'Navigation' },
    { keys: ['Ctrl', 'N'], description: 'New chat session', category: 'Navigation' },
    { keys: ['Ctrl', 'B'], description: 'Toggle sidebar', category: 'Navigation' },
    { keys: ['Ctrl', 'Shift', 'F'], description: 'Global search', category: 'Search' },
    { keys: ['Escape'], description: 'Close panels/modals', category: 'Navigation' },
    { keys: ['Enter'], description: 'Send message', category: 'Chat' },
    { keys: ['Shift', 'Enter'], description: 'New line in message', category: 'Chat' },
    { keys: ['@'], description: 'Mention file or symbol', category: 'Chat' },
    { keys: ['/'], description: 'Slash commands', category: 'Chat' },
];

interface KeyboardShortcutsProps {
    isOpen: boolean;
    onClose: () => void;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ isOpen, onClose }) => {
    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const categories = [...new Set(shortcuts.map(s => s.category))];

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-sidebar-dark border border-border-dark rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden animate-scale-in pointer-events-auto"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border-dark">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary">keyboard</span>
                            <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-border-dark rounded-lg transition-colors text-text-secondary hover:text-white"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 overflow-y-auto max-h-[60vh]">
                        {categories.map(category => (
                            <div key={category} className="mb-6 last:mb-0">
                                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
                                    {category}
                                </h3>
                                <div className="space-y-2">
                                    {shortcuts
                                        .filter(s => s.category === category)
                                        .map((shortcut, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-border-dark/50 transition-colors"
                                            >
                                                <span className="text-sm text-white">{shortcut.description}</span>
                                                <div className="flex items-center gap-1">
                                                    {shortcut.keys.map((key, keyIdx) => (
                                                        <React.Fragment key={keyIdx}>
                                                            <kbd className="px-2 py-1 text-xs font-mono bg-background-dark border border-border-dark rounded text-text-secondary">
                                                                {key}
                                                            </kbd>
                                                            {keyIdx < shortcut.keys.length - 1 && (
                                                                <span className="text-text-secondary text-xs">+</span>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-border-dark bg-background-dark/50">
                        <p className="text-xs text-text-secondary text-center">
                            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-border-dark border border-border-dark/50 rounded">?</kbd> to toggle this help
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};

// Hook for triggering the shortcuts modal
export const useKeyboardShortcutsModal = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Show on ? key (Shift + /)
            if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Don't trigger if typing in an input
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return { isOpen, setIsOpen, close: () => setIsOpen(false) };
};
