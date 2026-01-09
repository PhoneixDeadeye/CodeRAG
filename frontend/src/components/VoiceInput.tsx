import React, { useState, useCallback, useRef, useMemo } from 'react';

interface VoiceInputProps {
    onTranscript: (text: string) => void;
    disabled?: boolean;
}

// Type definition for SpeechRecognition
interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
    error: string;
}

interface SpeechRecognitionInstance {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
}

interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInstance;
}

// Check for browser support
const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
    if (typeof window === 'undefined') return null;
    const win = window as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
};

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const SpeechRecognition = useMemo(() => getSpeechRecognition(), []);
    const isSupported = !!SpeechRecognition;

    // Initialize recognition on first use
    const initRecognition = useCallback(() => {
        if (recognitionRef.current || !SpeechRecognition) return;

        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const text = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += text;
                } else {
                    interimTranscript += text;
                }
            }

            setTranscript(interimTranscript);

            if (finalTranscript) {
                onTranscript(finalTranscript);
                setTranscript('');
            }
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
        };
    }, [SpeechRecognition, onTranscript]);

    const toggleListening = useCallback(() => {
        initRecognition();
        if (!recognitionRef.current) return;

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
            setIsListening(true);
        }
    }, [isListening, initRecognition]);

    if (!isSupported) {
        return (
            <button
                disabled
                className="flex items-center justify-center size-9 rounded-lg text-text-secondary/50 cursor-not-allowed"
                title="Voice input not supported in this browser"
            >
                <span className="material-symbols-outlined text-[20px]">mic_off</span>
            </button>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={toggleListening}
                disabled={disabled}
                className={`flex items-center justify-center size-9 rounded-lg transition-all ${isListening
                    ? 'bg-red-500/20 text-red-400 animate-pulse'
                    : 'text-text-secondary hover:text-white hover:bg-border-dark'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isListening ? 'Stop listening' : 'Use Microphone'}
            >
                <span className="material-symbols-outlined text-[20px]">mic</span>
            </button>

            {/* Live transcript indicator */}
            {isListening && transcript && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-sidebar-dark border border-border-dark rounded-lg text-xs text-text-secondary whitespace-nowrap animate-fade-in">
                    <span className="material-symbols-outlined text-[12px] inline mr-2 animate-spin">progress_activity</span>
                    {transcript}
                </div>
            )}

            {/* Listening indicator */}
            {isListening && !transcript && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400 whitespace-nowrap animate-fade-in">
                    🎤 Listening...
                </div>
            )}
        </div>
    );
};
