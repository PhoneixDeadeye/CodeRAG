import { useState, useCallback } from 'react';
import type { FileContentResponse } from '../lib/api';

const STORAGE_KEY = 'coderag-recent-files';
const MAX_RECENT_FILES = 10;

interface RecentFile {
    path: string;
    language: string;
    accessedAt: number;
}

// Helper function to load from localStorage
const loadFromStorage = (): RecentFile[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (err) {
        // Silent fail - return empty array
        if (import.meta.env.MODE === 'development') {
            console.warn('Failed to load recent files:', err);
        }
    }
    return [];
};

export function useRecentFiles() {
    // Initialize state with localStorage value directly (no useEffect needed)
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadFromStorage());

    // Save to localStorage when changed
    const saveToStorage = useCallback((files: RecentFile[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
        } catch (err) {
            // Silent fail - likely quota exceeded
            if (import.meta.env.MODE === 'development') {
                console.warn('Failed to save recent files:', err);
            }
        }
    }, []);

    const addRecentFile = useCallback((file: FileContentResponse) => {
        setRecentFiles(prev => {
            // Remove if already exists
            const filtered = prev.filter(f => f.path !== file.path);

            // Add to front
            const updated = [
                { path: file.path, language: file.language, accessedAt: Date.now() },
                ...filtered
            ].slice(0, MAX_RECENT_FILES);

            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    const removeRecentFile = useCallback((path: string) => {
        setRecentFiles(prev => {
            const updated = prev.filter(f => f.path !== path);
            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    const clearRecentFiles = useCallback(() => {
        setRecentFiles([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        recentFiles,
        addRecentFile,
        removeRecentFile,
        clearRecentFiles,
    };
}
