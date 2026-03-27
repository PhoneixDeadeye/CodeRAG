import { useState, useCallback, useEffect } from 'react';

export type ViewType = 'chat' | 'repos' | 'files' | 'diff' | 'graph' | 'search' | 'voice' | 'admin' | 'settings';

export interface DiffData {
    filePath: string;
    oldContent: string;
    newContent: string;
}

export function useAppNavigation() {
    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
    const [currentView, setCurrentView] = useState<ViewType>('chat');
    const [showSearch, setShowSearch] = useState(false);
    const [showFilesPanel, setShowFilesPanel] = useState(false);
    const [showDependencyGraph, setShowDependencyGraph] = useState(false);
    const [dependencyFilePath, setDependencyFilePath] = useState<string>('');
    const [diffData, setDiffData] = useState<DiffData | null>(null);

    // Handle responsive sidebar behaviors
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSidebarOpen(true);
            } else {
                setSidebarOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const closeMobileSidebar = useCallback(() => {
        if (window.innerWidth < 768) setSidebarOpen(false);
    }, []);

    const navigateTo = useCallback((view: ViewType) => {
        setCurrentView(view);
        closeMobileSidebar();
    }, [closeMobileSidebar]);

    const openFilesPanel = useCallback(() => {
        setShowFilesPanel(true);
        setCurrentView('files');
        closeMobileSidebar();
    }, [closeMobileSidebar]);

    const openDependencyGraph = useCallback((path: string) => {
        setDependencyFilePath(path);
        setShowDependencyGraph(true);
        setShowFilesPanel(true);
    }, []);

    const openDiff = useCallback((data: DiffData) => {
        setDiffData(data);
        setCurrentView('diff');
    }, []);

    const closeDiff = useCallback(() => {
        setDiffData(null);
        setCurrentView('chat');
    }, []);

    return {
        sidebarOpen,
        setSidebarOpen,
        currentView,
        setCurrentView,
        navigateTo,
        showSearch,
        setShowSearch,
        showFilesPanel,
        setShowFilesPanel,
        openFilesPanel,
        showDependencyGraph,
        setShowDependencyGraph,
        dependencyFilePath,
        setDependencyFilePath,
        openDependencyGraph,
        diffData,
        openDiff,
        closeDiff
    };
}
