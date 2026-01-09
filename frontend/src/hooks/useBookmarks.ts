import { useState, useCallback } from 'react';

const STORAGE_KEY = 'coderag-bookmarked-questions';
const MAX_BOOKMARKS = 20;

interface Bookmark {
    id: string;
    question: string;
    createdAt: number;
}

// Helper function to load from localStorage
const loadFromStorage = (): Bookmark[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (err) {
        if (import.meta.env.MODE === 'development') {
            console.warn('Failed to load bookmarks:', err);
        }
    }
    return [];
};

export function useBookmarks() {
    // Initialize state with localStorage value directly (no useEffect needed)
    const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadFromStorage());

    // Save to localStorage when changed
    const saveToStorage = useCallback((items: Bookmark[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (err) {
            if (import.meta.env.MODE === 'development') {
                console.warn('Failed to save bookmarks:', err);
            }
        }
    }, []);

    const addBookmark = useCallback((question: string) => {
        // Don't add duplicates
        setBookmarks(prev => {
            if (prev.some(b => b.question === question)) {
                return prev;
            }

            const updated = [
                { id: Date.now().toString(), question, createdAt: Date.now() },
                ...prev
            ].slice(0, MAX_BOOKMARKS);

            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    const removeBookmark = useCallback((id: string) => {
        setBookmarks(prev => {
            const updated = prev.filter(b => b.id !== id);
            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    const isBookmarked = useCallback((question: string) => {
        return bookmarks.some(b => b.question === question);
    }, [bookmarks]);

    const clearBookmarks = useCallback(() => {
        setBookmarks([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        bookmarks,
        addBookmark,
        removeBookmark,
        isBookmarked,
        clearBookmarks,
    };
}
