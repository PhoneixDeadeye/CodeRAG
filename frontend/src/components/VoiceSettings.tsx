import React, { useState } from 'react';

interface VoiceSettingsProps {
    onClose?: () => void;
    onSave?: (settings: VoiceConfig) => void;
}

interface VoiceConfig {
    enabled: boolean;
    microphoneSource: string;
    sensitivity: number;
    language: string;
    autoDetect: boolean;
    processingMode: 'local' | 'cloud';
    helpImprove: boolean;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
    onClose,
    onSave,
}) => {
    const [settings, setSettings] = useState<VoiceConfig>({
        enabled: true,
        microphoneSource: 'default',
        sensitivity: 75,
        language: 'en-US',
        autoDetect: false,
        processingMode: 'local',
        helpImprove: false,
    });

    // Load with effect
    React.useEffect(() => {
        const saved = localStorage.getItem('coderag_voice_settings');
        if (saved) {
            try {
                setSettings(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse voice settings", e);
            }
        }
    }, []);

    const updateSetting = <K extends keyof VoiceConfig>(key: K, value: VoiceConfig[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        localStorage.setItem('coderag_voice_settings', JSON.stringify(settings));
        onSave?.(settings);
        if (onClose) onClose(); // Auto close on save for better UX
    };

    const handleReset = () => {
        setSettings({
            enabled: true,
            microphoneSource: 'default',
            sensitivity: 75,
            language: 'en-US',
            autoDetect: false,
            processingMode: 'local',
            helpImprove: false,
        });
    };

    return (
        <div className="flex h-full bg-background-dark">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r border-border-dark bg-background-dark hidden md:flex flex-col">
                <div className="p-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-xl">terminal</span>
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white">CodeRAG</span>
                    </div>
                </div>
                <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
                    <div className="text-[#92a4c9] text-xs font-bold uppercase tracking-wider px-3 mb-2 mt-4">User Configuration</div>
                    <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#92a4c9] hover:bg-[#192233] hover:text-white transition-colors group" href="#">
                        <span className="material-symbols-outlined">settings</span>
                        <span className="text-sm font-medium">General</span>
                    </a>
                    <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#92a4c9] hover:bg-[#192233] hover:text-white transition-colors group" href="#">
                        <span className="material-symbols-outlined">person</span>
                        <span className="text-sm font-medium">Account</span>
                    </a>
                    <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20" href="#">
                        <span className="material-symbols-outlined">mic</span>
                        <span className="text-sm font-medium">Voice Input</span>
                    </a>
                    <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#92a4c9] hover:bg-[#192233] hover:text-white transition-colors group" href="#">
                        <span className="material-symbols-outlined">extension</span>
                        <span className="text-sm font-medium">Integrations</span>
                    </a>
                    <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#92a4c9] hover:bg-[#192233] hover:text-white transition-colors group" href="#">
                        <span className="material-symbols-outlined">palette</span>
                        <span className="text-sm font-medium">Appearance</span>
                    </a>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[1000px] mx-auto w-full p-6 md:p-12 pb-32">
                        {/* Page Header */}
                        <div className="flex flex-col gap-3 mb-10">
                            <div className="flex items-center justify-between">
                                <h1 className="text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">Voice Input Settings</h1>
                                {onClose && (
                                    <button
                                        onClick={onClose}
                                        className="p-2 rounded-lg hover:bg-border-dark text-[#92a4c9] hover:text-white transition-colors"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                )}
                            </div>
                            <p className="text-[#92a4c9] text-base md:text-lg font-normal leading-relaxed max-w-3xl">
                                Configure how the AI listens to your queries. Adjust microphone sensitivity, manage privacy preferences, and choose between local or cloud processing.
                            </p>
                        </div>

                        {/* Master Toggle Panel */}
                        <div className="mb-10">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-xl border border-primary/30 bg-primary/5 p-6 shadow-lg shadow-black/20">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">graphic_eq</span>
                                        <h2 className="text-white text-lg font-bold leading-tight">Enable Voice Input</h2>
                                    </div>
                                    <p className="text-[#92a4c9] text-sm md:text-base font-normal leading-normal">
                                        Master switch to enable speech-to-text functionality across the application.
                                    </p>
                                </div>
                                <label className="relative flex h-[32px] w-[56px] cursor-pointer items-center rounded-full bg-[#192233] p-1 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={settings.enabled}
                                        onChange={(e) => updateSetting('enabled', e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${settings.enabled ? 'translate-x-6 bg-primary' : ''}`}></div>
                                    <div className={`absolute inset-0 rounded-full transition-colors ${settings.enabled ? 'bg-primary' : 'bg-[#192233]'}`} style={{ zIndex: -1 }}></div>
                                </label>
                            </div>
                        </div>

                        <form className="space-y-10">
                            {/* Device Management Section */}
                            <section>
                                <h3 className="text-white text-xl font-bold leading-tight tracking-tight border-b border-border-dark pb-4 mb-6">Device Management</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Microphone Source */}
                                    <div className="flex flex-col gap-3">
                                        <label className="text-white text-sm font-medium uppercase tracking-wider opacity-80">Microphone Source</label>
                                        <div className="relative">
                                            <select
                                                value={settings.microphoneSource}
                                                onChange={(e) => updateSetting('microphoneSource', e.target.value)}
                                                className="w-full appearance-none rounded-lg border border-border-dark bg-[#192233] px-4 py-3.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                                            >
                                                <option value="default">Default - System Microphone</option>
                                                <option value="external">Blue Yeti Stereo Microphone</option>
                                                <option value="airpods">AirPods Pro</option>
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#92a4c9]">
                                                <span className="material-symbols-outlined">expand_more</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-[#92a4c9]">Select the input device you want the AI to listen to.</p>
                                    </div>

                                    {/* Input Level Visualizer */}
                                    <div className="flex flex-col gap-3">
                                        <div className="flex justify-between items-center">
                                            <label className="text-white text-sm font-medium uppercase tracking-wider opacity-80">Input Level</label>
                                            <span className="text-xs text-primary font-mono">LIVE</span>
                                        </div>
                                        <div className="h-[52px] w-full rounded-lg bg-[#192233] border border-border-dark flex items-center justify-center gap-1 px-4 overflow-hidden">
                                            {/* Visualizer Bars */}
                                            {[3, 5, 8, 4, 6, 10, 7, 4, 3, 6, 4, 8, 5, 3, 4, 2].map((height, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-1.5 rounded-full transition-all ${height > 6 ? 'bg-primary animate-pulse' : height > 4 ? 'bg-primary/60' : 'bg-[#324467]'}`}
                                                    style={{ height: `${height * 4}px` }}
                                                />
                                            ))}
                                        </div>
                                        <p className="text-xs text-[#92a4c9]">Speak to test your microphone levels.</p>
                                    </div>
                                </div>

                                {/* Sensitivity Slider */}
                                <div className="mt-8">
                                    <div className="flex justify-between mb-2">
                                        <label className="text-white text-sm font-medium">Input Sensitivity</label>
                                        <span className="text-white text-sm font-mono">{settings.sensitivity}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={settings.sensitivity}
                                        onChange={(e) => updateSetting('sensitivity', parseInt(e.target.value))}
                                        className="w-full h-2 bg-[#192233] rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                    <div className="flex justify-between mt-2 text-xs text-[#92a4c9]">
                                        <span>Low (Pick up everything)</span>
                                        <span>High (Reduce background noise)</span>
                                    </div>
                                </div>
                            </section>

                            {/* Recognition Configuration */}
                            <section>
                                <h3 className="text-white text-xl font-bold leading-tight tracking-tight border-b border-border-dark pb-4 mb-6">Recognition Settings</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    {/* Language */}
                                    <div className="flex flex-col gap-3">
                                        <label className="text-white text-sm font-medium uppercase tracking-wider opacity-80">Spoken Language</label>
                                        <div className="relative">
                                            <select
                                                value={settings.language}
                                                onChange={(e) => updateSetting('language', e.target.value)}
                                                className="w-full appearance-none rounded-lg border border-border-dark bg-[#192233] px-4 py-3.5 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                                            >
                                                <option value="en-US">English (United States)</option>
                                                <option value="en-UK">English (United Kingdom)</option>
                                                <option value="es-ES">Spanish (Spain)</option>
                                                <option value="fr-FR">French (France)</option>
                                                <option value="de-DE">German (Germany)</option>
                                                <option value="ja-JP">Japanese</option>
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#92a4c9]">
                                                <span className="material-symbols-outlined">translate</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Auto Detect Checkbox */}
                                    <div className="flex flex-col gap-3 md:mt-8">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.autoDetect}
                                                    onChange={(e) => updateSetting('autoDetect', e.target.checked)}
                                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-border-dark bg-[#192233] checked:border-primary checked:bg-primary transition-all"
                                                />
                                                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                                                    <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                                                </span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-white text-sm font-medium group-hover:text-primary transition-colors">Auto-detect language</span>
                                                <span className="text-[#92a4c9] text-xs leading-relaxed mt-1">
                                                    Automatically switch language models based on spoken input. May increase latency.
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </section>

                            {/* Privacy & Processing */}
                            <section>
                                <h3 className="text-white text-xl font-bold leading-tight tracking-tight border-b border-border-dark pb-4 mb-6">Privacy &amp; Processing</h3>
                                <div className="space-y-6">
                                    <label className="text-white text-sm font-medium uppercase tracking-wider opacity-80">Processing Mode</label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Local Processing Card */}
                                        <label
                                            className={`relative flex cursor-pointer rounded-xl border p-4 shadow-sm transition-all ${settings.processingMode === 'local'
                                                ? 'border-primary ring-1 ring-primary bg-primary/5'
                                                : 'border-border-dark bg-[#192233]'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="processing-mode"
                                                value="local"
                                                checked={settings.processingMode === 'local'}
                                                onChange={() => updateSetting('processingMode', 'local')}
                                                className="sr-only"
                                            />
                                            <div className="flex w-full gap-4">
                                                <div className="mt-1 shrink-0 text-[#92a4c9]">
                                                    <span className="material-symbols-outlined text-2xl">memory</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="block text-sm font-bold text-white">Local Processing</span>
                                                    <span className="mt-1 flex items-center text-xs text-[#92a4c9]">
                                                        <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                                                        Private &amp; Fast
                                                    </span>
                                                    <span className="mt-2 text-xs text-[#92a4c9] leading-relaxed">
                                                        Voice data is processed entirely on your device. Data never leaves your machine.
                                                    </span>
                                                </div>
                                            </div>
                                        </label>

                                        {/* Cloud Processing Card */}
                                        <label
                                            className={`relative flex cursor-pointer rounded-xl border p-4 shadow-sm transition-all ${settings.processingMode === 'cloud'
                                                ? 'border-primary ring-1 ring-primary bg-primary/5'
                                                : 'border-border-dark bg-[#192233]'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="processing-mode"
                                                value="cloud"
                                                checked={settings.processingMode === 'cloud'}
                                                onChange={() => updateSetting('processingMode', 'cloud')}
                                                className="sr-only"
                                            />
                                            <div className="flex w-full gap-4">
                                                <div className="mt-1 shrink-0 text-[#92a4c9]">
                                                    <span className="material-symbols-outlined text-2xl">cloud_sync</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="block text-sm font-bold text-white">Cloud Processing</span>
                                                    <span className="mt-1 flex items-center text-xs text-[#92a4c9]">
                                                        <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                                                        High Accuracy
                                                    </span>
                                                    <span className="mt-2 text-xs text-[#92a4c9] leading-relaxed">
                                                        Audio is sent to secure servers for processing with larger, more accurate models.
                                                    </span>
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Data Retention Toggle */}
                                    <div className="flex items-center justify-between border-t border-border-dark pt-6 mt-6">
                                        <div className="flex flex-col gap-1 pr-4">
                                            <span className="text-white text-sm font-medium">Help improve voice recognition</span>
                                            <span className="text-[#92a4c9] text-xs leading-normal">
                                                Allow anonymized voice snippets to be used to train our models.
                                            </span>
                                        </div>
                                        <label className="relative flex h-[24px] w-[44px] cursor-pointer items-center rounded-full p-1 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={settings.helpImprove}
                                                onChange={(e) => updateSetting('helpImprove', e.target.checked)}
                                                className="peer sr-only"
                                            />
                                            <div className={`absolute inset-0 rounded-full transition-colors ${settings.helpImprove ? 'bg-primary' : 'bg-[#192233]'}`}></div>
                                            <div className={`relative h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.helpImprove ? 'translate-x-5' : ''}`}></div>
                                        </label>
                                    </div>
                                </div>
                            </section>
                        </form>
                    </div>
                </div>

                {/* Sticky Action Bar */}
                <div className="sticky bottom-0 z-10 border-t border-border-dark bg-background-dark/95 backdrop-blur px-6 py-4 md:px-12">
                    <div className="max-w-[1000px] mx-auto w-full flex items-center justify-end gap-4">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white hover:bg-[#192233] transition-colors border border-transparent hover:border-border-dark"
                        >
                            Reset Defaults
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-blue-600 transition-colors shadow-lg shadow-blue-900/20"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};
