import axios from 'axios';
import { getGuestSessionId } from './guestSession';

const api = axios.create({
    baseURL: '/api/v1',
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
        if (error.response?.status === 429) {
            const message = error.response.data.detail || "Too many requests. Please try again later.";
            console.warn("[Rate Limit]", message);
            // Components can catch this error and display their own toast/notification
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

// ...

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
    // Check if backend supports GET /search?q=... or POST
    // Given the previous code, let's assume POST for complex body or GET for simple.
    // However, backend typically uses POST for search to handle complex params body.
    // Let's use GET as implemented in the fix attempt, but ensure backend supports it.
    // If backend expects POST based on the old code:
    // const response = await api.post<SearchResponse>('/api/search', { query, is_regex: isRegex, case_sensitive: caseSensitive });

    // Wait, the previous code had `api.get('/search?...')` but also `api.post('/search')`.
    // I will assume POST is safer for `query` length.

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
