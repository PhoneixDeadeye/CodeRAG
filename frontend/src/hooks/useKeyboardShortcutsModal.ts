// Hook for triggering the shortcuts modal - extracted to separate file for React Fast Refresh
import { useState, useEffect } from 'react';

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
