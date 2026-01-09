import React, { useState } from 'react';
import { useToast } from '../contexts/ToastContextCore';

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
    const { showToast } = useToast();
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
        <div className="h-full flex flex-col bg-[#0b0f17]">
            {/* Header with Breadcrumbs */}
            <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-sidebar-dark z-20">
                <nav className="flex items-center text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    {pathParts.map((part, index) => (
                        <span key={index} className="flex items-center">
                            <span className="text-[#92a4c9] hover:text-white transition-colors cursor-pointer">{part}</span>
                            <span className="mx-2 text-[#566585]">/</span>
                        </span>
                    ))}
                    <span className="text-white bg-[#232f48] px-2 py-0.5 rounded border border-[#3a4b6e]">{fileName} (Diff)</span>
                </nav>
                <div className="flex items-center gap-4 shrink-0">
                    <button
                        onClick={() => showToast('History coming soon', 'info')}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-transparent hover:bg-[#232f48] text-[#92a4c9] hover:text-white transition-colors text-sm font-medium"
                    >
                        <span className="material-symbols-outlined text-[20px]">history</span>
                        <span>History</span>
                    </button>
                    <button
                        onClick={() => showToast('Sharing coming soon', 'info')}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-transparent hover:bg-[#232f48] text-[#92a4c9] hover:text-white transition-colors text-sm font-medium"
                    >
                        <span className="material-symbols-outlined text-[20px]">share</span>
                        <span>Share</span>
                    </button>
                    <div className="h-6 w-px bg-[#232f48]"></div>
                    <button
                        onClick={() => onExplainDiff?.(oldContent, newContent, filePath)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                        <span>Explain Diff</span>
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="h-14 border-b border-border-dark flex items-center justify-between px-6 bg-sidebar-dark/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[20px] text-yellow-500">edit_document</span>
                        <div className="flex flex-col justify-center">
                            <span className="text-white text-sm font-bold leading-none">{fileName}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="text-[#92a4c9] text-[10px]">-{deletedCount} lines</span>
                                <span className="w-2 h-2 rounded-full bg-green-500 ml-1"></span>
                                <span className="text-[#92a4c9] text-[10px]">+{addedCount} lines</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-[#232f48]"></div>
                    {/* Branch Selector */}
                    <div className="flex items-center gap-2 bg-[#232f48] rounded-md p-1">
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#111722] hover:bg-gray-800 transition text-xs font-medium text-white border border-border-dark">
                            <span className="material-symbols-outlined text-[14px] text-gray-400">commit</span>
                            <span>{oldBranch}</span>
                            <span className="text-gray-500">{oldCommit}</span>
                        </button>
                        <span className="material-symbols-outlined text-[#566585] text-[16px]">arrow_right_alt</span>
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-[#111722] transition text-xs font-medium text-[#92a4c9] hover:text-white">
                            <span className="material-symbols-outlined text-[14px]">commit</span>
                            <span>{newBranch}</span>
                            <span className="text-gray-500">{newCommit}</span>
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Navigation */}
                    <div className="flex items-center bg-[#232f48] rounded-md p-0.5">
                        <button className="p-1.5 rounded hover:bg-white/10 text-[#92a4c9] hover:text-white transition-colors" title="Previous Change">
                            <span className="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/10 text-[#92a4c9] hover:text-white transition-colors" title="Next Change">
                            <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                        </button>
                    </div>
                    <div className="h-6 w-px bg-[#232f48] mx-1"></div>
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-[#232f48] rounded-md p-0.5 text-xs font-medium">
                        <button
                            onClick={() => setViewMode('split')}
                            className={`px-3 py-1.5 rounded transition-colors ${viewMode === 'split' ? 'bg-primary text-white shadow-sm' : 'text-[#92a4c9] hover:text-white hover:bg-white/5'}`}
                        >
                            Split
                        </button>
                        <button
                            onClick={() => setViewMode('unified')}
                            className={`px-3 py-1.5 rounded transition-colors ${viewMode === 'unified' ? 'bg-primary text-white shadow-sm' : 'text-[#92a4c9] hover:text-white hover:bg-white/5'}`}
                        >
                            Unified
                        </button>
                    </div>
                    <button className="p-2 rounded text-[#92a4c9] hover:text-white hover:bg-[#232f48] transition-colors ml-1" title="Settings">
                        <span className="material-symbols-outlined text-[20px]">settings</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded text-[#92a4c9] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Close"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
            </div>

            {/* Diff Content */}
            <div className="flex-1 overflow-auto bg-[#0b0f17] relative">
                <div className="min-w-full font-mono text-[13px] leading-[1.6] flex flex-col">
                    {diffLines.map((line, idx) => (
                        <div key={idx} className="flex w-full hover:bg-white/5 group">
                            {/* Left Side */}
                            <div className={`w-1/2 flex border-r border-[#232f48] ${line.type === 'deleted' ? 'bg-red-500/10' :
                                line.type === 'added' ? 'bg-[repeating-linear-gradient(45deg,#232f48,#232f48_2px,transparent_2px,transparent_8px)] opacity-30' :
                                    ''
                                }`}>
                                <div className={`w-12 px-2 text-right select-none shrink-0 ${line.type === 'deleted' ? 'text-red-500' : 'text-[#4b5563] group-hover:text-[#6b7280]'
                                    }`}>
                                    {line.leftLineNum || ''}
                                </div>
                                <div className="px-4 text-[#abb2bf] whitespace-pre overflow-x-hidden">
                                    {line.leftContent || ''}
                                </div>
                            </div>
                            {/* Right Side */}
                            <div className={`w-1/2 flex ${line.type === 'added' ? 'bg-green-500/10' :
                                line.type === 'deleted' ? 'bg-[repeating-linear-gradient(45deg,#232f48,#232f48_2px,transparent_2px,transparent_8px)] opacity-30' :
                                    ''
                                }`}>
                                <div className={`w-12 px-2 text-right select-none shrink-0 ${line.type === 'added' ? 'text-green-500' : 'text-[#4b5563] group-hover:text-[#6b7280]'
                                    }`}>
                                    {line.rightLineNum || ''}
                                </div>
                                <div className="px-4 text-[#abb2bf] whitespace-pre overflow-x-hidden">
                                    {line.rightContent || ''}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Floating AI Button */}
                <div className="absolute bottom-6 right-8">
                    <button
                        onClick={() => onExplainDiff?.(oldContent, newContent, filePath)}
                        className="flex items-center gap-3 bg-primary hover:bg-primary/90 text-white px-5 py-3 rounded-full shadow-xl shadow-black/50 transition-transform hover:scale-105 active:scale-95 group"
                    >
                        <span className="material-symbols-outlined text-[24px] animate-pulse">chat</span>
                        <span className="font-bold pr-1">Ask about this change</span>
                    </button>
                </div>
            </div>

            {/* Status Bar */}
            <footer className="h-8 bg-primary border-t border-primary flex items-center justify-between px-4 text-white text-xs select-none">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">
                        <span className="material-symbols-outlined text-[14px]">source</span>
                        <span className="font-medium">{oldBranch}*</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">Diff: {viewMode === 'split' ? 'Split' : 'Unified'}</span>
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors">UTF-8</span>
                    <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors uppercase tracking-tight">{getLanguageFromPath(filePath)}</span>
                    <span className="material-symbols-outlined text-[14px] hover:bg-white/10 p-0.5 rounded cursor-pointer">notifications</span>
                </div>
            </footer>
        </div>
    );
};
