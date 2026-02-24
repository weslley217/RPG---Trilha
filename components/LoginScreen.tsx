import React, { useState } from 'react';
import { User } from '../types';

interface LoginScreenProps {
    onLogin: (user: User) => void;
    onRegister: (username: string, password: string) => Promise<{ success: boolean, message: string }>;
    findUser: (username: string) => User | undefined;
    isLoading?: boolean;
    externalError?: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onRegister, findUser, isLoading = false, externalError }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (isLoading) {
            return;
        }

        if (isRegistering) {
            const result = await onRegister(username, password);
            if (!result.success) {
                setError(result.message);
            }
        } else {
            const user = findUser(username);
            if (user && user.password === password) {
                onLogin(user);
            } else {
                setError('Usuário ou senha inválidos.');
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-black">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-900 rounded-lg shadow-2xl border border-gray-700">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-green-400">Abominável Mundo Novo RPG</h1>
                    <p className="mt-2 text-gray-400">{isRegistering ? 'Crie sua conta para começar' : 'Entre para gerenciar sua ficha'}</p>
                </div>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="username" className="text-sm font-bold text-gray-400 block">Usuário</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={isLoading}
                            className="w-full p-3 mt-2 text-gray-200 bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 border border-gray-700"
                            placeholder="Nome de usuário"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="text-sm font-bold text-gray-400 block">Senha</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                            className="w-full p-3 mt-2 text-gray-200 bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 border border-gray-700"
                            placeholder="Sua senha"
                            required
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    {externalError && <p className="text-yellow-500 text-sm text-center">{externalError}</p>}
                    <button type="submit" disabled={isLoading} className="w-full py-3 font-bold text-white bg-green-600 rounded-md hover:bg-green-700 transition duration-300 disabled:bg-gray-700">
                        {isLoading ? 'Carregando...' : isRegistering ? 'Cadastrar' : 'Entrar'}
                    </button>
                </form>
                <div className="text-center">
                    <button disabled={isLoading} onClick={() => { setIsRegistering(!isRegistering); setError(''); }} className="text-sm text-green-400 hover:underline disabled:text-gray-500 disabled:no-underline">
                         {isRegistering ? 'Já tem uma conta? Entre agora' : 'Não tem uma conta? Cadastre-se'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
