import { useState, useCallback } from 'react';

const STORAGE_KEY = 'coderag-pinned-files';

// Helper function to load from localStorage
const loadFromStorage = (): string[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (err) {
        if (import.meta.env.MODE === 'development') {
            console.warn('Failed to load pinned files:', err);
        }
    }
    return [];
};

export function usePinnedFiles() {
    // Initialize state with localStorage value directly (no useEffect needed)
    const [pinnedFiles, setPinnedFiles] = useState<string[]>(() => loadFromStorage());

    // Save to localStorage when changed
    const saveToStorage = useCallback((files: string[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
        } catch (err) {
            if (import.meta.env.MODE === 'development') {
                console.warn('Failed to save pinned files:', err);
            }
        }
    }, []);

    const togglePin = useCallback((path: string) => {
        setPinnedFiles(prev => {
            const updated = prev.includes(path)
                ? prev.filter(p => p !== path)
                : [path, ...prev];
            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    const isPinned = useCallback((path: string) => {
        return pinnedFiles.includes(path);
    }, [pinnedFiles]);

    const clearPins = useCallback(() => {
        setPinnedFiles([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        pinnedFiles,
        togglePin,
        isPinned,
        clearPins,
    };
}
