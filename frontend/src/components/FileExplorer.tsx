import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getFileTree, getFileContent, type FileNode, type FileContentResponse } from '../lib/api';
import { usePinnedFiles } from '../hooks/usePinnedFiles';
import { useRecentFiles } from '../hooks/useRecentFiles';
import clsx from 'clsx';

interface FileExplorerProps {
    onFileSelect: (file: FileContentResponse) => void;
    onExplainFile: (filePath: string) => void;
    onMultiSelect?: (paths: string[]) => void;
    multiSelectMode?: boolean;
    repoId?: string; // Added repoId
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
                <span className="bg-yellow-400/30 text-yellow-200">{name.slice(index, index + searchTerm.length)}</span>
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
                        "w-full flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-[#232f48] transition-colors group",
                        isFocused && "ring-1 ring-primary",
                        "text-[#92a4c9] hover:text-white"
                    )}
                    style={{ paddingLeft: `${depth * 28 + 16}px` }}
                >
                    <span className={`material-symbols-outlined text-[20px] transition-transform ${expanded ? '' : '-rotate-90'}`}>
                        expand_more
                    </span>
                    <span className={`material-symbols-outlined text-[20px] ${expanded ? 'text-blue-400' : 'text-blue-400'}`}>
                        {expanded ? 'folder_open' : 'folder'}
                    </span>
                    <span className="text-sm font-medium">{node.name}</span>
                    {node.children && (
                        <span className="text-[10px] text-text-secondary ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            {node.children.length}
                        </span>
                    )}
                </button>
                {expanded && node.children && (
                    <div className="flex flex-col border-l border-[#232f48]" style={{ marginLeft: `${depth * 28 + 28}px` }}>
                        {node.children.map((child, i) => (
                            <FileTreeItem
                                key={`${i}-${collapseSignal}`}
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
                )}
            </div>
        );
    }

    return (
        <div
            ref={itemRef}
            className={clsx(
                "group flex items-center justify-between gap-2 px-4 py-1.5 transition-colors cursor-pointer animate-fade-in",
                isSelected
                    ? "bg-primary/10 border-r-2 border-primary"
                    : "hover:bg-[#232f48]",
                isFocused && "ring-1 ring-primary",
                isMultiSelected && "bg-emerald-600/20 border-r-2 border-emerald-500"
            )}
            style={{ paddingLeft: `${depth * 28 + 16}px` }}
            onClick={() => {
                if (multiSelectMode && onToggleMultiSelect) {
                    onToggleMultiSelect(node.path);
                } else {
                    onFileSelect(node.path);
                }
            }}
        >
            <div className="flex items-center gap-2">
                {multiSelectMode && (
                    <input
                        type="checkbox"
                        checked={isMultiSelected}
                        onChange={() => onToggleMultiSelect?.(node.path)}
                        className="w-3 h-3 rounded bg-border-dark border-border-dark text-emerald-500"
                        onClick={(e) => e.stopPropagation()}
                    />
                )}
                <span className="material-symbols-outlined text-[20px] text-[#3178c6]">description</span>
                <span className={clsx(
                    "text-sm truncate",
                    isSelected ? "font-bold text-white" : "font-medium text-[#92a4c9] group-hover:text-white"
                )}>{highlightMatch(node.name)}</span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(node.path); }}
                    className={clsx(
                        "p-1 rounded transition-all",
                        isPinned(node.path)
                            ? "text-yellow-400 hover:bg-yellow-500/20"
                            : "text-text-secondary hover:bg-border-dark"
                    )}
                    title={isPinned(node.path) ? "Unpin" : "Pin to top"}
                >
                    <span className="material-symbols-outlined text-[14px]">
                        {isPinned(node.path) ? 'push_pin' : 'keep'}
                    </span>
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onExplainFile(node.path); }}
                    className="p-1 hover:bg-primary/20 rounded transition-all"
                    title="Explain this file"
                >
                    <span className="material-symbols-outlined text-[14px] text-yellow-400">auto_awesome</span>
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
    repoId // Destructure repoId
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
    const { recentFiles, addRecentFile } = useRecentFiles();
    const containerRef = useRef<HTMLDivElement>(null);

    const loadTree = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getFileTree(repoId); // Pass repoId
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
    }, [loadTree]); // Changed dependency to loadTree which depends on repoId

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
            const content = await getFileContent(path, repoId); // Pass repoId
            onFileSelect(content);
            addRecentFile(content);
        } catch (err) {
            console.error('Failed to load file', err);
        }
    }, [onFileSelect, addRecentFile, repoId]); // Added repoId dependency

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
            <div className="p-4 space-y-3 animate-fade-in">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-1/2" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-red-400 text-sm glass-light m-2 rounded-lg border border-red-500/20">
                {error}
            </div>
        );
    }

    if (tree.length === 0) {
        return (
            <div className="p-4 text-center text-slate-500 text-sm">
                <p className="mb-1">No files indexed yet</p>
                <p className="text-xs text-slate-600">Ingest a repository first</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="h-full flex flex-col overflow-hidden"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* Header with search */}
            <div className="p-2 border-b border-slate-700/50 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Files</span>
                        <span className="text-[10px] text-text-secondary bg-border-dark px-1.5 py-0.5 rounded">
                            {fileCount}
                        </span>
                    </div>
                    {repoUrl && (
                        <a
                            href={repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-border-dark rounded transition-all text-primary hover:text-blue-300"
                            title="Open in GitHub"
                        >
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        </a>
                    )}
                    <button
                        onClick={() => setCollapseSignal(Date.now())}
                        className="p-1 hover:bg-border-dark rounded transition-all text-text-secondary hover:text-white"
                        title="Collapse All Folders"
                    >
                        <span className="material-symbols-outlined text-[16px]">unfold_less</span>
                    </button>
                </div>

                {/* Search input */}
                <div className="relative group">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-secondary group-focus-within:text-primary transition-colors">search</span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search files..."
                        className="w-full bg-[#0d1117] border border-border-dark rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-text-secondary"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-border-dark rounded transition-all text-text-secondary hover:text-white"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Multi-select context badge */}
            {multiSelectMode && selectedPaths.length > 0 && (
                <div className="px-2 py-1.5 bg-emerald-600/20 border-b border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                    <span>{selectedPaths.length} files selected for context</span>
                    <button
                        onClick={() => setSelectedPaths([])}
                        className="text-emerald-400 hover:text-emerald-200"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Pinned files section */}
            {pinnedFiles.length > 0 && (
                <div className="border-b border-border-dark">
                    <div className="px-3 py-1.5 text-[10px] text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">push_pin</span>
                        Pinned
                    </div>
                    {pinnedFiles.map(path => (
                        <div
                            key={path}
                            className={clsx(
                                "group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-all",
                                selectedPath === path
                                    ? "bg-primary/10 text-white"
                                    : "text-text-secondary hover:bg-border-dark"
                            )}
                            onClick={() => handleFileSelect(path)}
                        >
                            <span className="material-symbols-outlined text-[18px] text-[#3178c6]">description</span>
                            <span className="truncate flex-1">{path.split('/').pop()}</span>
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

            {/* Recent files section */}
            {recentFiles.length > 0 && (
                <div className="border-b border-border-dark">
                    <div className="px-3 py-1.5 text-[10px] text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        Recent
                    </div>
                    {recentFiles.slice(0, 3).map(file => (
                        <div
                            key={file.path}
                            className={clsx(
                                "group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-all",
                                selectedPath === file.path
                                    ? "bg-primary/10 text-white"
                                    : "text-text-secondary hover:bg-border-dark"
                            )}
                            onClick={() => handleFileSelect(file.path)}
                        >
                            <span className="material-symbols-outlined text-[18px] text-text-secondary">description</span>
                            <span className="truncate flex-1">{file.path.split('/').pop()}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* File tree */}
            <div className="flex-1 overflow-y-auto py-1">
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
            <div className="px-3 py-1.5 border-t border-slate-700/50 text-[10px] text-slate-600">
                ↑↓ Navigate • Enter to open • Click ⭐ to explain
            </div>
        </div>
    );
};
