// Dark Mode Hook with localStorage persistence
// Provides theme management with system preference fallback

import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'coderag-theme';

/**
 * Get the effective theme based on system preference
 */
function getSystemTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply theme to document
 */
function applyTheme(theme: 'dark' | 'light') {
    const root = document.documentElement;

    if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.add('light');
        root.classList.remove('dark');
    }

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#0E1117' : '#ffffff');
    }
}

/**
 * Hook for managing dark mode with localStorage persistence
 */
export function useDarkMode() {
    // Initialize from localStorage or default to 'dark'
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'dark';
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light' || stored === 'system') {
            return stored;
        }
        return 'dark'; // Default to dark theme
    });

    // Calculate effective theme (resolves 'system' to actual theme)
    const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
    const isDark = effectiveTheme === 'dark';

    // Apply theme on mount and when it changes
    useEffect(() => {
        applyTheme(effectiveTheme);
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme, effectiveTheme]);

    // Listen for system theme changes when using 'system' setting
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            applyTheme(getSystemTheme());
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    // Theme setters
    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState(prev => {
            if (prev === 'dark') return 'light';
            if (prev === 'light') return 'dark';
            return getSystemTheme() === 'dark' ? 'light' : 'dark';
        });
    }, []);

    const setDark = useCallback(() => setThemeState('dark'), []);
    const setLight = useCallback(() => setThemeState('light'), []);
    const setSystem = useCallback(() => setThemeState('system'), []);

    return {
        theme,           // Current setting: 'dark' | 'light' | 'system'
        effectiveTheme,  // Resolved theme: 'dark' | 'light'
        isDark,          // Convenience: true if effective theme is dark
        setTheme,        // Set specific theme
        toggleTheme,     // Toggle between dark/light
        setDark,         // Set to dark
        setLight,        // Set to light
        setSystem,       // Set to system preference
    };
}

/**
 * Initialize theme on page load (call in main.tsx before React mounts)
 */
export function initializeTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    let theme: 'dark' | 'light';

    if (stored === 'dark' || stored === 'light') {
        theme = stored;
    } else if (stored === 'system') {
        theme = getSystemTheme();
    } else {
        theme = 'dark'; // Default
    }

    applyTheme(theme);
}
