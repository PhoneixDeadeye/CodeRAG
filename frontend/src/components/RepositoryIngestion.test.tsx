
// src/components/RepositoryIngestion.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RepositoryIngestion } from './RepositoryIngestion';
import { act } from 'react-dom/test-utils';

// Mock the API module
const mockListRepos = vi.fn();
const mockIngestRepo = vi.fn();

vi.mock('../lib/api', () => ({
    ingestRepo: (repoUrl: string, forceReindex?: boolean) => mockIngestRepo(repoUrl, forceReindex),
    getConfig: vi.fn().mockResolvedValue({ current_repo: null, is_guest: false }),
    listRepos: () => mockListRepos(),
}));

describe('RepositoryIngestion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListRepos.mockResolvedValue({ repos: [] });
    });

    it('renders url input', async () => {
        await act(async () => {
            render(<RepositoryIngestion />);
        });
        expect(screen.getByPlaceholderText(/https:\/\/github.com/i)).toBeInTheDocument();
    });

    it('updates input value', async () => {
        await act(async () => {
            render(<RepositoryIngestion />);
        });
        const input = screen.getByPlaceholderText(/https:\/\/github.com/i) as HTMLInputElement;

        fireEvent.change(input, { target: { value: 'https://github.com/test/repo' } });
        expect(input.value).toBe('https://github.com/test/repo');
    });
});
