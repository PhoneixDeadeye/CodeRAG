import React, { useState } from 'react';
import { useToast } from './Toast';
import {
    History, Share2, Sparkles, FileEdit, ArrowRight,
    ChevronUp, ChevronDown, Columns, List,
    Settings, X, MessageSquare, Code2, GitCommit, FileDiff
} from 'lucide-react';
import clsx from 'clsx';

interface DiffLine {
    type: 'unchanged' | 'added' | 'deleted' | 'empty';
    leftLineNum?: number;
    rightLineNum?: number;
    leftContent?: string;
    rightContent?: string;
}

interface DiffViewerProps {
    filePath: string;
    oldContent: string;
    newContent: string;
    oldBranch?: string;
    oldCommit?: string;
    newBranch?: string;
    newCommit?: string;
    onClose: () => void;
    onExplainDiff?: (oldContent: string, newContent: string, path: string) => void;
}

// Simple diff algorithm - compares line by line
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
    const result: DiffLine[] = [];
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
        if (oldIdx >= oldLines.length) {
            // All remaining are additions
            result.push({
                type: 'added',
                rightLineNum: newIdx + 1,
                leftContent: undefined,
                rightContent: newLines[newIdx],
            });
            newIdx++;
        } else if (newIdx >= newLines.length) {
            // All remaining are deletions
            result.push({
                type: 'deleted',
                leftLineNum: oldIdx + 1,
                leftContent: oldLines[oldIdx],
                rightContent: undefined,
            });
            oldIdx++;
        } else if (oldLines[oldIdx] === newLines[newIdx]) {
            // Unchanged
            result.push({
                type: 'unchanged',
                leftLineNum: oldIdx + 1,
                rightLineNum: newIdx + 1,
                leftContent: oldLines[oldIdx],
                rightContent: newLines[newIdx],
            });
            oldIdx++;
            newIdx++;
        } else {
            // Changed - show as delete then add
            result.push({
                type: 'deleted',
                leftLineNum: oldIdx + 1,
                leftContent: oldLines[oldIdx],
                rightContent: undefined,
            });
            result.push({
                type: 'added',
                rightLineNum: newIdx + 1,
                leftContent: undefined,
                rightContent: newLines[newIdx],
            });
            oldIdx++;
            newIdx++;
        }
    }

    return result;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
    filePath,
    oldContent,
    newContent,
    oldBranch = 'dev-branch',
    oldCommit = '7f3a91',
    newBranch = 'main',
    newCommit = 'HEAD',
    onClose,
    onExplainDiff,
}) => {
    const { addToast } = useToast();
    const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

    const pathParts = filePath.split('/');
    const fileName = pathParts.pop() || '';

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines = computeDiff(oldLines, newLines);

    const deletedCount = diffLines.filter(d => d.type === 'deleted').length;
    const addedCount = diffLines.filter(d => d.type === 'added').length;

    const getLanguageFromPath = (path: string): string => {
        const ext = path.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
            py: 'Python', java: 'Java', cpp: 'C++', c: 'C', go: 'Go', rs: 'Rust',
            rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin', cs: 'C#',
        };
        return langMap[ext || ''] || ext?.toUpperCase() || 'Text';
    };

    return (
        <div className="h-full flex flex-col bg-background-dark animate-fade-in relative z-50">
            {/* Header with Breadcrumbs */}
            <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-[#0f1219]">
                <nav className="flex items-center text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    <FileDiff className="w-4 h-4 text-text-muted mr-3" />
                    {pathParts.map((part, index) => (
                        <span key={index} className="flex items-center">
                            <span className="text-text-muted hover:text-white transition-colors cursor-pointer">{part}</span>
                            <span className="mx-2 text-border-dark">/</span>
                        </span>
                    ))}
                    <span className="text-white bg-white/5 px-2 py-0.5 rounded border border-white/10">{fileName}</span>
                </nav>
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={() => addToast('History coming soon', 'info')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-transparent hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-xs font-medium"
                    >
                        <History className="w-4 h-4" />
                        <span>History</span>
                    </button>
                    <button
                        onClick={() => addToast('Sharing coming soon', 'info')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-transparent hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-xs font-medium"
                    >
                        <Share2 className="w-4 h-4" />
                        <span>Share</span>
                    </button>
                    <div className="h-6 w-px bg-white/10"></div>
                    <button
                        onClick={() => onExplainDiff?.(oldContent, newContent, filePath)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-teal-600 hover:from-primary/90 hover:to-teal-600/90 text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                    >
                        <Sparkles className="w-4 h-4" />
                        <span>Explain Diff</span>
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="h-14 border-b border-border-dark flex items-center justify-between px-6 bg-[#0f1219]/90 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                            <FileEdit className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col justify-center">
                            <span className="text-white text-sm font-bold leading-none">{fileName}</span>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                                    -{deletedCount} lines
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                                    +{addedCount} lines
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="h-8 w-px bg-white/10"></div>

                    {/* Branch Selector */}
                    <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1 border border-white/5">
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition text-xs font-medium text-white border border-white/5">
                            <GitCommit className="w-3.5 h-3.5 text-text-muted" />
                            <span>{oldBranch}</span>
                            <span className="text-text-muted font-mono bg-black/20 px-1 rounded">{oldCommit}</span>
                        </button>
                        <ArrowRight className="w-4 h-4 text-text-muted" />
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/5 transition text-xs font-medium text-text-secondary hover:text-white">
                            <GitCommit className="w-3.5 h-3.5 text-text-muted" />
                            <span>{newBranch}</span>
                            <span className="text-text-muted font-mono bg-black/20 px-1 rounded">{newCommit}</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Navigation */}
                    <div className="flex items-center bg-black/20 rounded-lg p-0.5 border border-white/5">
                        <button className="p-1.5 rounded hover:bg-white/10 text-text-muted hover:text-white transition-colors" title="Previous Change">
                            <ChevronUp className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/10 text-text-muted hover:text-white transition-colors" title="Next Change">
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-1"></div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-black/20 rounded-lg p-0.5 text-xs font-medium border border-white/5">
                        <button
                            onClick={() => setViewMode('split')}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded transition-all",
                                viewMode === 'split' ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Columns className="w-3.5 h-3.5" />
                            Split
                        </button>
                        <button
                            onClick={() => setViewMode('unified')}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded transition-all",
                                viewMode === 'unified' ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-white hover:bg-white/5"
                            )}
                        >
                            <List className="w-3.5 h-3.5" />
                            Unified
                        </button>
                    </div>

                    <button className="p-2 rounded text-text-muted hover:text-white hover:bg-white/5 transition-colors ml-1" title="Settings">
                        <Settings className="w-5 h-5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Diff Content */}
            <div className="flex-1 overflow-auto bg-[#0b0f17] relative scrollbar-thin">
                <div className="min-w-full font-mono text-[13px] leading-[1.6] flex flex-col">
                    {diffLines.map((line, idx) => (
                        <div key={idx} className="flex w-full hover:bg-white/5 group transition-colors">
                            {/* Left Side */}
                            {(viewMode === 'split' || line.type !== 'added') && (
                                <div className={clsx(
                                    "flex border-r border-white/5 relative",
                                    viewMode === 'split' ? 'w-1/2' : 'w-full',
                                    line.type === 'deleted' ? 'bg-red-500/10' :
                                        line.type === 'added' ? 'bg-[#1b222d] opacity-50' : ''
                                )}>
                                    <div className={clsx(
                                        "w-12 px-2 text-right select-none shrink-0 border-r border-white/5 bg-black/20 py-0.5",
                                        line.type === 'deleted' ? 'text-red-500 font-bold' : 'text-gray-600 group-hover:text-gray-500'
                                    )}>
                                        {line.leftLineNum || ''}
                                    </div>
                                    <div className="px-4 text-[#abb2bf] whitespace-pre overflow-x-hidden py-0.5">
                                        {line.leftContent || ''}
                                    </div>
                                </div>
                            )}

                            {/* Right Side */}
                            {(viewMode === 'split' || line.type !== 'deleted') && (
                                <div className={clsx(
                                    "flex",
                                    viewMode === 'split' ? 'w-1/2' : 'w-full',
                                    line.type === 'added' ? 'bg-green-500/10' :
                                        line.type === 'deleted' ? 'bg-[#1b222d] opacity-50' : ''
                                )}>
                                    <div className={clsx(
                                        "w-12 px-2 text-right select-none shrink-0 border-r border-white/5 bg-black/20 border-l py-0.5",
                                        line.type === 'added' ? 'text-green-500 font-bold' : 'text-gray-600 group-hover:text-gray-500'
                                    )}>
                                        {line.rightLineNum || ''}
                                    </div>
                                    <div className="px-4 text-[#abb2bf] whitespace-pre overflow-x-hidden py-0.5">
                                        {line.rightContent || ''}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Floating AI Button */}
                <div className="absolute bottom-6 right-8 z-10">
                    <button
                        onClick={() => onExplainDiff?.(oldContent, newContent, filePath)}
                        className="flex items-center gap-3 bg-primary hover:bg-primary/90 text-white px-5 py-3 rounded-full shadow-xl shadow-black/50 transition-all hover:scale-105 active:scale-95 group border border-white/10"
                    >
                        <MessageSquare className="w-5 h-5 animate-pulse" />
                        <span className="font-bold pr-1">Ask about this change</span>
                    </button>
                </div>
            </div>

            {/* Status Bar */}
            <footer className="h-8 bg-primary/20 border-t border-primary/30 flex items-center justify-between px-4 text-white text-xs select-none backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">
                        <GitCommit className="w-3.5 h-3.5 text-primary" />
                        <span className="font-medium text-primary-foreground">{oldBranch}*</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-text-secondary">
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">Diff: {viewMode === 'split' ? 'Split' : 'Unified'}</span>
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">UTF-8</span>
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors uppercase tracking-tight flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5" />
                        {getLanguageFromPath(filePath)}
                    </span>
                </div>
            </footer>
        </div>
    );
};
