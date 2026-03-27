import { useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { useKeyboardShortcutsModal } from './hooks/useKeyboardShortcutsModal';
import { WelcomeModal, useWelcomeModal } from './components/WelcomeModal';
import { Menu } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { useToast } from './components/Toast';
import { getFileContent } from './lib/api';
import type { SourceDocument } from './lib/api';
import { logger } from './lib/logger';

import { AppProviders } from './components/layout/AppProviders';
import { MainView } from './components/layout/MainView';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useWorkspaceState } from './hooks/useWorkspaceState';
import ThreeBackground from './components/ThreeBackground';

function AppContent() {
  const { isLoading } = useAuth();
  const { addToast } = useToast();
  const { isOpen: showShortcuts, close: closeShortcuts } = useKeyboardShortcutsModal();
  const { showWelcome, closeWelcome } = useWelcomeModal();

  // Navigation State
  const {
    sidebarOpen,
    setSidebarOpen,
    currentView,
    setCurrentView,
    navigateTo,
    showSearch,
    setShowSearch,
    showFilesPanel,
    setShowFilesPanel,
    showDependencyGraph,
    setShowDependencyGraph,
    dependencyFilePath,
    setDependencyFilePath,
    diffData,
    openDiff,
    closeDiff
  } = useAppNavigation();

  // Workspace State (Files, Sessions, Repos)
  const {
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
    activeRepoId,
    setActiveRepoId,
    handleRepoSelect,
    handleMultiSelect
  } = useWorkspaceState();

  const handleSourceClick = useCallback((source: SourceDocument, lines?: number[]) => {
    getFileContent(source.source, activeRepoId).then(file => {
      setActiveFile(file);
      setHighlightLines(lines || []);
      setShowDependencyGraph(false);
      setShowFilesPanel(true);
    }).catch(err => {
      logger.error('Failed to load file:', err);
      addToast('Failed to load file', 'error');
    });
  }, [addToast, activeRepoId, setShowDependencyGraph, setShowFilesPanel, setActiveFile, setHighlightLines]);

  const handleExplainFile = useCallback((filePath: string) => {
    window.dispatchEvent(new CustomEvent('explainFile', { detail: { filePath } }));
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentSession(null);
    setCurrentSessionName('New Chat');
    window.dispatchEvent(new CustomEvent('newChat'));
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [setSidebarOpen, setCurrentSession, setCurrentSessionName]);

  const handleExplainCode = useCallback((code: string, context: string) => {
    const prompt = `Explain this code from ${context}:\n\n\`\`\`\n${code}\n\`\`\``;
    window.dispatchEvent(new CustomEvent('explainFile', { detail: { filePath: prompt, isCode: true } }));
  }, []);

  const handleGenerateTests = useCallback((code: string, filePath: string) => {
    const prompt = `Generate comprehensive unit tests for this code from ${filePath}:\n\n\`\`\`\n${code}\n\`\`\``;
    window.dispatchEvent(new CustomEvent('explainFile', { detail: { filePath: prompt, isCode: true } }));
  }, []);

  const handleGenerateDocs = useCallback((code: string, filePath: string) => {
    const prompt = `Generate detailed documentation and docstrings for this code from ${filePath}:\n\n\`\`\`\n${code}\n\`\`\``;
    window.dispatchEvent(new CustomEvent('explainFile', { detail: { filePath: prompt, isCode: true } }));
  }, []);

  const handleShowDependencies = useCallback((filePath: string) => {
    setDependencyFilePath(filePath);
    setShowDependencyGraph(true);
    setShowFilesPanel(true);
  }, [setDependencyFilePath, setShowDependencyGraph, setShowFilesPanel]);

  const handleSearchResult = useCallback((filePath: string, lineNumber: number) => {
    getFileContent(filePath, activeRepoId).then(file => {
      setActiveFile(file);
      setHighlightLines([lineNumber]);
      setShowDependencyGraph(false);
      setShowFilesPanel(true);
      setShowSearch(false);
      setCurrentView('chat');
    }).catch(err => {
      logger.error(err);
      addToast('Failed to open file from search results', 'error');
    });
  }, [activeRepoId, addToast, setShowDependencyGraph, setShowFilesPanel, setShowSearch, setCurrentView, setActiveFile, setHighlightLines]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const chatInput = document.querySelector('textarea') as HTMLTextAreaElement;
        chatInput?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat, setShowSearch, setSidebarOpen]);

  // Loading state
  if (isLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent text-primary font-mono gap-4 relative z-0">
          <ThreeBackground />
          <div className="relative z-10 flex flex-col items-center justify-center">
             <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-4 border-slate-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-indigo-500 animate-spin rounded-full"></div>
                <div className="absolute inset-0 flex flex-col justify-center items-center">
                    <span className="text-xl font-bold animate-pulse text-indigo-400">Loading</span>
                </div>
             </div>
             <div className="mt-4 flex flex-col items-center gap-1">
                <span className="text-lg font-bold tracking-widest text-indigo-300">System_Initializing</span>
             </div>
    );
  }

  const handleGraphRequest = () => {
    if (!activeFile) {
      addToast("Please open a file first to view its dependency graph", "info");
      setShowFilesPanel(true);
      setCurrentView('files');
      return;
    }
    setDependencyFilePath(activeFile.path);
    setShowDependencyGraph(true);
    setShowFilesPanel(true);
  };

  return (
      <div className="bg-transparent font-display h-screen flex overflow-hidden text-white selection:bg-indigo-500 selection:text-white relative z-0">
        <ThreeBackground />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onRepoSelect={handleRepoSelect}
        onSessionSelect={(session) => {
          setCurrentSession(session?.id || null);
          setCurrentSessionName(session?.name || 'New Chat');
          navigateTo('chat');
        }}
        currentSessionId={currentSession}
        onShowSearch={() => setShowSearch(true)}
        onShowFiles={() => {
          setShowFilesPanel(true);
          navigateTo('files');
        }}
        onShowRepos={() => navigateTo('repos')}
        onShowGraph={handleGraphRequest}
        onShowCodeSearch={() => navigateTo('search')}
        onShowVoice={() => navigateTo('voice')}
        onShowAdmin={() => navigateTo('admin')}
        onShowSettings={() => navigateTo('settings')}
      />

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-30 p-2 bg-black border border-border-default text-primary shadow-[4px_4px_0px_0px_white] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all rounded-none"
      >
        <Menu className="w-5 h-5" />
      </button>

      <MainView
        currentView={currentView}
        setCurrentView={setCurrentView}
        diffData={diffData}
        setDiffData={(data) => {
          if (data) openDiff(data);
          else closeDiff();
        }}
        showSearch={showSearch}
        setShowSearch={setShowSearch}
        showDependencyGraph={showDependencyGraph}
        setShowDependencyGraph={setShowDependencyGraph}
        dependencyFilePath={dependencyFilePath}
        showFilesPanel={showFilesPanel}
        setShowFilesPanel={setShowFilesPanel}
        activeFile={activeFile}
        setActiveFile={setActiveFile}
        highlightLines={highlightLines}
        setHighlightLines={setHighlightLines}
        multiSelectMode={multiSelectMode}
        setMultiSelectMode={setMultiSelectMode}
        contextFiles={contextFiles}
        setContextFiles={setContextFiles}
        activeRepoId={activeRepoId}
        setActiveRepoId={setActiveRepoId}
        currentSession={currentSession}
        currentSessionName={currentSessionName}
        currentRepo={currentRepo}
        onSourceClick={handleSourceClick}
        onNewChat={handleNewChat}
        onExplainFile={handleExplainFile}
        onExplainCode={handleExplainCode}
        onGenerateTests={handleGenerateTests}
        onGenerateDocs={handleGenerateDocs}
        onShowDependencies={handleShowDependencies}
        handleSearchResult={handleSearchResult}
        handleMultiSelect={handleMultiSelect}
        getFileContent={getFileContent}
        addToast={addToast}
      />

      <KeyboardShortcuts isOpen={showShortcuts} onClose={closeShortcuts} />
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}
    </div>
  );
}

function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

export default App;
