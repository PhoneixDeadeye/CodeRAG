import React, { useState, useEffect } from 'react';

interface WelcomeModalProps {
    onClose: () => void;
}

const STORAGE_KEY = 'coderag_welcome_shown';

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ onClose }) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const features = [
        {
            icon: 'smart_toy',
            title: 'AI-Powered Code Assistant',
            description: 'Ask questions about your codebase and get intelligent answers backed by context from your actual code.',
            gradient: 'from-blue-500 to-cyan-500',
        },
        {
            icon: 'hub',
            title: 'Dependency Visualization',
            description: 'Explore file relationships with interactive dependency graphs. See imports and dependants at a glance.',
            gradient: 'from-emerald-500 to-teal-500',
        },
        {
            icon: 'search',
            title: 'Semantic Code Search',
            description: 'Search your codebase using natural language. Find exactly what you need without knowing the exact syntax.',
            gradient: 'from-emerald-500 to-teal-500',
        },
        {
            icon: 'folder_open',
            title: 'Repository Management',
            description: 'Ingest multiple repositories and switch between them seamlessly. All your code in one place.',
            gradient: 'from-amber-500 to-orange-500',
        },
    ];

    const handleClose = () => {
        if (dontShowAgain) {
            localStorage.setItem(STORAGE_KEY, 'true');
        }
        onClose();
    };

    const handleNext = () => {
        if (currentSlide < features.length - 1) {
            setCurrentSlide(prev => prev + 1);
        } else {
            handleClose();
        }
    };

    const handlePrev = () => {
        if (currentSlide > 0) {
            setCurrentSlide(prev => prev - 1);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 animate-fade-in"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-bg-base border-2 border-primary shadow-[8px_8px_0px_0px_#CCFF00] animate-scale-in">
                {/* Header decoration */}
                <div className="absolute top-0 inset-x-0 h-1 bg-primary" />

                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-white hover:bg-white/10 transition-colors z-10 rounded-none border border-transparent hover:border-white"
                >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>

                {/* Content */}
                <div className="p-8 pt-10">
                    {/* Logo */}
                    <div className="flex items-center justify-center mb-8">
                        <div className="flex items-center gap-4">
                            <div className="size-12 bg-primary flex items-center justify-center border border-primary shadow-[4px_4px_0px_0px_white]">
                                <span className="material-symbols-outlined text-black text-2xl">terminal</span>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white font-display uppercase tracking-tighter">CodeRAG_OS</h2>
                                <p className="text-xs text-primary font-mono uppercase tracking-widest">v2.0 • SYSTEM_ONLINE</p>
                            </div>
                        </div>
                    </div>

                    {/* Feature Card */}
                    <div className="relative overflow-hidden border border-border-default bg-bg-surface p-1">
                        <div
                            className="flex transition-transform duration-300 ease-out"
                            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                        >
                            {features.map((feature, index) => (
                                <div
                                    key={index}
                                    className="w-full flex-shrink-0 px-2 py-4"
                                >
                                    <div className="text-center space-y-4">
                                        <div className="inline-flex p-3 bg-black border border-primary shadow-[4px_4px_0px_0px_rgba(204,255,0,0.5)]">
                                            <span className="material-symbols-outlined text-primary text-3xl">
                                                {feature.icon}
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white uppercase font-mono mb-2">
                                                {feature.title}
                                            </h3>
                                            <p className="text-sm text-text-secondary leading-relaxed font-mono px-4">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Dots indicator */}
                    <div className="flex items-center justify-center gap-2 mt-6">
                        {features.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentSlide(index)}
                                className={`h-1.5 transition-all duration-300 rounded-none ${currentSlide === index
                                    ? 'w-8 bg-primary'
                                    : 'w-2 bg-border-default hover:bg-white'
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="mt-8 flex items-center justify-between border-t border-border-default pt-6">
                        <label className="flex items-center gap-2 cursor-pointer select-none group">
                            <div className={`w-4 h-4 border border-border-default flex items-center justify-center transition-colors ${dontShowAgain ? 'bg-primary border-primary' : 'bg-black group-hover:border-white'}`}>
                                {dontShowAgain && <span className="material-symbols-outlined text-black text-[10px] font-bold">check</span>}
                            </div>
                            <input
                                type="checkbox"
                                checked={dontShowAgain}
                                onChange={(e) => setDontShowAgain(e.target.checked)}
                                className="hidden"
                            />
                            <span className="text-xs text-text-secondary font-mono uppercase group-hover:text-white transition-colors">DONT_SHOW_AGAIN</span>
                        </label>

                        <div className="flex items-center gap-3">
                            {currentSlide > 0 && (
                                <button
                                    onClick={handlePrev}
                                    className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-white transition-colors font-mono uppercase"
                                >
                                    [BACK]
                                </button>
                            )}
                            <button
                                onClick={handleNext}
                                className="px-6 py-2.5 bg-primary text-black text-sm font-bold shadow-[4px_4px_0px_0px_white] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all rounded-none uppercase font-mono border border-transparent hover:border-white"
                            >
                                {currentSlide === features.length - 1 ? 'INITIALIZE_SYSTEM' : 'NEXT_MODULE'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Hook to check if welcome should be shown
export const useWelcomeModal = () => {
    const [showWelcome, setShowWelcome] = useState(false);

    useEffect(() => {
        const hasSeenWelcome = localStorage.getItem(STORAGE_KEY);
        if (!hasSeenWelcome) {
            // Small delay to let the app load first
            const timer = setTimeout(() => setShowWelcome(true), 500);
            return () => clearTimeout(timer);
        }
    }, []);

    const closeWelcome = () => setShowWelcome(false);

    // Reset function for testing
    const resetWelcome = () => {
        localStorage.removeItem(STORAGE_KEY);
        setShowWelcome(true);
    };

    return { showWelcome, closeWelcome, resetWelcome };
};

export default WelcomeModal;
