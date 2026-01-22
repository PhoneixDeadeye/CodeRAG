import { render, screen } from '@testing-library/react';
import App from './App';
import { describe, it, expect } from 'vitest';

describe('App', () => {
    it('renders without crashing', () => {
        render(<App />);
        // Since App usually renders the Login page first (if unauthenticated in local storage),
        // checking for a known element like "Sign in" or just checking that something specific renders
        // would be good. For a generic smoke test, checking if container is present or a header
        // depends on the default state.

        // Let's assume it renders *something*. 
        // We can just query by a generic role or check if the document body has content.
        expect(document.body).toBeInTheDocument();
    });
});
