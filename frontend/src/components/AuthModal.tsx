/**
 * AuthModal - Non-blocking authentication modal
 * 
 * A slide-in modal for login/register that doesn't block the user
 * from using the app. Triggered by persistence-related actions.
 */
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContextCore';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultTab?: 'login' | 'register';
    message?: string;
}

export function AuthModal({ isOpen, onClose, defaultTab = 'login', message }: AuthModalProps) {
    const { login, register } = useAuth();
    const { showToast } = useToast();

    const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultTab);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (activeTab === 'register') {
                if (password !== confirmPassword) {
                    setError('Passwords do not match');
                    setIsLoading(false);
                    return;
                }
                if (password.length < 6) {
                    setError('Password must be at least 6 characters');
                    setIsLoading(false);
                    return;
                }
                await register(email, password);
                showToast('Account created! Your session data has been saved.', 'success');
            } else {
                await login(email, password);
                showToast('Welcome back! Your session data has been saved.', 'success');
            }
            onClose();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="auth-modal-backdrop"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="auth-modal">
                <div className="auth-modal-header">
                    <h2>{activeTab === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
                    <button className="auth-modal-close" onClick={onClose}>
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                {message && (
                    <div className="auth-modal-message">
                        <span className="material-symbols-rounded">info</span>
                        {message}
                    </div>
                )}

                <div className="auth-modal-guest-notice">
                    <span className="material-symbols-rounded">cloud_off</span>
                    <span>You're in guest mode. Log in to save your work.</span>
                </div>

                {/* Tabs */}
                <div className="auth-modal-tabs">
                    <button
                        className={activeTab === 'login' ? 'active' : ''}
                        onClick={() => { setActiveTab('login'); setError(''); }}
                    >
                        Sign In
                    </button>
                    <button
                        className={activeTab === 'register' ? 'active' : ''}
                        onClick={() => { setActiveTab('register'); setError(''); }}
                    >
                        Create Account
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="auth-modal-error">
                            <span className="material-symbols-rounded">error</span>
                            {error}
                        </div>
                    )}

                    <div className="auth-modal-field">
                        <label htmlFor="auth-email">Email</label>
                        <input
                            id="auth-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="auth-modal-field">
                        <label htmlFor="auth-password">Password</label>
                        <input
                            id="auth-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                        />
                    </div>

                    {activeTab === 'register' && (
                        <div className="auth-modal-field">
                            <label htmlFor="auth-confirm">Confirm Password</label>
                            <input
                                id="auth-confirm"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className="auth-modal-submit"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="auth-modal-loading">
                                <span className="spinner"></span>
                                {activeTab === 'login' ? 'Signing in...' : 'Creating account...'}
                            </span>
                        ) : (
                            activeTab === 'login' ? 'Sign In' : 'Create Account'
                        )}
                    </button>
                </form>

                <div className="auth-modal-skip-notice">
                    <span className="material-symbols-rounded">info</span>
                    <span>Authentication is required for this action</span>
                </div>
            </div>

            <style>{`
                .auth-modal-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    z-index: 999;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .auth-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--surface-primary, #1e1e2e);
                    border: 1px solid var(--border-color, #313244);
                    border-radius: 16px;
                    width: 100%;
                    max-width: 400px;
                    padding: 24px;
                    z-index: 1000;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    animation: slideIn 0.3s ease-out;
                }

                @keyframes slideIn {
                    from { 
                        opacity: 0;
                        transform: translate(-50%, -48%);
                    }
                    to { 
                        opacity: 1;
                        transform: translate(-50%, -50%);
                    }
                }

                .auth-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }

                .auth-modal-header h2 {
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: var(--text-primary, #cdd6f4);
                    margin: 0;
                }

                .auth-modal-close {
                    background: transparent;
                    border: none;
                    color: var(--text-secondary, #a6adc8);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                }

                .auth-modal-close:hover {
                    background: var(--surface-secondary, #313244);
                    color: var(--text-primary, #cdd6f4);
                }

                .auth-modal-message {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px;
                    background: var(--accent-blue, #89b4fa)15;
                    border: 1px solid var(--accent-blue, #89b4fa)40;
                    border-radius: 8px;
                    color: var(--accent-blue, #89b4fa);
                    font-size: 0.875rem;
                    margin-bottom: 16px;
                }

                .auth-modal-guest-notice {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px;
                    background: var(--accent-yellow, #f9e2af)15;
                    border: 1px solid var(--accent-yellow, #f9e2af)30;
                    border-radius: 8px;
                    color: var(--accent-yellow, #f9e2af);
                    font-size: 0.875rem;
                    margin-bottom: 20px;
                }

                .auth-modal-tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 20px;
                }

                .auth-modal-tabs button {
                    flex: 1;
                    padding: 10px;
                    background: var(--surface-secondary, #313244);
                    border: 1px solid var(--border-color, #45475a);
                    border-radius: 8px;
                    color: var(--text-secondary, #a6adc8);
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .auth-modal-tabs button:hover {
                    background: var(--surface-hover, #45475a);
                }

                .auth-modal-tabs button.active {
                    background: var(--accent-purple, #cba6f7);
                    border-color: var(--accent-purple, #cba6f7);
                    color: var(--surface-primary, #1e1e2e);
                }

                .auth-modal-error {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px;
                    background: var(--accent-red, #f38ba8)15;
                    border: 1px solid var(--accent-red, #f38ba8)40;
                    border-radius: 8px;
                    color: var(--accent-red, #f38ba8);
                    font-size: 0.875rem;
                    margin-bottom: 16px;
                }

                .auth-modal-field {
                    margin-bottom: 16px;
                }

                .auth-modal-field label {
                    display: block;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--text-secondary, #a6adc8);
                    margin-bottom: 6px;
                }

                .auth-modal-field input {
                    width: 100%;
                    padding: 12px;
                    background: var(--surface-secondary, #313244);
                    border: 1px solid var(--border-color, #45475a);
                    border-radius: 8px;
                    color: var(--text-primary, #cdd6f4);
                    font-size: 1rem;
                    transition: border-color 0.2s ease;
                }

                .auth-modal-field input:focus {
                    outline: none;
                    border-color: var(--accent-purple, #cba6f7);
                }

                .auth-modal-field input::placeholder {
                    color: var(--text-tertiary, #6c7086);
                }

                .auth-modal-submit {
                    width: 100%;
                    padding: 14px;
                    background: var(--accent-purple, #cba6f7);
                    border: none;
                    border-radius: 8px;
                    color: var(--surface-primary, #1e1e2e);
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-top: 8px;
                }

                .auth-modal-submit:hover:not(:disabled) {
                    background: var(--accent-purple-hover, #b4befe);
                    transform: translateY(-1px);
                }

                .auth-modal-submit:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                .auth-modal-loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .auth-modal-loading .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--surface-primary, #1e1e2e);
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .auth-modal-skip-notice {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    background: transparent;
                    color: var(--text-secondary, #a6adc8);
                    font-size: 0.875rem;
                    margin-top: 12px;
                    text-align: center;
                }
            `}</style>
        </>
    );
}
