import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileCode, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { globalSearch, type SearchResult } from '../lib/api';

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
                console.error('Search failed', err);
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-2xl bg-sidebar-dark border border-border-dark rounded-xl shadow-2xl overflow-hidden animate-scale-in">
                {/* Search Input */}
                <div className="flex items-center gap-3 p-4 border-b border-border-dark">
                    <Search className="w-5 h-5 text-slate-400 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search across all files..."
                        className="flex-1 bg-transparent text-white outline-none text-lg placeholder:text-text-secondary"
                    />
                    {loading && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-border-dark rounded transition-colors text-text-secondary hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Options */}
                <div className="flex items-center gap-4 px-4 py-2 border-b border-border-dark/50 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isRegex}
                            onChange={(e) => setIsRegex(e.target.checked)}
                            className="rounded bg-border-dark border-border-dark text-primary focus:ring-primary"
                        />
                        <span className="text-text-secondary">Regex</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={caseSensitive}
                            onChange={(e) => setCaseSensitive(e.target.checked)}
                            className="rounded bg-border-dark border-border-dark text-primary focus:ring-primary"
                        />
                        <span className="text-text-secondary">Case Sensitive</span>
                    </label>
                    <span className="text-text-secondary ml-auto">
                        {results.length > 0 && `${results.length} results`}
                    </span>
                </div>

                {/* Results */}
                <div className="max-h-[50vh] overflow-y-auto">
                    {results.length === 0 && query && !loading ? (
                        <div className="p-8 text-center text-text-secondary">
                            No results found for "{query}"
                        </div>
                    ) : (
                        results.map((result, index) => (
                            <button
                                key={`${result.file_path}-${result.line_number}-${index}`}
                                onClick={() => {
                                    onResultClick(result.file_path, result.line_number);
                                    onClose();
                                }}
                                className={`w-full text-left px-4 py-3 border-b border-border-dark/50 transition-colors ${index === selectedIndex
                                    ? 'bg-primary/20 border-l-2 border-l-primary'
                                    : 'hover:bg-border-dark/50'
                                    }`}
                            >
                                <div className="flex items-center gap-2 text-sm">
                                    <FileCode className="w-4 h-4 text-primary shrink-0" />
                                    <span className="text-gray-300 font-mono truncate">{result.file_path}</span>
                                    <span className="text-text-secondary">:{result.line_number}</span>
                                </div>
                                <div className="mt-1 font-mono text-xs text-text-secondary truncate pl-6">
                                    {result.line_content}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-border-dark text-[10px] text-text-secondary flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> Navigate
                    </span>
                    <span>↵ Open</span>
                    <span>Esc Close</span>
                </div>
            </div>
        </div>
    );
};
