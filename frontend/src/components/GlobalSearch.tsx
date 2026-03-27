import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileCode, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { globalSearch, type SearchResult } from '../lib/api';
import { logger } from '../lib/logger';

interface GlobalSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onResultClick: (filePath: string, lineNumber: number) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
    isOpen,
    onClose,
    onResultClick,
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isRegex, setIsRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
        }
    }, [isOpen]);

    // Search with debounce
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await globalSearch(query, isRegex, caseSensitive);
                setResults(data.results || []);
                setSelectedIndex(0);
            } catch (err) {
                logger.error('Search failed', err);
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, isRegex, caseSensitive]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            onResultClick(results[selectedIndex].file_path, results[selectedIndex].line_number);
            onClose();
        }
    }, [results, selectedIndex, onResultClick, onClose]);

    // Handle backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-start justify-center pt-[12vh] animate-fade-in"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-2xl mx-4 animate-scale-in">
                {/* Gradient border wrapper */}
                <div className="relative rounded-2xl p-[1px] bg-gradient-to-b from-white/20 via-white/5 to-transparent">
                    <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden">
                        {/* Search Input */}
                        <div className="flex items-center gap-3 p-5 border-b border-white/10">
                            <div className="relative">
                                <Search className="w-5 h-5 text-primary shrink-0" />
                                {loading && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                    </div>
                                )}
                            </div>
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search across all files..."
                                className="flex-1 bg-transparent text-white outline-none text-lg placeholder:text-text-muted font-medium"
                            />
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Options */}
                        <div className="flex items-center gap-4 px-5 py-3 border-b border-white/5 text-xs bg-white/[0.02]">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isRegex}
                                    onChange={(e) => setIsRegex(e.target.checked)}
                                    className="rounded bg-slate-800 border-white/20 text-primary focus:ring-primary/50"
                                />
                                <span className="text-text-secondary group-hover:text-white transition-colors">Regex</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={caseSensitive}
                                    onChange={(e) => setCaseSensitive(e.target.checked)}
                                    className="rounded bg-slate-800 border-white/20 text-primary focus:ring-primary/50"
                                />
                                <span className="text-text-secondary group-hover:text-white transition-colors">Case Sensitive</span>
                            </label>
                            {results.length > 0 && (
                                <span className="text-primary font-medium ml-auto">
                                    {results.length} result{results.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Results */}
                        <div className="max-h-[50vh] overflow-y-auto">
                            {results.length === 0 && query && !loading ? (
                                <div className="p-12 text-center">
                                    <div className="inline-flex p-4 rounded-2xl bg-slate-800/50 mb-4">
                                        <Search className="w-8 h-8 text-text-muted" />
                                    </div>
                                    <p className="text-text-secondary">No results found for "{query}"</p>
                                    <p className="text-text-muted text-sm mt-1">Try a different search term</p>
                                </div>
                            ) : results.length === 0 && !query ? (
                                <div className="p-12 text-center">
                                    <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-teal-500/20 mb-4">
                                        <Search className="w-8 h-8 text-primary" />
                                    </div>
                                    <p className="text-text-secondary">Start typing to search</p>
                                    <p className="text-text-muted text-sm mt-1">Search file contents across your codebase</p>
                                </div>
                            ) : (
                                results.map((result, index) => (
                                    <button
                                        key={`${result.file_path}-${result.line_number}-${index}`}
                                        onClick={() => {
                                            onResultClick(result.file_path, result.line_number);
                                            onClose();
                                        }}
                                        className={`w-full text-left px-5 py-3.5 border-b border-white/5 transition-all group ${index === selectedIndex
                                            ? 'bg-primary/15 border-l-2 border-l-primary'
                                            : 'hover:bg-white/5'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 text-sm">
                                            <FileCode className={`w-4 h-4 shrink-0 transition-colors ${index === selectedIndex ? 'text-primary' : 'text-cyan-400'
                                                }`} />
                                            <span className="text-gray-300 font-mono truncate group-hover:text-white transition-colors">
                                                {result.file_path}
                                            </span>
                                            <span className="text-text-muted shrink-0 bg-slate-800/50 px-2 py-0.5 rounded text-xs">
                                                L{result.line_number}
                                            </span>
                                        </div>
                                        <div className="mt-2 font-mono text-xs text-text-secondary truncate pl-7 group-hover:text-gray-400 transition-colors">
                                            {result.line_content}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-white/10 bg-slate-950/50 text-[11px] text-text-muted flex items-center gap-6">
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-mono">
                                    <ArrowUp className="w-3 h-3 inline" />
                                </kbd>
                                <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-mono">
                                    <ArrowDown className="w-3 h-3 inline" />
                                </kbd>
                                <span className="ml-1">Navigate</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-mono">↵</kbd>
                                <span>Open</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-mono">Esc</kbd>
                                <span>Close</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

