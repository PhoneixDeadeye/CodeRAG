// src/components/FileExplorer.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { act } from 'react';

// Mock API
vi.mock('../lib/api', () => ({
    getFileTree: vi.fn(),
    getFileContent: vi.fn(),
}));

// Mock Hooks
vi.mock('../hooks/usePinnedFiles', () => ({
    usePinnedFiles: () => ({
        pinnedFiles: [],
        togglePin: vi.fn(),
        isPinned: vi.fn().mockReturnValue(false)
    })
}));

vi.mock('../hooks/useRecentFiles', () => ({
    useRecentFiles: () => ({
        recentFiles: [],
        addRecentFile: vi.fn()
    })
}));

// Import the mocked module
import * as api from '../lib/api';

// Mock API response
const mockTree = [
    {
        name: 'src',
        path: 'src',
        type: 'directory' as const,
        children: [
            { name: 'App.tsx', path: 'src/App.tsx', type: 'file' as const }
        ]
    }
];

describe('FileExplorer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders file tree after loading', async () => {
        vi.mocked(api.getFileTree).mockResolvedValue({
            tree: mockTree,
            repo_url: 'https://github.com/test/repo'
        });

        await act(async () => {
            render(
                <FileExplorer
                    onFileSelect={() => { }}
                    onExplainFile={() => { }}
                    repoId="test-repo"
                />
            );
        });

        // Wait for loading to complete and tree to render
        await waitFor(() => {
            expect(screen.getByText('src')).toBeInTheDocument();
        });

        // The nested file should also be visible (folder auto-expands at depth < 2)
        expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    it('shows empty state when no files', async () => {
        vi.mocked(api.getFileTree).mockResolvedValue({
            tree: [],
            repo_url: null
        });

        await act(async () => {
            render(
                <FileExplorer
                    onFileSelect={() => { }}
                    onExplainFile={() => { }}
                    repoId="test-repo"
                />
            );
        });

        await waitFor(() => {
            expect(screen.getByText('No files indexed yet')).toBeInTheDocument();
        });
    });

    it('shows error state on API failure', async () => {
        vi.mocked(api.getFileTree).mockRejectedValue({
            response: { data: { detail: 'Repository not found' } }
        });

        await act(async () => {
            render(
                <FileExplorer
                    onFileSelect={() => { }}
                    onExplainFile={() => { }}
                    repoId="test-repo"
                />
            );
        });

        await waitFor(() => {
            expect(screen.getByText('Repository not found')).toBeInTheDocument();
        });
    });
});
