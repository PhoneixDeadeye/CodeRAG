import { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { FileExplorer } from './components/FileExplorer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KeyboardShortcuts, useKeyboardShortcutsModal } from './components/KeyboardShortcuts';
import { SettingsSkeleton, SearchSkeleton } from './components/Skeleton';

// Lazy load heavy components
const CodeViewer = lazy(() => import('./components/CodeViewer').then(module => ({ default: module.CodeViewer })));
const DependencyGraph = lazy(() => import('./components/DependencyGraph').then(module => ({ default: module.DependencyGraph })));
const GlobalSearch = lazy(() => import('./components/GlobalSearch').then(module => ({ default: module.GlobalSearch })));
const RepositoryIngestion = lazy(() => import('./components/RepositoryIngestion').then(module => ({ default: module.RepositoryIngestion })));
const DiffViewer = lazy(() => import('./components/DiffViewer').then(module => ({ default: module.DiffViewer })));
const GlobalCodeSearch = lazy(() => import('./components/GlobalCodeSearch').then(module => ({ default: module.GlobalCodeSearch })));
const VoiceSettings = lazy(() => import('./components/VoiceSettings').then(module => ({ default: module.VoiceSettings })));
import { AuthProvider, useAuth } from './contexts/AuthContext';
import type { SourceDocument, FileContentResponse } from './lib/api';
import { getFileContent, getConfig, listRepos } from './lib/api';

import { ToastProvider } from './contexts/ToastContext';
import { useToast } from './contexts/ToastContextCore';

function AppContent() {
  const { isLoading } = useAuth();
  const { showToast } = useToast();
  const { isOpen: showShortcuts, close: closeShortcuts } = useKeyboardShortcutsModal();

  const [activeFile, setActiveFile] = useState<FileContentResponse | null>(null);
  const [highlightLines, setHighlightLines] = useState<number[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [currentSessionName, setCurrentSessionName] = useState('New Chat');
  const [showSearch, setShowSearch] = useState(false);
  const [showDependencyGraph, setShowDependencyGraph] = useState(false);
  const [dependencyFilePath, setDependencyFilePath] = useState<string>('');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [currentRepo, setCurrentRepo] = useState('No repository');
  const [activeRepoId, setActiveRepoId] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [currentView, setCurrentView] = useState<'chat' | 'repos' | 'files' | 'diff' | 'graph' | 'search' | 'voice'>('chat');
  const [diffData, setDiffData] = useState<{ filePath: string; oldContent: string; newContent: string } | null>(null);

  // Initialization - works for both guests and authenticated users
  useEffect(() => {
    const initApp = async () => {
      try {
        const config = await getConfig();
        if (config.current_repo) {
          const repos = await listRepos();
          if (repos.active) {
            setCurrentRepo(repos.active.name);
            setActiveRepoId(repos.active.id);
          } else if (config.current_repo.startsWith("local://")) {
            setCurrentRepo(config.current_repo.replace("local://", ""));
          } else {
            setCurrentRepo(config.current_repo.split('/').pop() || config.current_repo);
          }
        }
      } catch (err) {
        // Silent fail - app can still function without this
        if (import.meta.env.MODE === 'development') {
          console.error("Failed to initialize app:", err);
        }
      }
    };
    initApp();
  }, []);

  const handleSourceClick = useCallback((source: SourceDocument, lines?: number[]) => {
    getFileContent(source.source, activeRepoId).then(file => {
      setActiveFile(file);
      setHighlightLines(lines || []);
      setShowDependencyGraph(false);
      setShowFilesPanel(true);
    }).catch(err => {
      if (import.meta.env.MODE === 'development') {
        console.error('Failed to load file:', err);
      }
      showToast('Failed to load file', 'error');
    });
  }, [showToast, activeRepoId]);

  const handleExplainFile = useCallback((filePath: string) => {
    window.dispatchEvent(new CustomEvent('explainFile', { detail: { filePath } }));
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentSession(null);
    setCurrentSessionName('New Chat');
    window.dispatchEvent(new CustomEvent('newChat'));
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

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
  }, []);

  const handleSearchResult = useCallback((filePath: string, lineNumber: number) => {
    getFileContent(filePath, activeRepoId).then(file => {
      setActiveFile(file);
      setHighlightLines([lineNumber]);
      setShowDependencyGraph(false);
      setShowFilesPanel(true);
      setShowSearch(false);
    }).catch(err => {
      console.error(err);
      showToast('Failed to open file from search results', 'error');
    });
  }, [activeRepoId, showToast]);

  const handleRepoSelect = useCallback((repoId: string) => {
    setActiveRepoId(repoId);
  }, []);

  const handleMultiSelect = useCallback((paths: string[]) => {
    setContextFiles(paths);
  }, []);

  // Global keyboard shortcuts
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
        setShowFilesPanel(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  // Handle responsive sidebar behavior
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

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-[#0E1117] text-white">Loading...</div>;
  }

  // REMOVED: Authentication redirect - App now works for guests
  // Login is triggered via AuthModal in Sidebar when needed

  const handleGraphRequest = () => {
    if (!activeFile) {
      showToast("Please open a file first to view its dependency graph", "info");
      setShowFilesPanel(true);
      // If we weren't already in files view, switch to it
      setCurrentView('files');
      return;
    }
    setDependencyFilePath(activeFile.path);
    setShowDependencyGraph(true);
    setShowFilesPanel(true);
  };

  return (
    <div className="bg-background-dark font-display h-screen flex overflow-hidden text-white selection:bg-primary selection:text-white">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onIngestComplete={() => {
          window.dispatchEvent(new CustomEvent('refreshFileTree'));
          setCurrentRepo('Repository updated');
          showToast('Repository ingested successfully', 'success');
        }}
        onRepoSelect={handleRepoSelect}
        onSessionSelect={(session) => {
          setCurrentSession(session?.id || null);
          setCurrentSessionName(session?.name || 'New Chat');
          setCurrentView('chat');
        }}
        currentSessionId={currentSession}
        onShowSearch={() => setShowSearch(true)}
        onShowFiles={() => {
          setShowFilesPanel(true);
          setCurrentView('files');
        }}
        onShowRepos={() => setCurrentView('repos')}
        onShowGraph={handleGraphRequest}
        onShowCodeSearch={() => setCurrentView('search')}
        onShowVoice={() => setCurrentView('voice')}
      />

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-30 p-2 bg-sidebar-dark/90 backdrop-blur border border-border-dark rounded-lg text-white shadow-lg"
      >
        <span className="material-symbols-outlined">
          menu
        </span>
      </button>

      {currentView === 'repos' ? (
        <Suspense fallback={<SettingsSkeleton />}>
          <RepositoryIngestion />
        </Suspense>
      ) : currentView === 'diff' && diffData ? (
        <Suspense fallback={<div className="flex items-center justify-center p-12 text-gray-500">Loading Diff Viewer...</div>}>
          <DiffViewer
            filePath={diffData.filePath}
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onClose={() => {
              setCurrentView('chat');
              setDiffData(null);
            }}
            onExplainDiff={(old, newC, path) => {
              const prompt = `Explain the differences in ${path}:\n\n\`\`\`\n${old}\n\`\`\`\n\nNEW:\n\`\`\`\n${newC}\n\`\`\``;
              window.dispatchEvent(new CustomEvent('explainFile', { detail: { filePath: prompt, isCode: true } }));
            }}
          />
        </Suspense>
      ) : currentView === 'graph' ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          {/* Fallback state if they somehow got here without a file */}
          <p>Select a file from the file explorer to view its dependency graph.</p>
        </div>
      ) : currentView === 'search' ? (
        <Suspense fallback={<SearchSkeleton />}>
          <GlobalCodeSearch
            onResultClick={(filePath, lineNumber) => {
              getFileContent(filePath).then(file => {
                setActiveFile(file);
                setHighlightLines([lineNumber]);
                setShowFilesPanel(true);
                setCurrentView('chat');
              }).catch(console.error);
            }}
            onClose={() => setCurrentView('chat')}
          />
        </Suspense>
      ) : currentView === 'voice' ? (
        <Suspense fallback={<SettingsSkeleton />}>
          <VoiceSettings
            onClose={() => setCurrentView('chat')}
            onSave={() => {
              showToast('Voice settings saved', 'success');
              setCurrentView('chat');
            }}
          />
        </Suspense>
      ) : (
        <>
          <ChatInterface
            onSourceClick={handleSourceClick}
            sessionId={currentSession}
            contextFiles={contextFiles}
            sessionName={currentSessionName}
            repoName={currentRepo}
            repoId={activeRepoId}
            onNewChat={handleNewChat}
          />

          {showFilesPanel && (
            <div className={`w-full md:w-[500px] shrink-0 border-l border-border-dark flex flex-col bg-sidebar-dark animate-fade-in absolute md:relative z-20 h-full right-0 shadow-2xl md:shadow-none`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-dark">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-text-secondary">folder_open</span>
                  <span className="text-sm font-medium">Files & Code</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setMultiSelectMode(!multiSelectMode)}
                    className={`p-1.5 rounded transition-all ${multiSelectMode ? 'bg-emerald-600/20 text-emerald-400' : 'hover:bg-border-dark text-text-secondary'}`}
                    title={multiSelectMode ? 'Exit multi-select' : 'Multi-select for context'}
                  >
                    <span className="material-symbols-outlined text-[18px]">layers</span>
                  </button>
                  <button
                    onClick={() => setShowFilesPanel(false)}
                    className="p-1.5 hover:bg-border-dark rounded text-text-secondary hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>

              <div className="h-1/3 border-b border-border-dark overflow-hidden">
                <FileExplorer
                  onFileSelect={(file) => {
                    setActiveFile(file);
                    setHighlightLines([]);
                    setShowDependencyGraph(false);
                  }}
                  onExplainFile={handleExplainFile}
                  multiSelectMode={multiSelectMode}
                  onMultiSelect={handleMultiSelect}
                  repoId={activeRepoId}
                />
              </div>

              <div className="flex-1 overflow-hidden">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Loading...</div>}>
                  {showDependencyGraph ? (
                    <DependencyGraph
                      filePath={dependencyFilePath}
                      onClose={() => setShowDependencyGraph(false)}
                      onFileClick={(path) => {
                        getFileContent(path).then(file => {
                          setActiveFile(file);
                          setHighlightLines([]);
                          setShowDependencyGraph(false);
                        }).catch(console.error);
                      }}
                    />
                  ) : (
                    <CodeViewer
                      file={activeFile}
                      highlightLines={highlightLines}
                      onClose={() => {
                        setActiveFile(null);
                        setHighlightLines([]);
                      }}
                      onExplainCode={handleExplainCode}
                      onGenerateTests={handleGenerateTests}
                      onGenerateDocs={handleGenerateDocs}
                      onShowDependencies={handleShowDependencies}
                    />
                  )}
                </Suspense>
              </div>
            </div>
          )}

          <Suspense fallback={null}>
            <GlobalSearch
              isOpen={showSearch}
              onClose={() => setShowSearch(false)}
              onResultClick={handleSearchResult}
            />
          </Suspense>
        </>
      )}
      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcuts isOpen={showShortcuts} onClose={closeShortcuts} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorBoundary name="App Root">
          <AppContent />
        </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
