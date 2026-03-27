import { useState, useEffect, useCallback } from 'react';
import { getConfig, listRepos } from '../lib/api';
import type { FileContentResponse } from '../lib/api';
import { logger } from '../lib/logger';

export function useWorkspaceState() {
    // File & Code State
    const [activeFile, setActiveFile] = useState<FileContentResponse | null>(null);
    const [highlightLines, setHighlightLines] = useState<number[]>([]);

    // Session State
    const [currentSession, setCurrentSession] = useState<string | null>(null);
    const [currentSessionName, setCurrentSessionName] = useState('New Chat');

    // Context & Selection State
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [contextFiles, setContextFiles] = useState<string[]>([]);

    // Repository State
    const [currentRepo, setCurrentRepo] = useState('No repository');
    const [activeRepoId, setActiveRepoId] = useState<string | undefined>(undefined);

    // Initialization Logic
    useEffect(() => {
        const initApp = async () => {
            try {
                const config = await getConfig();
                if (config.current_repo) {
                    // Start with what's in config
                    if (config.current_repo.startsWith("local://")) {
                        setCurrentRepo(config.current_repo.replace("local://", ""));
                    } else {
                        setCurrentRepo(config.current_repo.split('/').pop() || config.current_repo);
                    }

                    // Try to resolve to an ID
                    const repos = await listRepos();
                    if (repos.active) {
                        setCurrentRepo(repos.active.name);
                        setActiveRepoId(repos.active.id);
                    }
                }
            } catch (err) {
                logger.error("Failed to initialize app:", err);
            }
        };
        initApp();
    }, []);

    // Actions
    const handleRepoSelect = useCallback((repoId: string) => {
        setActiveRepoId(repoId);
    }, []);

    const handleMultiSelect = useCallback((paths: string[]) => {
        setContextFiles(paths);
    }, []);

    const clearActiveFile = useCallback(() => {
        setActiveFile(null);
        setHighlightLines([]);
    }, []);

    return {
        // State
        activeFile,
        setActiveFile,
        highlightLines,
        setHighlightLines,
        currentSession,
        setCurrentSession,
        currentSessionName,
        setCurrentSessionName,
        multiSelectMode,
        setMultiSelectMode,
        contextFiles,
        setContextFiles,
        currentRepo,
        setCurrentRepo,
        activeRepoId,
        setActiveRepoId,

        // Actions
        handleRepoSelect,
        handleMultiSelect,
        clearActiveFile
    };
}
