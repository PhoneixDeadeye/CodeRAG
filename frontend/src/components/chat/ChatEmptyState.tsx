import React from 'react';
import { Sparkles, Code, Zap, Layout, Cpu } from 'lucide-react';
import clsx from 'clsx';

interface ChatEmptyStateProps {
    onOptionClick: (text: string) => void;
}

export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({ onOptionClick }) => {
    const suggestions = [
        { icon: Code, text: 'Explain main entry point', desc: 'Architecture review', color: 'text-blue-400', bg: 'bg-blue-500/5' },
        { icon: Zap, text: 'Find potential bugs', desc: 'Performance & Security', color: 'text-amber-400', bg: 'bg-amber-500/5' },
        { icon: Layout, text: 'How does auth work?', desc: 'Security deep-dive', color: 'text-emerald-400', bg: 'bg-emerald-500/5' },
        { icon: Cpu, text: 'Suggest refactors', desc: 'Modern patterns', color: 'text-emerald-400', bg: 'bg-emerald-500/5' }
    ];

    return (
        <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in px-4 max-w-2xl mx-auto">
            {/* Hero Image / Icon */}
            <div className="relative mb-10 group">
                <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-[40px] animate-pulse group-hover:bg-primary/30 transition-colors" />
                <div className="relative bg-gradient-to-br from-[#1a1d26] to-[#0a0c10] border border-white/10 p-8 rounded-[2rem] shadow-2xl group-hover:border-primary/30 transition-all duration-500 scale-100 group-hover:scale-105">
                    <Sparkles className="w-16 h-16 text-primary shadow-primary/50" />
                </div>
            </div>

            <h3 className="text-3xl font-black mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-gray-500">
                Ready to analyze your code?
            </h3>
            <p className="text-text-secondary text-sm md:text-base max-w-md mb-12 leading-relaxed font-medium">
                I'm your AI technical architect. Ask me to explain complex logic, find architectural flaws, or suggest modern refactors.
            </p>

            {/* Suggestion Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {suggestions.map((suggestion, i) => (
                    <button
                        key={i}
                        onClick={() => onOptionClick(suggestion.text)}
                        className={clsx(
                            "group flex flex-col items-start p-5 rounded-2xl border border-white/5 hover:border-primary/30 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 relative overflow-hidden",
                            suggestion.bg
                        )}
                        aria-label={`Ask: ${suggestion.text}`}
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        <div className={clsx("p-2 rounded-lg mb-3 transition-colors", suggestion.bg, suggestion.color)}>
                            <suggestion.icon className="w-5 h-5" />
                        </div>
                        <span className="text-white font-bold text-sm mb-1">{suggestion.text}</span>
                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{suggestion.desc}</span>
                    </button>
                ))}
            </div>

            {/* Keyboard Hint */}
            <div className="mt-12 flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/5 text-[10px] font-bold text-text-muted uppercase tracking-widest animate-fade-in" style={{ animationDelay: '500ms' }}>
                Focus Chat
                <div className="flex gap-1">
                    <kbd className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10 font-mono">CTRL</kbd>
                    <kbd className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10 font-mono">K</kbd>
                </div>
            </div>
        </div>
    );
};
