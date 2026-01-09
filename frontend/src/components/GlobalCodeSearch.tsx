import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { globalSearch, type SearchResult } from '../lib/api';

interface GlobalCodeSearchProps {
    onResultClick?: (filePath: string, lineNumber: number) => void;
    onClose?: () => void;
}

const getLanguageFromPath = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
        'ts': 'typescript', 'tsx': 'typescript',
        'js': 'javascript', 'jsx': 'javascript',
        'py': 'python', 'rs': 'rust', 'go': 'go',
        'java': 'java', 'cpp': 'c++', 'c': 'c', 'h': 'c',
    };
    return langMap[ext] || ext;
};

const getLanguageIcon = (lang: string) => {
    switch (lang.toLowerCase()) {
        case 'typescript':
        case 'javascript':
            return 'javascript';
        case 'python':
            return 'data_object';
        default:
            return 'code';
    }
};

const getLanguageColor = (lang: string) => {
    switch (lang.toLowerCase()) {
        case 'typescript':
        case 'javascript':
            return 'blue';
        case 'python':
            return 'purple';
        case 'rust':
            return 'orange';
        default:
            return 'yellow';
    }
};

export const GlobalCodeSearch: React.FC<GlobalCodeSearchProps> = ({
    onResultClick,
    onClose,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isRegex, setIsRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [sortBy, setSortBy] = useState('relevance');

    // API state
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTime, setSearchTime] = useState<number>(0);
    const [hasSearched, setHasSearched] = useState(false);

    // Debounced search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setLoading(true);
            setError(null);
            const startTime = performance.now();

            try {
                const response = await globalSearch(searchQuery, isRegex, caseSensitive);
                setResults(response.results);
                setSearchTime((performance.now() - startTime) / 1000);
                setHasSearched(true);
            } catch (err: unknown) {
                console.error('Search failed:', err);
                const error = err as { response?: { data?: { detail?: string } } };
                setError(error.response?.data?.detail || 'Search failed. Please try again.');
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery, isRegex, caseSensitive]);

    // Extract unique file paths for display
    const uniqueFiles = useMemo(() => {
        const files = new Set(results.map(r => r.file_path));
        return files.size;
    }, [results]);

    // Dynamic filter options based on results
    const repoFilters = useMemo(() => {
        const repos = new Set(results.map(r => r.file_path.split('/')[0] || 'root'));
        return Array.from(repos);
    }, [results]);

    const langFilters = useMemo(() => {
        const langs = new Set(results.map(r => getLanguageFromPath(r.file_path)));
        return Array.from(langs);
    }, [results]);

    // Filter states
    const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
    const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());

    const toggleRepoFilter = (repo: string) => {
        setSelectedRepos(prev => {
            const next = new Set(prev);
            if (next.has(repo)) next.delete(repo);
            else next.add(repo);
            return next;
        });
    };

    const toggleLangFilter = (lang: string) => {
        setSelectedLangs(prev => {
            const next = new Set(prev);
            if (next.has(lang)) next.delete(lang);
            else next.add(lang);
            return next;
        });
    };

    // Apply filters
    const filteredResults = useMemo(() => {
        let filtered = results;

        if (selectedRepos.size > 0) {
            filtered = filtered.filter(r => {
                const repo = r.file_path.split('/')[0] || 'root';
                return selectedRepos.has(repo);
            });
        }

        if (selectedLangs.size > 0) {
            filtered = filtered.filter(r => selectedLangs.has(getLanguageFromPath(r.file_path)));
        }

        return filtered;
    }, [results, selectedRepos, selectedLangs]);

    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) return;

        setLoading(true);
        setError(null);
        const startTime = performance.now();

        try {
            const response = await globalSearch(searchQuery, isRegex, caseSensitive);
            setResults(response.results);
            setSearchTime((performance.now() - startTime) / 1000);
            setHasSearched(true);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Search failed. Please try again.');
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [searchQuery, isRegex, caseSensitive]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const resetFilters = () => {
        setSelectedRepos(new Set());
        setSelectedLangs(new Set());
    };

    return (
        <div className="flex h-full bg-background-dark">
            {/* Sidebar Filters */}
            <aside className="w-72 hidden lg:flex flex-col border-r border-border-dark bg-background-dark overflow-y-auto">
                <div className="p-5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg">Filters</h3>
                        <button
                            onClick={resetFilters}
                            className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                            Reset All
                        </button>
                    </div>
                    <div className="flex flex-col gap-4">
                        {/* Repositories Filter */}
                        <details className="group" open>
                            <summary className="flex cursor-pointer items-center justify-between py-2 list-none text-slate-200 font-medium">
                                <span>Folders</span>
                                <span className="material-symbols-outlined transition-transform group-open:rotate-180 text-slate-400">expand_more</span>
                            </summary>
                            <div className="pt-2 pb-4 flex flex-col gap-2">
                                {repoFilters.length === 0 ? (
                                    <span className="text-xs text-slate-500">No results to filter</span>
                                ) : (
                                    repoFilters.map(repo => (
                                        <label key={repo} className="flex items-center gap-3 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                                            <input
                                                type="checkbox"
                                                checked={selectedRepos.has(repo)}
                                                onChange={() => toggleRepoFilter(repo)}
                                                className="form-checkbox size-4 rounded border-slate-600 bg-transparent text-primary focus:ring-primary focus:ring-offset-0"
                                            />
                                            <span className="text-sm text-slate-400">{repo}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </details>

                        {/* Language Filter */}
                        <details className="group" open>
                            <summary className="flex cursor-pointer items-center justify-between py-2 list-none text-slate-200 font-medium">
                                <span>Language</span>
                                <span className="material-symbols-outlined transition-transform group-open:rotate-180 text-slate-400">expand_more</span>
                            </summary>
                            <div className="pt-2 pb-4 flex flex-col gap-2">
                                {langFilters.length === 0 ? (
                                    <span className="text-xs text-slate-500">No results to filter</span>
                                ) : (
                                    langFilters.map(lang => (
                                        <label key={lang} className="flex items-center gap-3 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                                            <input
                                                type="checkbox"
                                                checked={selectedLangs.has(lang)}
                                                onChange={() => toggleLangFilter(lang)}
                                                className="form-checkbox size-4 rounded border-slate-600 bg-transparent text-primary focus:ring-primary focus:ring-offset-0"
                                            />
                                            <span className="text-sm text-slate-400 capitalize">{lang}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </details>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Search Header */}
                <div className="bg-background-dark/95 backdrop-blur-sm z-30 pt-6 px-6 pb-4 border-b border-border-dark shadow-sm">
                    <div className="max-w-5xl mx-auto w-full flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-4">
                            <h1 className="text-2xl font-bold tracking-tight text-white">Global Search</h1>
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-border-dark text-slate-400 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            )}
                        </div>

                        {/* Search Input */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <span className="material-symbols-outlined text-slate-500">search</span>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="block w-full pl-11 pr-24 py-4 rounded-xl bg-[#1a202c] border-0 ring-1 ring-slate-700 focus:ring-2 focus:ring-primary text-white placeholder:text-slate-500 text-lg shadow-sm transition-shadow"
                                placeholder="Search code (e.g. function name, variable, or regex)..."
                            />
                            <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                                <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-slate-400 bg-slate-800 rounded border border-slate-700">
                                    Enter
                                </kbd>
                                <button
                                    onClick={handleSearch}
                                    disabled={loading || !searchQuery.trim()}
                                    className="bg-primary hover:bg-blue-600 text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {loading ? (
                                        <span className="material-symbols-outlined animate-spin">sync</span>
                                    ) : (
                                        <span className="material-symbols-outlined">arrow_forward</span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Search Option Chips */}
                        <div className="flex flex-wrap items-center gap-3">
                            <label
                                onClick={() => setIsRegex(!isRegex)}
                                className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${isRegex ? 'border-primary bg-primary/10 text-primary' : 'border-slate-700 bg-[#1a202c] text-slate-300 hover:bg-[#232b3a]'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">regular_expression</span>
                                <span className="text-sm font-medium">Regex</span>
                            </label>
                            <label
                                onClick={() => setCaseSensitive(!caseSensitive)}
                                className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${caseSensitive ? 'border-primary bg-primary/10 text-primary' : 'border-slate-700 bg-[#1a202c] text-slate-300 hover:bg-[#232b3a]'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">match_case</span>
                                <span className="text-sm font-medium">Case Sensitive</span>
                            </label>
                            <label
                                onClick={() => setWholeWord(!wholeWord)}
                                className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${wholeWord ? 'border-primary bg-primary/10 text-primary' : 'border-slate-700 bg-[#1a202c] text-slate-300 hover:bg-[#232b3a]'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">format_underlined</span>
                                <span className="text-sm font-medium">Whole Word</span>
                            </label>
                        </div>

                        {/* Results Meta */}
                        {hasSearched && (
                            <div className="flex items-center justify-between pt-2">
                                <p className="text-sm text-slate-400">
                                    Found <span className="font-bold text-white">{filteredResults.length} matches</span> in <span className="font-bold text-white">{uniqueFiles} files</span>{' '}
                                    <span className="text-xs opacity-60">({searchTime.toFixed(2)}s)</span>
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">Sort by:</span>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="bg-transparent text-sm font-medium text-slate-300 border-none focus:ring-0 p-0 pr-6 cursor-pointer"
                                    >
                                        <option value="relevance">Relevance</option>
                                        <option value="date">Date Modified</option>
                                        <option value="name">File Name</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Scrollable Results */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
                        {/* Loading State */}
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                                <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
                                <p className="text-slate-400">Searching codebase...</p>
                            </div>
                        )}

                        {/* Error State */}
                        {error && !loading && (
                            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                                <span className="material-symbols-outlined text-4xl text-red-400 mb-4">error</span>
                                <p className="text-red-400 mb-4">{error}</p>
                                <button
                                    onClick={handleSearch}
                                    className="px-4 py-2 bg-primary hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {/* Empty State - No Query */}
                        {!loading && !error && !hasSearched && (
                            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-4">search</span>
                                <p className="text-slate-400 text-lg mb-2">Search your codebase</p>
                                <p className="text-slate-500 text-sm">Enter a search query to find code across all indexed files</p>
                            </div>
                        )}

                        {/* Empty State - No Results */}
                        {!loading && !error && hasSearched && filteredResults.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-4">search_off</span>
                                <p className="text-slate-400 text-lg mb-2">No results found</p>
                                <p className="text-slate-500 text-sm">Try a different search query or adjust your filters</p>
                            </div>
                        )}

                        {/* Results */}
                        {!loading && !error && filteredResults.map((result, index) => {
                            const lang = getLanguageFromPath(result.file_path);
                            const color = getLanguageColor(lang);
                            return (
                                <div
                                    key={`${result.file_path}-${result.line_number}-${index}`}
                                    className="flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#1a202c] shadow-sm group hover:border-primary/50 transition-colors cursor-pointer"
                                    onClick={() => onResultClick?.(result.file_path, result.line_number)}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between border-b border-slate-700/50 bg-[#1a202c] px-4 py-3">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`flex items-center justify-center size-8 rounded bg-${color}-900/30 text-${color}-400`}>
                                                <span className="material-symbols-outlined text-[20px]">{getLanguageIcon(lang)}</span>
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="truncate text-base font-semibold text-primary hover:underline">{result.file_path}</span>
                                                    <span className="inline-flex items-center rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">
                                                        Line {result.line_number}
                                                    </span>
                                                </div>
                                                <p className="truncate text-xs text-slate-500 capitalize">{lang}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="p-1.5 text-slate-400 hover:text-primary rounded hover:bg-slate-700"
                                                title="Copy Path"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(result.file_path).then(() => {
                                                        // Fallback notification or just assume success if no toast context
                                                    }).catch(err => console.error('Copy failed', err));
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">content_copy</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Code Snippet */}
                                    <div className="bg-[#0d1117] overflow-x-auto">
                                        <div className="flex font-mono text-sm leading-6">
                                            {/* Line Numbers */}
                                            <div className="flex flex-col select-none items-end border-r border-slate-700 bg-[#0d1117] px-3 py-3 text-slate-500">
                                                <span>{result.line_number}</span>
                                            </div>
                                            {/* Code */}
                                            <pre className="flex-1 py-3 px-4 text-slate-300 whitespace-pre overflow-x-auto">
                                                {result.line_content}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Results count indicator */}
                        {!loading && !error && filteredResults.length > 0 && (
                            <div className="flex justify-center pb-8 pt-4">
                                <span className="text-sm text-slate-500">
                                    Showing {filteredResults.length} of {results.length} results
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};
