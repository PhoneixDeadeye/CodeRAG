import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
} as unknown as typeof ResizeObserver;

// Mock matchMedia
globalThis.matchMedia = globalThis.matchMedia || function () {
    return {
        matches: false,
        media: '',
        onchange: null,
        addListener: function () { },
        removeListener: function () { },
        addEventListener: function () { },
        removeEventListener: function () { },
        dispatchEvent: function () { return false; },
    } as MediaQueryList;
};

// Mock SpeechRecognition
class MockSpeechRecognition {
    start() { }
    stop() { }
    abort() { }
    addEventListener() { }
    removeEventListener() { }
}

// Use bracket notation for dynamic global assignment to avoid TS index signature errors
(globalThis as Record<string, unknown>)['SpeechRecognition'] = MockSpeechRecognition;
(globalThis as Record<string, unknown>)['webkitSpeechRecognition'] = MockSpeechRecognition;

// Mock Clipboard
Object.assign(navigator, {
    clipboard: {
        writeText: vi.fn(),
    },
});
