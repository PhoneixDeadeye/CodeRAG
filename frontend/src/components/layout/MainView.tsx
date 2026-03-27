import { Suspense, lazy } from 'react';
import { SettingsSkeleton, SearchSkeleton } from '../Skeleton';
import { ChatInterface } from '../ChatInterface';
import { FileExplorer } from '../FileExplorer';
import { ErrorBoundary } from '../ErrorBoundary';
import { FolderOpen, Layers, X, Search, MessageSquarePlus } from 'lucide-react';
import { FloatingActions } from '../FloatingActions';
import clsx from 'clsx';
import type { ViewType, DiffData } from '../../hooks/useAppNavigation';
import type { FileContentResponse, SourceDocument } from '../../lib/api';
import { logger } from '../../lib/logger';

// Sticky imports for types or components used in conditional rendering
// Lazy loaded components
const CodeViewer = lazy(() => import('../CodeViewer').then(module => ({ default: module.CodeViewer })));
const DependencyGraph = lazy(() => import('../DependencyGraph').then(module => ({ default: module.DependencyGraph })));
const GlobalSearch = lazy(() => import('../GlobalSearch').then(module => ({ default: module.GlobalSearch })));
const RepositoryIngestion = lazy(() => import('../RepositoryIngestion').then(module => ({ default: module.RepositoryIngestion })));
const DiffViewer = lazy(() => import('../DiffViewer').then(module => ({ default: module.DiffViewer })));
const GlobalCodeSearch = lazy(() => import('../GlobalCodeSearch').then(module => ({ default: module.GlobalCodeSearch })));
const VoiceSettings = lazy(() => import('../VoiceSettings').then(module => ({ default: module.VoiceSettings })));
const AdminDashboard = lazy(() => import('../../pages/AdminDashboard'));
const SettingsPage = lazy(() => import('../../pages/SettingsPage'));

interface MainViewProps {
    currentView: ViewType;
    setCurrentView: (view: ViewType) => void;
    diffData: DiffData | null;
    setDiffData: (data: DiffData | null) => void;
    showSearch: boolean;
    setShowSearch: (show: boolean) => void;
    showDependencyGraph: boolean;
    setShowDependencyGraph: (show: boolean) => void;
    dependencyFilePath: string;
    showFilesPanel: boolean;
    setShowFilesPanel: (show: boolean) => void;

    // Data State
    activeFile: FileContentResponse | null;
    setActiveFile: (file: FileContentResponse | null) => void;
    highlightLines: number[];
    setHighlightLines: (lines: number[]) => void;
    multiSelectMode: boolean;
    setMultiSelectMode: (mode: boolean) => void;
    contextFiles: string[];
    setContextFiles: (files: string[]) => void;
    activeRepoId: string | undefined;
    setActiveRepoId: (id: string | undefined) => void;

    // Session State
    currentSession: string | null;
    currentSessionName: string;
    currentRepo: string;

    // Handlers
    onSourceClick: (source: SourceDocument, lines?: number[]) => void;
    onNewChat: () => void;
    onExplainFile: (filePath: string) => void;
    onExplainCode: (code: string, context: string) => void;
    onGenerateTests: (code: string, filePath: string) => void;
    onGenerateDocs: (code: string, filePath: string) => void;
    onShowDependencies: (filePath: string) => void;
    handleSearchResult: (filePath: string, lineNumber: number) => void;
    handleMultiSelect: (paths: string[]) => void;
    getFileContent: (path: string, repoId?: string) => Promise<FileContentResponse>;
    addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export function MainView({
    currentView,
    setCurrentView,
    diffData,
    setDiffData,
    showSearch,
    setShowSearch,
    showDependencyGraph,
    setShowDependencyGraph,
    dependencyFilePath,
    showFilesPanel,
    setShowFilesPanel,
    activeFile,
    setActiveFile,
    highlightLines,
    setHighlightLines,
    multiSelectMode,
    setMultiSelectMode,
    contextFiles,
    activeRepoId,
    currentSession,
    currentSessionName,
    currentRepo,
    onSourceClick,
    onNewChat,
    onExplainFile,
    onExplainCode,
    onGenerateTests,
    onGenerateDocs,
    onShowDependencies,
    handleSearchResult,
    handleMultiSelect,
    getFileContent,
    addToast
}: MainViewProps) {

    return (
        <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-transparent">
            <div className="flex-1 overflow-hidden relative">
                {currentView === 'repos' ? (
                    <ErrorBoundary name="Repository Ingestion">
                        <Suspense fallback={<div className="p-8"><SettingsSkeleton /></div>}>
                            <RepositoryIngestion />
                        </Suspense>
                    </ErrorBoundary>
                ) : currentView === 'diff' && diffData ? (
                    <ErrorBoundary name="Diff Viewer">
                        <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="animate-pulse">Loading Diff...</span></div>}>
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
                    </ErrorBoundary>
                ) : currentView === 'graph' ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
                        <p>Select a file from the file explorer to view its dependency graph.</p>
                    </div>
                ) : currentView === 'search' ? (
                    <ErrorBoundary name="Global Search">
                        <Suspense fallback={<div className="p-8"><SearchSkeleton /></div>}>
                            <GlobalCodeSearch
                                onResultClick={handleSearchResult}
                                onClose={() => setCurrentView('chat')}
                            />
                        </Suspense>
                    </ErrorBoundary>
                ) : currentView === 'voice' ? (
                    <ErrorBoundary name="Voice Settings">
                        <Suspense fallback={<div className="p-8"><SettingsSkeleton /></div>}>
                            <VoiceSettings
                                onClose={() => setCurrentView('chat')}
                                onSave={() => {
                                    addToast('Voice settings saved', 'success');
                                    setCurrentView('chat');
                                }}
                            />
                        </Suspense>
                    </ErrorBoundary>
                ) : currentView === 'admin' ? (
                    <ErrorBoundary name="Admin Dashboard">
                        <Suspense fallback={<div className="p-8"><SettingsSkeleton /></div>}>
                            <AdminDashboard />
                        </Suspense>
                    </ErrorBoundary>
                ) : currentView === 'settings' ? (
                    <ErrorBoundary name="Settings">
                        <Suspense fallback={<div className="p-8"><SettingsSkeleton /></div>}>
                            <SettingsPage />
                        </Suspense>
                    </ErrorBoundary>
                ) : (
                    <div className="absolute inset-0 flex">
                        <div className="flex-1 flex flex-col min-w-0">
                            <ErrorBoundary name="Chat Interface">
                                <ChatInterface
                                    onSourceClick={onSourceClick}
                                    sessionId={currentSession}
                                    contextFiles={contextFiles}
                                    sessionName={currentSessionName}
                                    repoName={currentRepo}
                                    repoId={activeRepoId}
                                    onNewChat={onNewChat}
                                />
                            </ErrorBoundary>
                        </div>

                        {/* Right Panel / Files Panel */}
                        {showFilesPanel && (
                            <div className="w-full md:w-[600px] shrink-0 border-l border-white/5 flex flex-col bg-background-dark/95 backdrop-blur-xl absolute md:relative z-20 h-full right-0 shadow-2xl md:shadow-none transition-all duration-300">
                                {/* Panel Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/10">
                                    <div className="flex items-center gap-2 text-primary">
                                        <FolderOpen className="w-5 h-5" />
                                        <span className="text-sm font-semibold tracking-wide text-white">Files & Code</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setMultiSelectMode(!multiSelectMode)}
                                            className={clsx(
                                                "p-2 rounded-lg transition-all",
                                                multiSelectMode ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-text-secondary hover:text-white'
                                            )}
                                            title={multiSelectMode ? 'Exit multi-select' : 'Multi-select for context'}
                                        >
                                            <Layers className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setShowFilesPanel(false)}
                                            className="p-2 hover:bg-white/5 rounded-lg text-text-secondary hover:text-white transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="h-2/5 border-b border-white/5 overflow-hidden flex flex-col">
                                    <ErrorBoundary name="File Explorer">
                                        <FileExplorer
                                            onFileSelect={(file) => {
                                                setActiveFile(file);
                                                setHighlightLines([]);
                                                setShowDependencyGraph(false);
                                            }}
                                            onExplainFile={onExplainFile}
                                            multiSelectMode={multiSelectMode}
                                            onMultiSelect={handleMultiSelect}
                                            repoId={activeRepoId}
                                        />
                                    </ErrorBoundary>
                                </div>

                                <div className="flex-1 overflow-hidden relative">
                                    <ErrorBoundary name="Code Viewer">
                                        <Suspense fallback={<div className="flex items-center justify-center h-full text-text-muted"><span className="animate-pulse">Loading Editor...</span></div>}>
                                            <CodeViewer
                                                file={activeFile}
                                                highlightLines={highlightLines}
                                                onClose={() => {
                                                    setActiveFile(null);
                                                    setHighlightLines([]);
                                                }}
                                                onExplainCode={onExplainCode}
                                                onGenerateTests={onGenerateTests}
                                                onGenerateDocs={onGenerateDocs}
                                                onShowDependencies={onShowDependencies}
                                            />
                                        </Suspense>
                                    </ErrorBoundary>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Suspense fallback={null}>
                <GlobalSearch
                    isOpen={showSearch}
                    onClose={() => setShowSearch(false)}
                    onResultClick={handleSearchResult}
                />
            </Suspense>

            {/* Dependency Graph Modal */}
            {showDependencyGraph && dependencyFilePath && (
                <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center text-white">Loading Graph...</div>}>
                    <DependencyGraph
                        filePath={dependencyFilePath}
                        onClose={() => setShowDependencyGraph(false)}
                        onFileClick={(path) => {
                            getFileContent(path, activeRepoId).then(file => {
                                setActiveFile(file);
                                setHighlightLines([]);
                                setShowDependencyGraph(false);
                                setShowFilesPanel(true);
                            }).catch(logger.error);
                        }}
                    />
                </Suspense>
            )}

            {/* Floating Action Button */}
            {currentView === 'chat' && !showFilesPanel && (
                <FloatingActions
                    actions={[
                        {
                            icon: MessageSquarePlus,
                            label: 'New Chat',
                            onClick: onNewChat,
                            color: 'bg-emerald-500',
                        },
                        {
                            icon: Search,
                            label: 'Quick Search',
                            onClick: () => setShowSearch(true),
                            color: 'bg-amber-500',
                        },
                        {
                            icon: FolderOpen,
                            label: 'Files & Explorer',
                            onClick: () => setShowFilesPanel(true),
                            color: 'bg-indigo-500',
                        },
                    ]}
                />
            )}
        </main>
    );
}
