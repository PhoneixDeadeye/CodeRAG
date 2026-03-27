import React from 'react';
import { Settings, User as UserIcon, LogOut } from 'lucide-react';
import { ConnectionStatus } from '../ConnectionStatus';
import type { User } from '../../contexts/AuthContext'; // Adjust path

interface UserProfileProps {
    user: User | null;
    isGuest: boolean;
    logout: () => void;
    onShowVoice?: () => void;
    onShowAuth: () => void;
    onMobileClose: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
    user,
    isGuest,
    logout,
    onShowVoice,
    onShowAuth,
    onMobileClose
}) => {

    const handleAction = (action: () => void) => {
        action();
        if (window.innerWidth < 768) onMobileClose();
    };

    return (
        <div className="p-4 border-t border-border-default mt-auto bg-bg-dark">
            <div className="flex flex-col gap-1">
                <button
                    onClick={() => handleAction(() => onShowVoice?.())}
                    className="flex items-center gap-3 px-3 py-2.5 text-text-secondary hover:text-black hover:bg-primary rounded-none transition-all active:translate-x-1 w-full text-left group border border-transparent hover:border-primary font-mono text-sm"
                >
                    <Settings className="w-4 h-4 text-text-muted group-hover:text-black transition-colors" />
                    <span className="font-medium">SYSTEM_SETTINGS</span>
                </button>

                {isGuest ? (
                    <button
                        onClick={() => handleAction(onShowAuth)}
                        className="flex items-center gap-3 px-3 py-2.5 group cursor-pointer hover:bg-white/5 rounded-none transition-all w-full text-left border border-border-default hover:border-primary bg-bg-elevated mt-2"
                    >
                        <div className="size-8 rounded-none border border-border-default flex items-center justify-center bg-black group-hover:bg-primary group-hover:text-black transition-colors">
                            <UserIcon className="w-4 h-4 text-text-secondary group-hover:text-black" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-white font-mono uppercase">GUEST_USER</span>
                            <span className="text-[10px] text-primary font-mono">AUTH_REQUIRED</span>
                        </div>
                    </button>
                ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-bg-elevated border border-transparent hover:border-border-default transition-all mt-2">
                        <div className="size-8 bg-primary flex items-center justify-center font-bold text-black border border-white text-xs font-mono">
                            {user?.email?.substring(0, 2).toUpperCase() || 'DV'}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-xs font-bold truncate text-white font-mono uppercase">
                                {user?.email || 'DEVELOPER'}
                            </span>
                            <span className="text-[10px] text-primary font-mono tracking-wider">ACCESS_GRANTED</span>
                        </div>
                        <button
                            onClick={logout}
                            className="text-text-secondary hover:text-red-500 p-2 rounded-none hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-500"
                            title="LOGOUT"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Connection Status */}
                <div className="mt-2 pt-3 border-t border-border-subtle flex justify-center">
                    <ConnectionStatus className="w-full font-mono text-xs" />
                </div>
            </div>
        </div>
    );
};
