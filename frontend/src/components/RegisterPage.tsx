import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function RegisterPage({ onLoginClick }: { onLoginClick: () => void }) {
    const { register } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            return setError("Passwords do not match");
        }
        setError('');
        setLoading(true);
        try {
            await register(email, password);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to register');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0E1117] text-gray-200">
            <div className="w-full max-w-md p-8 bg-[#161B22] rounded-lg shadow-xl border border-gray-800">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-2">
                        <span className="material-symbols-outlined text-white text-2xl">person_add</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Create Account</h2>
                    <p className="text-gray-400">Join CodeRAG today</p>
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
                            minLength={6}
                            className="w-full px-3 py-2 bg-[#0D1117] border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-white"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Confirm Password</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            className="w-full px-3 py-2 bg-[#0D1117] border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-white"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Creating account...' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <span className="text-gray-500">Already have an account? </span>
                    <button onClick={onLoginClick} className="text-blue-400 hover:text-blue-300">
                        Sign in
                    </button>
                </div>
            </div>
        </div>
    );
}
