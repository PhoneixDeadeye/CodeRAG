import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { setAuthToken, login as apiLogin, register as apiRegister, mergeGuestSession } from '../lib/api';
import { getGuestSessionId, exportGuestDataForMerge, clearGuestSession, hasGuestData } from '../lib/guestSession';

interface User {
    id: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isGuest: boolean;
    guestSessionId: string | null;
    isLoading: boolean;
    login: (email: string, pass: string) => Promise<void>;
    register: (email: string, pass: string) => Promise<void>;
    logout: () => void;
    mergeGuestData: () => Promise<{ merged: boolean; sessionId?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    // Guest session ID - always available for guest mode
    const guestSessionId = getGuestSessionId();

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setAuthToken(null);
    }, []);

    const fetchMe = useCallback(async (authToken: string) => {
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            } else {
                // Invalid token
                logout();
            }
        } catch {
            logout();
        } finally {
            setIsLoading(false);
        }
    }, [logout]);

    // Initialize
    useEffect(() => {
        if (token) {
            setAuthToken(token);
            fetchMe(token);
        } else {
            setIsLoading(false);
        }
    }, [token, fetchMe]);

    /**
     * Merge guest session data into authenticated user account
     */
    const mergeGuestData = useCallback(async (): Promise<{ merged: boolean; sessionId?: string }> => {
        if (!hasGuestData()) {
            return { merged: false };
        }

        const guestData = exportGuestDataForMerge();
        if (!guestData) {
            return { merged: false };
        }

        try {
            const result = await mergeGuestSession({
                guest_session_id: guestData.guest_session_id,
                messages: guestData.messages,
                repo_id: guestData.repo_id
            });

            // Clear guest session after successful merge
            clearGuestSession();

            return { merged: true, sessionId: result.session_id };
        } catch (error) {
            console.error('Failed to merge guest session:', error);
            return { merged: false };
        }
    }, []);

    const login = async (email: string, pass: string) => {
        const data = await apiLogin(email, pass);

        // CRITICAL: Set token in axios BEFORE calling fetchMe
        setAuthToken(data.access_token);

        // Then persist to localStorage
        localStorage.setItem('token', data.access_token);

        // Update state
        setToken(data.access_token);

        // Now fetchMe will have the Authorization header
        await fetchMe(data.access_token);

        // Automatically merge guest data if available
        if (hasGuestData()) {
            await mergeGuestData();
        }
    };

    const register = async (email: string, pass: string) => {
        const data = await apiRegister(email, pass);

        // CRITICAL: Set token in axios BEFORE calling fetchMe
        setAuthToken(data.access_token);

        // Then persist
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);

        // Now fetchMe will succeed
        await fetchMe(data.access_token);

        // Automatically merge guest data if available
        if (hasGuestData()) {
            await mergeGuestData();
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!user,
            isGuest: !user && !isLoading,
            guestSessionId,
            isLoading,
            login,
            register,
            logout,
            mergeGuestData
        }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
