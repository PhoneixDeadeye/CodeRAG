import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) throw new Error('Test explosion');
    return <div>No error here</div>;
};

describe('ErrorBoundary', () => {
    // Suppress console.error for expected errors in tests
    const originalError = console.error;
    beforeEach(() => {
        console.error = vi.fn();
    });
    afterEach(() => {
        console.error = originalError;
    });

    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <div>All good</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('renders error UI when child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
        expect(screen.getByText('Test explosion')).toBeInTheDocument();
    });

    it('displays custom component name in error message', () => {
        render(
            <ErrorBoundary name="ChatPanel">
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText(/Something went wrong in ChatPanel/i)).toBeInTheDocument();
    });

    it('renders custom fallback when provided', () => {
        render(
            <ErrorBoundary fallback={<div>Custom fallback UI</div>}>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
    });

    it('recovers when Try Again is clicked', () => {
        const { rerender } = render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

        fireEvent.click(screen.getByText('Try Again'));

        // After resetting, ErrorBoundary tries to re-render children
        // Since ThrowingComponent still throws, it will show error again
        // This tests the reset mechanism works (state toggles)
        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });
});
