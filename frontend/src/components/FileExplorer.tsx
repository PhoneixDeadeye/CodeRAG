import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getFileTree, getFileContent, type FileNode, type FileContentResponse } from '../lib/api';
import { usePinnedFiles } from '../hooks/usePinnedFiles';
import { useRecentFiles } from '../hooks/useRecentFiles';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { logger } from '../lib/logger';

interface FileExplorerProps {
    onFileSelect: (file: FileContentResponse) => void;
    onExplainFile: (filePath: string) => void;
    onMultiSelect?: (paths: string[]) => void;
    multiSelectMode?: boolean;
    repoId?: string;
}

const FileTreeItem: React.FC<{
    node: FileNode;
    depth: number;
    onFileSelect: (path: string) => void;
    onExplainFile: (path: string) => void;
    selectedPath: string | null;
    searchTerm: string;
    focusedPath: string | null;
    onTogglePin: (path: string) => void;
    isPinned: (path: string) => boolean;
    multiSelectMode?: boolean;
    selectedPaths?: string[];
    onToggleMultiSelect?: (path: string) => void;
    collapseSignal: number;
}> = ({ node, depth, onFileSelect, onExplainFile, selectedPath, searchTerm, focusedPath, onTogglePin, isPinned, multiSelectMode, selectedPaths = [], onToggleMultiSelect, collapseSignal }) => {
    // When searching, folders are always expanded; otherwise user controls expansion
    const autoExpand = searchTerm.length > 0;
    const [userExpanded, setUserExpanded] = useState(depth < 2);
    const itemRef = useRef<HTMLDivElement>(null);

    // Effect to handle collapse signal
    useEffect(() => {
        if (collapseSignal && depth > 0) {
            setUserExpanded(false);
        }
    }, [collapseSignal, depth]);

    const expanded = autoExpand || userExpanded;

    // Scroll into view when focused
    useEffect(() => {
        if (focusedPath === node.path && itemRef.current) {
            itemRef.current.scrollIntoView({ block: 'nearest' });
        }
    }, [focusedPath, node.path]);

    const isSelected = selectedPath === node.path;
    const isFocused = focusedPath === node.path;
    const isMultiSelected = selectedPaths.includes(node.path);
    const matchesSearch = searchTerm.length === 0 || node.name.toLowerCase().includes(searchTerm.toLowerCase());

    // For directories, check if any children match
    const hasMatchingChildren = useMemo(() => {
        if (!node.children) return false;
        const checkChildren = (children: FileNode[]): boolean => {
            return children.some(child =>
                child.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (child.children && checkChildren(child.children))
            );
        };
        return searchTerm.length > 0 && checkChildren(node.children);
    }, [node.children, searchTerm]);

    if (searchTerm.length > 0 && !matchesSearch && !hasMatchingChildren) {
        return null;
    }

    // Highlight search match
    const highlightMatch = (name: string) => {
        if (!searchTerm) return name;
        const index = name.toLowerCase().indexOf(searchTerm.toLowerCase());
        if (index === -1) return name;
        return (
            <>
                {name.slice(0, index)}
                <span className="bg-yellow-400/20 text-yellow-200 rounded-sm px-0.5">{name.slice(index, index + searchTerm.length)}</span>
                {name.slice(index + searchTerm.length)}
            </>
        );
    };

    if (node.type === 'directory') {
        return (
            <div className="animate-fade-in" ref={itemRef}>
                <button
                    onClick={() => setUserExpanded(!userExpanded)}
                    className={clsx(
                        "w-full flex items-center gap-2 px-4 py-1.5 text-sm transition-all group border-l-2",
                        isFocused ? "bg-white/5 border-primary" : "border-transparent hover:bg-white/5 hover:border-white/10",
                        "text-text-secondary hover:text-white"
                    )}
                    style={{ paddingLeft: `${depth * 20 + 16}px` }}
                >
                    <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${expanded ? '' : '-rotate-90'} text-text-muted group-hover:text-text-secondary`}>
                        expand_more
                    </span>
                    <span className={`material-symbols-outlined text-[20px] transition-colors ${expanded ? 'text-blue-400' : 'text-blue-400/70 group-hover:text-blue-400'}`}>
                        {expanded ? 'folder_open' : 'folder'}
                    </span>
                    <span className="text-sm font-medium truncate">{node.name}</span>
                    {node.children && (
                        <span className="text-[10px] text-text-muted ml-auto bg-white/5 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            {node.children.length}
                        </span>
                    )}
                </button>
                <div className={`grid transition-all duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                        {node.children && node.children.map((child, i) => (
                            <FileTreeItem
                                key={`${child.path}-${i}`}
                                node={child}
                                depth={depth + 1}
                                onFileSelect={onFileSelect}
                                onExplainFile={onExplainFile}
                                selectedPath={selectedPath}
                                searchTerm={searchTerm}
                                focusedPath={focusedPath}
                                onTogglePin={onTogglePin}
                                isPinned={isPinned}
                                multiSelectMode={multiSelectMode}
                                selectedPaths={selectedPaths}
                                onToggleMultiSelect={onToggleMultiSelect}
                                collapseSignal={collapseSignal}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={itemRef}
            className={clsx(
                "group flex items-center justify-between gap-2 px-4 py-1.5 transition-all cursor-pointer animate-fade-in border-l-2",
                isSelected
                    ? "bg-primary/10 border-primary text-white"
                    : "border-transparent hover:bg-white/5 hover:border-white/10 text-text-secondary hover:text-white",
                isFocused && !isSelected && "bg-white/5 border-primary/50",
                isMultiSelected && "bg-emerald-500/10 border-emerald-500"
            )}
            style={{ paddingLeft: `${depth * 20 + 16}px` }}
            onClick={() => {
                if (multiSelectMode && onToggleMultiSelect) {
                    onToggleMultiSelect(node.path);
                } else {
                    onFileSelect(node.path);
                }
            }}
        >
            <div className="flex items-center gap-2 truncate">
                {multiSelectMode && (
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            checked={isMultiSelected}
                            onChange={() => onToggleMultiSelect?.(node.path)}
                            className="peer appearance-none w-3.5 h-3.5 rounded border border-white/20 bg-slate-800 checked:bg-emerald-500 checked:border-emerald-500 transition-colors cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <span className="material-symbols-outlined text-[10px] text-white absolute inset-0 pointer-events-none opacity-0 peer-checked:opacity-100 flex items-center justify-center">check</span>
                    </div>
                )}
                <span className={`material-symbols-outlined text-[18px] transition-colors ${isSelected ? 'text-primary' : 'text-blue-400/70 group-hover:text-blue-400'}`}>description</span>
                <span className={clsx(
                    "text-sm truncate transition-colors",
                    isSelected ? "font-medium" : ""
                )}>{highlightMatch(node.name)}</span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(node.path); }}
                    className={clsx(
                        "p-1 rounded transition-all",
                        isPinned(node.path)
                            ? "text-yellow-400 bg-yellow-400/10"
                            : "text-text-muted hover:text-white hover:bg-white/10"
                    )}
                    title={isPinned(node.path) ? "Unpin" : "Pin to top"}
                >
                    <span className="material-symbols-outlined text-[14px]">
                        {isPinned(node.path) ? 'push_pin' : 'keep'}
                    </span>
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onExplainFile(node.path); }}
                    className="p-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition-all"
                    title="Explain this file"
                >
                    <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                </button>
            </div>
        </div>
    );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
    onFileSelect,
    onExplainFile,
    onMultiSelect,
    multiSelectMode = false,
    repoId
}) => {
    const [tree, setTree] = useState<FileNode[]>([]);
    const [repoUrl, setRepoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [focusedPath, setFocusedPath] = useState<string | null>(null);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [collapseSignal, setCollapseSignal] = useState(0);

    const { pinnedFiles, togglePin, isPinned } = usePinnedFiles();
    const { addRecentFile } = useRecentFiles();
    const containerRef = useRef<HTMLDivElement>(null);

    const loadTree = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getFileTree(repoId);
            setTree(data.tree);
            setRepoUrl(data.repo_url);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to load file tree');
        } finally {
            setLoading(false);
        }
    }, [repoId]);

    useEffect(() => {
        loadTree();
        const handleRefresh = () => loadTree();
        window.addEventListener('refreshFileTree', handleRefresh);
        return () => window.removeEventListener('refreshFileTree', handleRefresh);
    }, [loadTree]);

    // Flatten tree for keyboard navigation
    const flattenedPaths = useMemo(() => {
        const paths: string[] = [];
        const flatten = (nodes: FileNode[]) => {
            nodes.forEach(node => {
                paths.push(node.path);
                if (node.children) flatten(node.children);
            });
        };
        flatten(tree);
        return paths;
    }, [tree]);

    const handleFileSelect = useCallback(async (path: string) => {
        setSelectedPath(path);
        try {
            const content = await getFileContent(path, repoId);
            onFileSelect(content);
            addRecentFile(content);
        } catch (err) {
            logger.error('Failed to load file', err);
        }
    }, [onFileSelect, addRecentFile, repoId]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const currentIndex = focusedPath ? flattenedPaths.indexOf(focusedPath) : -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = Math.min(currentIndex + 1, flattenedPaths.length - 1);
            setFocusedPath(flattenedPaths[nextIndex]);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = Math.max(currentIndex - 1, 0);
            setFocusedPath(flattenedPaths[prevIndex]);
        } else if (e.key === 'Enter' && focusedPath) {
            handleFileSelect(focusedPath);
        }
    }, [focusedPath, flattenedPaths, handleFileSelect]);

    const handleToggleMultiSelect = (path: string) => {
        setSelectedPaths(prev => {
            const updated = prev.includes(path)
                ? prev.filter(p => p !== path)
                : [...prev, path];
            onMultiSelect?.(updated);
            return updated;
        });
    };

    // Count total files
    const fileCount = useMemo(() => {
        const countFiles = (nodes: FileNode[]): number => {
            return nodes.reduce((acc, node) => {
                if (node.type === 'file') return acc + 1;
                if (node.children) return acc + countFiles(node.children);
                return acc;
            }, 0);
        };
        return countFiles(tree);
    }, [tree]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 animate-fade-in text-text-muted">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm">Indexing repository structure...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm mb-4">
                    {error}
                </div>
                <button
                    onClick={loadTree}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (tree.length === 0) {
        return (
            <div className="p-8 text-center text-text-secondary flex flex-col items-center gap-3">
                <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-3xl opacity-50">folder_off</span>
                </div>
                <div>
                    <p className="font-medium text-white mb-1">No files indexed</p>
                    <p className="text-xs">Ingest a repository to start exploring</p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="h-full flex flex-col overflow-hidden bg-gradient-to-b from-transparent to-black/20"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* Header with search */}
            <div className="p-3 border-b border-white/5 space-y-3 bg-black/10 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Explorer</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-mono">
                            {fileCount}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {repoUrl && (
                            <a
                                href={repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
                                title="Open in GitHub"
                            >
                                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            </a>
                        )}
                        <button
                            onClick={() => setCollapseSignal(Date.now())}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
                            title="Collapse All Folders"
                        >
                            <span className="material-symbols-outlined text-[16px]">unfold_less</span>
                        </button>
                    </div>
                </div>

                {/* Search input */}
                <div className="relative group">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-text-muted group-focus-within:text-primary transition-colors">search</span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search files..."
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all placeholder:text-text-muted"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors text-text-muted hover:text-white"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Multi-select context badge */}
            {multiSelectMode && selectedPaths.length > 0 && (
                <div className="px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs flex items-center justify-between backdrop-blur-sm">
                    <span className="text-emerald-300 font-medium flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">layers</span>
                        {selectedPaths.length} selected
                    </span>
                    <button
                        onClick={() => setSelectedPaths([])}
                        className="text-emerald-400 hover:text-white transition-colors text-[10px] uppercase font-bold tracking-wide"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Pinned files section */}
            {pinnedFiles.length > 0 && (
                <div className="border-b border-white/5 bg-white/[0.02]">
                    <div className="px-4 py-2 text-[10px] text-yellow-500/80 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">push_pin</span>
                        Pinned
                    </div>
                    {pinnedFiles.map(path => (
                        <div
                            key={path}
                            className={clsx(
                                "group flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-all border-l-2",
                                selectedPath === path
                                    ? "bg-primary/10 border-primary text-white"
                                    : "border-transparent text-text-secondary hover:bg-white/5 hover:border-white/10 hover:text-white"
                            )}
                            onClick={() => handleFileSelect(path)}
                        >
                            <span className="material-symbols-outlined text-[18px] text-blue-400/80">description</span>
                            <span className="truncate flex-1 font-mono text-xs">{path.split('/').pop()}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); togglePin(path); }}
                                className="p-1 text-yellow-400 hover:bg-yellow-500/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <span className="material-symbols-outlined text-[14px]">push_pin</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* File tree */}
            <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
                {tree.map((node, i) => (
                    <FileTreeItem
                        key={i}
                        node={node}
                        depth={0}
                        onFileSelect={handleFileSelect}
                        onExplainFile={onExplainFile}
                        selectedPath={selectedPath}
                        searchTerm={searchTerm}
                        focusedPath={focusedPath}
                        onTogglePin={togglePin}
                        isPinned={isPinned}
                        multiSelectMode={multiSelectMode}
                        selectedPaths={selectedPaths}
                        onToggleMultiSelect={handleToggleMultiSelect}
                        collapseSignal={collapseSignal}
                    />
                ))}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-white/5 text-[10px] text-text-muted bg-black/20 flex justify-center">
                <span className="opacity-60">Use arrow keys to navigate</span>
            </div>
        </div>
    );
};
