import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Extend global types for test environment
declare global {
    // eslint-disable-next-line no-var
    var ResizeObserver: typeof ResizeObserver;
    // eslint-disable-next-line no-var
    var matchMedia: typeof window.matchMedia;
    // eslint-disable-next-line no-var
    var SpeechRecognition: new () => SpeechRecognition;
    // eslint-disable-next-line no-var
    var webkitSpeechRecognition: new () => SpeechRecognition;
}

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
globalThis.SpeechRecognition = MockSpeechRecognition as unknown as new () => SpeechRecognition;
globalThis.webkitSpeechRecognition = globalThis.SpeechRecognition;

// Mock Clipboard
Object.assign(navigator, {
    clipboard: {
        writeText: vi.fn(),
    },
});
