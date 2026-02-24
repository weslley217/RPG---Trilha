
import React, { useState, useMemo, useEffect } from 'react';
import { User, Role } from './types';
import LoginScreen from './components/LoginScreen';
import PlayerView from './components/PlayerView';
import MasterView from './components/MasterView';
import { CharacterProvider, useCharacterContext } from './context/CharacterContext';
import { createNewCharacter } from './constants';
import { loadOrSeedUsers, registerUserInSupabase } from './services/supabaseStore';

const AppContent: React.FC = () => {
    const { dispatch: dispatchCharacter, isHydrated, syncError } = useCharacterContext();
    const [users, setUsers] = useState<User[]>([]);
    const [isUsersLoaded, setIsUsersLoaded] = useState(false);
    const [usersError, setUsersError] = useState<string | null>(null);

    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const savedUser = localStorage.getItem('currentUser');
        try {
            return savedUser ? JSON.parse(savedUser) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        let isCancelled = false;

        const loadUsers = async () => {
            try {
                const dbUsers = await loadOrSeedUsers();
                if (isCancelled) return;
                setUsers(dbUsers);
                setUsersError(null);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Falha ao carregar usuários no Supabase.';
                console.error(message);
                if (isCancelled) return;
                setUsers([]);
                setUsersError(message);
            } finally {
                if (!isCancelled) {
                    setIsUsersLoaded(true);
                }
            }
        };

        loadUsers();

        return () => {
            isCancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isUsersLoaded || !currentUser) return;
        const stillExists = users.some(user => user.id === currentUser.id);
        if (!stillExists) {
            setCurrentUser(null);
            localStorage.removeItem('currentUser');
        }
    }, [isUsersLoaded, users, currentUser]);
    
    const handleLogin = (user: User) => {
        setCurrentUser(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
    };

    const findUser = (username: string): User | undefined => {
        return users.find(u => u.username.toLowerCase() === username.toLowerCase());
    };
    
    const handleRegister = async (username: string, password: string): Promise<{ success: boolean, message: string }> => {
        if (findUser(username)) {
            return { success: false, message: 'Este nome de usuário já existe.' };
        }

        const newUser: User = { 
            id: `player_${Date.now()}`, 
            username, 
            password, 
            role: Role.PLAYER 
        };

        try {
            const createdUser = await registerUserInSupabase(newUser);
            const newCharacter = createNewCharacter(createdUser.id, createdUser.username);
            setUsers(prevUsers => [...prevUsers, createdUser]);
            dispatchCharacter({ type: 'ADD_CHARACTER', payload: newCharacter });
            handleLogin(createdUser);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao registrar usuário no Supabase.';
            return { success: false, message };
        }

        return { success: true, message: 'Cadastro realizado com sucesso!' };
    };

    const MainContent = useMemo(() => {
        if (!isHydrated || !isUsersLoaded) {
            return (
                <div className="min-h-screen bg-black text-gray-200 flex items-center justify-center p-6 text-center">
                    <div>
                        <h1 className="text-2xl font-bold text-green-400">Conectando ao Supabase</h1>
                        <p className="text-sm text-gray-400 mt-2">Carregando dados persistidos da campanha...</p>
                    </div>
                </div>
            );
        }

        if (!currentUser) {
            return (
                <LoginScreen
                    onLogin={handleLogin}
                    onRegister={handleRegister}
                    findUser={findUser}
                    isLoading={false}
                    externalError={usersError || syncError}
                />
            );
        }

        switch (currentUser.role) {
            case Role.PLAYER:
                return <PlayerView user={currentUser} onLogout={handleLogout} />;
            case Role.MASTER:
                return <MasterView user={currentUser} onLogout={handleLogout} />;
            default:
                return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} findUser={findUser} isLoading={false} externalError={usersError || syncError} />;
        }
    }, [currentUser, users, isHydrated, isUsersLoaded, usersError, syncError]);

    return (
        <div className="min-h-screen bg-black text-gray-200 font-sans">
            {MainContent}
        </div>
    );
};


const App: React.FC = () => {
    return (
        <CharacterProvider>
            <AppContent />
        </CharacterProvider>
    );
};

export default App;

