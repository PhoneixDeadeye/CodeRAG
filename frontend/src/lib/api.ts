import axios from 'axios';
import { getGuestSessionId } from './guestSession';
import { logger } from './logger';

const api = axios.create({
    baseURL: '/api/v1',
    timeout: 60000, // 60 second timeout to prevent indefinite hanging
});

// Request interceptor to add guest session ID for unauthenticated requests
api.interceptors.request.use((config) => {
    // If no Authorization header, add guest session ID
    if (!config.headers['Authorization']) {
        const guestId = getGuestSessionId();
        if (guestId) {
            config.headers['X-Guest-Session-ID'] = guestId;
        }
    }
    return config;
});

// Global Error Handler
api.interceptors.response.use(
    response => response,
    error => {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            logger.error("[Timeout] Request timed out");
            error.isTimeout = true;
            error.response = error.response || { data: { detail: 'Request timed out. The server may be busy. Please try again.' } };
        }
        if (error.response?.status === 429) {
            const message = error.response.data.detail || "Too many requests. Please try again later.";
            logger.warn("[Rate Limit]", message);
        }
        if (error.response?.status === 503) {
            // Service unavailable - usually AI service issues
            const message = error.response.data.detail || "Service temporarily unavailable. Please try again.";
            logger.warn("[Service Unavailable]", message);
        }
        if (error.response?.status === 502 || error.response?.status === 504) {
            // Gateway errors
            error.response.data = error.response.data || {};
            error.response.data.detail = error.response.data.detail || "Server is temporarily unavailable. Please try again.";
        }
        return Promise.reject(error);
    }
);

// Auth Helper (Injected by AuthContext)
export const setAuthToken = (token: string | null) => {
    if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common['Authorization'];
    }
};

export interface AuthResponse {
    access_token: string;
    token_type: string;
}

export const login = async (email: string, pass: string) => {
    const formData = new FormData();
    formData.append('username', email);  // FastAPI OAuth2 expects 'username', not 'email'
    formData.append('password', pass);
    const response = await api.post<AuthResponse>('/auth/login', formData);
    return response.data;
};

export const register = async (email: string, pass: string) => {
    const response = await api.post<AuthResponse>('/auth/register', { email, password: pass });
    return response.data;
};

export interface SourceDocument {
    page_content: string;
    source: string;  // Direct source path for convenience
    start_line?: number;
    end_line?: number;
    metadata: {
        source: string;
        repo_url?: string;
        start_line?: number;
        end_line?: number;
        type?: string;  // 'commit' for git commits
        commit_hash?: string;
        [key: string]: unknown;
    };
    github_link?: string;
}

export interface ChatResponse {
    answer: string;
    source_documents: SourceDocument[];
    sources?: SourceDocument[];  // Alias for convenience
    session_id?: string | null;  // null for guest mode
    is_guest?: boolean;
}

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

export interface FileTreeResponse {
    tree: FileNode[];
    repo_url: string | null;
}

export interface FileContentResponse {
    path: string;
    content: string;
    language: string;
    github_link: string;
}

// Multi-Repo Types
export interface Repository {
    id: string;
    url: string;
    name: string;
    chunk_count: number;
    created_at: string;
    updated_at: string;
    status: 'pending' | 'cloning' | 'indexing' | 'ready' | 'failed' | 're-indexing';
}

export interface ReposResponse {
    repos: Repository[];
    active: Repository | null;
}

// Chat Session Types
export interface ChatSession {
    id: string;
    name: string;
    repo_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionMessage {
    id: string;  // UUID from backend
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: SourceDocument[];
    timestamp?: number;
    created_at: string;
}

export interface SessionResponse {
    session: ChatSession;
    messages: SessionMessage[];
}

// Config Types
export interface AppConfig {
    current_repo: string | null;
    is_guest: boolean;
}

// === API Functions ===

export const ingestRepo = async (repoUrl: string, forceReindex: boolean = false) => {
    const response = await api.post('/ingest', { repo_url: repoUrl, force_reindex: forceReindex });
    return response.data;
};

export const chat = async (query: string, repoId?: string, sessionId?: string): Promise<ChatResponse> => {
    const response = await api.post<ChatResponse>('/chat', {
        query,
        repo_id: repoId,
        session_id: sessionId
    });
    // Transform response to add convenience properties
    const data = response.data;
    if (data.source_documents) {
        data.sources = data.source_documents.map(doc => ({
            ...doc,
            source: doc.metadata?.source || doc.source || '',
            start_line: doc.metadata?.start_line || doc.start_line,
            end_line: doc.metadata?.end_line || doc.end_line,
        }));
    }
    return data;
};

// Convenience wrapper
export const sendChatMessage = async (query: string, sessionId?: string, repoId?: string): Promise<ChatResponse> => {
    return chat(query, repoId, sessionId);
};

// --- SSE Streaming Chat ---
export interface StreamCallbacks {
    onToken: (token: string) => void;
    onSources: (sources: any[]) => void;
    onSessionId: (sessionId: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
}

export const streamChatMessage = async (
    query: string,
    callbacks: StreamCallbacks,
    sessionId?: string,
    repoId?: string
): Promise<void> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Add auth token if available
    const token = api.defaults.headers.common['Authorization'];
    if (token) {
        headers['Authorization'] = token as string;
    } else {
        const guestId = getGuestSessionId();
        if (guestId) {
            headers['X-Guest-Session-ID'] = guestId;
        }
    }

    const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query,
            repo_id: repoId,
            session_id: sessionId,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Stream request failed' }));
        callbacks.onError(errorData.detail || `HTTP ${response.status}`);
        return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
        callbacks.onError('No response body');
        return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                try {
                    const data = JSON.parse(line.slice(6));

                    switch (data.type) {
                        case 'token':
                            callbacks.onToken(data.content);
                            break;
                        case 'sources':
                            callbacks.onSources(data.content);
                            break;
                        case 'session_id':
                            callbacks.onSessionId(data.content);
                            break;
                        case 'done':
                            callbacks.onDone();
                            break;
                        case 'error':
                            callbacks.onError(data.message || 'Unknown streaming error');
                            break;
                    }
                } catch {
                    // Skip malformed SSE lines
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
};

export const uploadFile = async (file: File): Promise<{ filename: string, content: string, file_type: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/chat/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return response.data;
};

export const getFileTree = async (repoId?: string): Promise<FileTreeResponse> => {
    const params = repoId ? { repo_id: repoId } : {};
    const response = await api.get<FileTreeResponse>('/files', { params });
    return response.data;
};

export const getFileContent = async (filePath: string, repoId?: string): Promise<FileContentResponse> => {
    const params = repoId ? { repo_id: repoId } : {};
    // Ensure file path is encoded if it contains special characters
    const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const response = await api.get<FileContentResponse>(`/file/${encodedPath}`, { params });
    return response.data;
};

export const submitFeedback = async (question: string, answer: string, rating: number, comment: string = '') => {
    const response = await api.post('/feedback', { question, answer, rating, comment });
    return response.data;
};

// Multi-Repo API
export const listRepos = async (): Promise<ReposResponse> => {
    const response = await api.get<ReposResponse>('/repos');
    return response.data;
};

export const deleteRepo = async (repoId: string) => {
    const response = await api.delete(`/repos/${repoId}`);
    return response.data;
};

// Sessions API
export const listSessions = async (): Promise<{ sessions: ChatSession[] }> => {
    const response = await api.get('/sessions');
    return response.data;
};

export const createSession = async (name: string, repoUrl?: string): Promise<{ session_id: string }> => {
    const response = await api.post('/sessions', { name, repo_url: repoUrl });
    return response.data;
};

export const getSession = async (sessionId: string): Promise<SessionResponse> => {
    const response = await api.get<SessionResponse>(`/sessions/${sessionId}`);
    return response.data;
};

// Alias for convenience
export const loadSession = getSession;

export const deleteSession = async (sessionId: string) => {
    const response = await api.delete(`/sessions/${sessionId}`);
    return response.data;
};

export const addSessionMessage = async (sessionId: string, role: string, content: string, sources?: SourceDocument[]) => {
    const response = await api.post(`/sessions/${sessionId}/messages`, { role, content, sources });
    return response.data;
};

export const exportSession = async (sessionId: string, format: 'json' | 'markdown' | 'html' = 'json') => {
    // Use the new export router endpoints
    const endpoint = format === 'json'
        ? `/export/sessions/${sessionId}/json`
        : format === 'html'
            ? `/export/sessions/${sessionId}/html`
            : `/export/sessions/${sessionId}/markdown`;

    const response = await api.get(endpoint, {
        responseType: 'blob'
    });

    // Trigger download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;

    // Extract filename or default
    const contentDisposition = response.headers['content-disposition'];
    const extensions = { json: 'json', markdown: 'md', html: 'html' };
    let filename = `chat_export_${sessionId}.${extensions[format]}`;
    if (contentDisposition) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
        }
    }

    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

// Config API
export const getConfig = async (): Promise<AppConfig> => {
    const response = await api.get<AppConfig>('/config');
    return response.data;
};

// Search Types
export interface SearchResult {
    file_path: string;
    line_number: number;
    line_content: string;
    match_start: number;
    match_end: number;
}

export interface SearchResponse {
    results: SearchResult[];
}

// Search API
export const globalSearch = async (
    query: string,
    isRegex: boolean = false,
    caseSensitive: boolean = false
): Promise<SearchResponse> => {


    const response = await api.post<SearchResponse>('/search', {
        query,
        is_regex: isRegex,
        case_sensitive: caseSensitive
    });
    return response.data;
};

// Dependency Analysis
export const analyzeFileDependencies = async (filePath: string, repoId?: string) => {
    const response = await api.post('/analyze-dependencies', { file_path: filePath, repo_id: repoId });
    return response.data;
};

// Symbol extraction API
export interface SymbolInfo {
    name: string;
    type: string;
    file: string;
}

export interface SymbolsResponse {
    files: string[];
    symbols: SymbolInfo[];
}

export const getSymbols = async (repoId?: string): Promise<SymbolsResponse> => {
    const params = repoId ? { repo_id: repoId } : {};
    const response = await api.get<SymbolsResponse>('/symbols', { params });
    return response.data;
};

// Guest Session API
export interface GuestMergeRequest {
    guest_session_id: string;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp?: number;
    }>;
    repo_id?: string;
}

export interface GuestMergeResponse {
    status: string;
    session_id: string;
    messages_imported: number;
}

export interface GuestStatusResponse {
    status: string;
    features: string[];
    persistence: boolean;
    message: string;
}

/**
 * Merge guest session data into authenticated user account
 */
export const mergeGuestSession = async (data: GuestMergeRequest): Promise<GuestMergeResponse> => {
    const response = await api.post<GuestMergeResponse>('/guest/merge', data);
    return response.data;
};

/**
 * Check guest mode status
 */
export const getGuestStatus = async (): Promise<GuestStatusResponse> => {
    const response = await api.get<GuestStatusResponse>('/guest/status');
    return response.data;
};


// ============ Health Check APIs ============

export interface HealthStatus {
    status: string;
    version: string;
    service: string;
}

export interface AIHealthStatus {
    status: 'healthy' | 'degraded' | 'timeout' | 'misconfigured' | 'error' | 'unknown';
    provider: string;
    model: string;
    error?: string;
    response_sample?: string;
}

/**
 * Check backend health status
 */
export const checkBackendHealth = async (): Promise<HealthStatus> => {
    // Use direct axios call since health endpoint is not under /api/v1
    const response = await axios.get<HealthStatus>('/health', { timeout: 5000 });
    return response.data;
};

/**
 * Check AI service health status
 */
export const checkAIHealth = async (): Promise<AIHealthStatus> => {
    // Use direct axios call since health endpoint is not under /api/v1
    const response = await axios.get<AIHealthStatus>('/health/ai', { timeout: 15000 });
    return response.data;
};
