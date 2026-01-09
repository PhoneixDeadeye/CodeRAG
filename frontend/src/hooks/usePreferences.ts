import { useState, useEffect, useCallback } from 'react';

interface UserPreferences {
    sidebarOpen: boolean;
    theme: 'dark' | 'light' | 'system';
    voiceEnabled: boolean;
    voiceSpeed: number;
    voicePitch: number;
    selectedVoice: string;
    showLineNumbers: boolean;
    codeWrap: boolean;
    fontSize: 'small' | 'medium' | 'large';
}

const DEFAULT_PREFERENCES: UserPreferences = {
    sidebarOpen: true,
    theme: 'dark',
    voiceEnabled: true,
    voiceSpeed: 1.0,
    voicePitch: 1.0,
    selectedVoice: '',
    showLineNumbers: true,
    codeWrap: false,
    fontSize: 'medium'
};

const STORAGE_KEY = 'coderag_preferences';

export const usePreferences = () => {
    const [preferences, setPreferences] = useState<UserPreferences>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.warn('Failed to load preferences from localStorage:', e);
        }
        return DEFAULT_PREFERENCES;
    });

    // Persist to localStorage whenever preferences change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        } catch (e) {
            console.warn('Failed to save preferences to localStorage:', e);
        }
    }, [preferences]);

    const updatePreference = useCallback(<K extends keyof UserPreferences>(
        key: K,
        value: UserPreferences[K]
    ) => {
        setPreferences(prev => ({ ...prev, [key]: value }));
    }, []);

    const resetPreferences = useCallback(() => {
        setPreferences(DEFAULT_PREFERENCES);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        preferences,
        updatePreference,
        resetPreferences,
        setPreferences
    };
};

// Simpler hook for individual preference
export const usePreference = <K extends keyof UserPreferences>(key: K) => {
    const { preferences, updatePreference } = usePreferences();

    const setValue = useCallback((value: UserPreferences[K]) => {
        updatePreference(key, value);
    }, [key, updatePreference]);

    return [preferences[key], setValue] as const;
};
