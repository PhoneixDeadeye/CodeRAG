/**
 * Guest Session Management
 * 
 * Handles guest session state in localStorage for users who haven't logged in.
 * Provides utilities for session initialization, message storage, and data export
 * for merging into authenticated accounts.
 */

const GUEST_SESSION_KEY = 'coderag_guest_session';
const GUEST_ID_KEY = 'coderag_guest_id';

export interface GuestMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface GuestSessionData {
    id: string;
    createdAt: number;
    lastActive: number;
    messages: GuestMessage[];
    currentRepoId?: string;
}

/**
 * Generate a unique ID for guest sessions
 */
function generateGuestId(): string {
    return crypto.randomUUID();
}

/**
 * Get or create guest session ID
 */
export function getGuestSessionId(): string {
    let guestId = localStorage.getItem(GUEST_ID_KEY);
    if (!guestId) {
        guestId = generateGuestId();
        localStorage.setItem(GUEST_ID_KEY, guestId);
    }
    return guestId;
}

/**
 * Initialize or retrieve guest session from localStorage
 */
export function initGuestSession(): GuestSessionData {
    const existing = localStorage.getItem(GUEST_SESSION_KEY);

    if (existing) {
        try {
            const session = JSON.parse(existing) as GuestSessionData;
            // Update last active
            session.lastActive = Date.now();
            localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
            return session;
        } catch {
            // Corrupted data, create new session
            console.warn('Guest session data corrupted, creating new session');
        }
    }

    const newSession: GuestSessionData = {
        id: getGuestSessionId(),
        createdAt: Date.now(),
        lastActive: Date.now(),
        messages: []
    };

    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(newSession));
    return newSession;
}

/**
 * Get current guest session data
 */
export function getGuestSession(): GuestSessionData | null {
    const data = localStorage.getItem(GUEST_SESSION_KEY);
    if (!data) return null;

    try {
        return JSON.parse(data) as GuestSessionData;
    } catch {
        return null;
    }
}

/**
 * Add a message to the guest session
 */
export function addGuestMessage(message: Omit<GuestMessage, 'id' | 'timestamp'>): GuestMessage {
    const session = initGuestSession();

    const newMessage: GuestMessage = {
        ...message,
        id: generateGuestId(),
        timestamp: Date.now()
    };

    session.messages.push(newMessage);
    session.lastActive = Date.now();

    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
    return newMessage;
}

/**
 * Get all messages from guest session
 */
export function getGuestMessages(): GuestMessage[] {
    const session = getGuestSession();
    return session?.messages || [];
}

/**
 * Set current repo ID for guest session
 */
export function setGuestRepoId(repoId: string): void {
    const session = initGuestSession();
    session.currentRepoId = repoId;
    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
}

/**
 * Get current repo ID from guest session
 */
export function getGuestRepoId(): string | undefined {
    const session = getGuestSession();
    return session?.currentRepoId;
}

/**
 * Clear all guest session data
 */
export function clearGuestSession(): void {
    localStorage.removeItem(GUEST_SESSION_KEY);
    localStorage.removeItem(GUEST_ID_KEY);
}

/**
 * Export guest session data for merge into authenticated account
 */
export function exportGuestDataForMerge() {
    const session = getGuestSession();
    if (!session || session.messages.length === 0) {
        return null;
    }

    return {
        guest_session_id: session.id,
        messages: session.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        })),
        repo_id: session.currentRepoId
    };
}

/**
 * Check if guest session has data worth preserving
 */
export function hasGuestData(): boolean {
    const session = getGuestSession();
    return session !== null && session.messages.length > 0;
}

/**
 * Get guest session age in milliseconds
 */
export function getGuestSessionAge(): number {
    const session = getGuestSession();
    if (!session) return 0;
    return Date.now() - session.createdAt;
}
