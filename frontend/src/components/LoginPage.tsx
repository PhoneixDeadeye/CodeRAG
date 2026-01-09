import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage({ onRegisterClick }: { onRegisterClick: () => void }) {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0E1117] text-gray-200">
            <div className="w-full max-w-md p-8 bg-[#161B22] rounded-lg shadow-xl border border-gray-800">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-2">
                        <span className="material-symbols-outlined text-white text-2xl">code</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Welcome back</h2>
                    <p className="text-gray-400">Sign in to CodeRAG</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-300 rounded text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            className="w-full px-3 py-2 bg-[#0D1117] border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-white"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full px-3 py-2 bg-[#0D1117] border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-white"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <span className="text-gray-500">Don't have an account? </span>
                    <button onClick={onRegisterClick} className="text-blue-400 hover:text-blue-300">
                        Sign up
                    </button>
                </div>
            </div>
        </div>
    );
}
