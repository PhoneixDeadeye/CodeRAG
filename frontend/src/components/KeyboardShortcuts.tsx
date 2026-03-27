import React, { useEffect } from 'react';

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
                className="fixed inset-0 z-50 bg-black/80 animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-bg-base border border-border-default shadow-[8px_8px_0px_0px_white] max-w-lg w-full max-h-[80vh] overflow-hidden animate-scale-in pointer-events-auto flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border-default bg-bg-surface">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary">keyboard</span>
                            <h2 className="text-lg font-bold text-white font-mono uppercase tracking-tight">SHORTCUT_COMMANDS</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-primary hover:text-black transition-colors text-text-secondary border border-transparent hover:border-black"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-0 overflow-y-auto max-h-[60vh] custom-scrollbar">
                        {categories.map(category => (
                            <div key={category} className="border-b border-border-default last:border-b-0">
                                <div className="px-4 py-2 bg-bg-elevated border-b border-border-subtle">
                                    <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest font-mono">
                                        // {category}
                                    </h3>
                                </div>
                                <div className="divide-y divide-border-subtle">
                                    {shortcuts
                                        .filter(s => s.category === category)
                                        .map((shortcut, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between py-3 px-4 hover:bg-white/5 transition-colors group"
                                            >
                                                <span className="text-sm text-text-secondary group-hover:text-white font-mono">{shortcut.description}</span>
                                                <div className="flex items-center gap-1">
                                                    {shortcut.keys.map((key, keyIdx) => (
                                                        <React.Fragment key={keyIdx}>
                                                            <kbd className="min-w-[24px] px-1.5 py-0.5 text-[10px] font-bold font-mono bg-black border border-border-default text-text-primary uppercase flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
                                                                {key}
                                                            </kbd>
                                                            {keyIdx < shortcut.keys.length - 1 && (
                                                                <span className="text-border-default text-[10px] font-bold">+</span>
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
                    <div className="p-3 border-t border-border-default bg-black">
                        <p className="text-[10px] text-text-secondary text-center font-mono uppercase">
                            PRESS <span className="text-primary font-bold">?</span> TO_TOGGLE_HELP_MENU
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};

