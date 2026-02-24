import React, { useMemo, useRef, useState } from 'react';
import { BestiaryMonster, BestiaryPlayerNote, Character, Role, User } from '../types';
import { useCharacterContext } from '../context/CharacterContext';
import { uploadMonsterImage } from '../services/imageUpload';

interface BestiaryViewProps {
    user: User;
    onBack: () => void;
}

const ANTIQUE_TEXT_STYLE: React.CSSProperties = {
    fontFamily: '"Palatino Linotype", "Book Antiqua", Garamond, serif',
    fontStyle: 'italic',
    letterSpacing: '0.02em',
};

const NOTE_COLORS = ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#67e8f9', '#93c5fd', '#c4b5fd', '#f9a8d4'];

const getCharacterColor = (characterId: string): string => {
    if (!characterId) return '#93c5fd';
    let hash = 0;
    for (let index = 0; index < characterId.length; index += 1) {
        hash = (hash * 31 + characterId.charCodeAt(index)) >>> 0;
    }
    return NOTE_COLORS[hash % NOTE_COLORS.length];
};

const buildMonsterBase = (): Omit<BestiaryMonster, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: '',
    imageUrl: '',
    averageWeight: '',
    averageHeight: '',
    threatLevel: '',
    weakness: '',
    strongPoint: '',
    isVisibleToPlayers: false,
});

const BestiaryView: React.FC<BestiaryViewProps> = ({ user, onBack }) => {
    const { state, dispatch } = useCharacterContext();
    const isMaster = user.role === Role.MASTER;
    const currentCharacter = useMemo(
        () => state.characters.find(character => character.playerId === user.id) || null,
        [state.characters, user.id]
    );

    const [editingMonsterId, setEditingMonsterId] = useState<string | null>(null);
    const [monsterForm, setMonsterForm] = useState(buildMonsterBase());
    const [selectedMonsterFile, setSelectedMonsterFile] = useState<File | null>(null);
    const [isUploadingMonsterFile, setIsUploadingMonsterFile] = useState(false);
    const [monsterUploadError, setMonsterUploadError] = useState('');
    const [monsterFormError, setMonsterFormError] = useState('');
    const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
    const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const bestiary = state.bestiary;
    const monsters = bestiary.monsters || [];
    const notes = bestiary.notes || [];

    const visibleMonsters = isMaster ? monsters : monsters.filter(monster => monster.isVisibleToPlayers);
    const pendingNotes = isMaster ? notes.filter(note => note.status === 'pending') : [];

    const updateBestiary = (nextMonsters: BestiaryMonster[], nextNotes: BestiaryPlayerNote[]) => {
        dispatch({
            type: 'SET_BESTIARY',
            payload: {
                monsters: nextMonsters,
                notes: nextNotes,
            },
        });
    };

    const resetMonsterForm = () => {
        setEditingMonsterId(null);
        setMonsterForm(buildMonsterBase());
        setSelectedMonsterFile(null);
        setMonsterUploadError('');
        setMonsterFormError('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleEditMonster = (monster: BestiaryMonster) => {
        setEditingMonsterId(monster.id);
        setMonsterForm({
            name: monster.name,
            imageUrl: monster.imageUrl || '',
            averageWeight: monster.averageWeight,
            averageHeight: monster.averageHeight,
            threatLevel: monster.threatLevel,
            weakness: monster.weakness,
            strongPoint: monster.strongPoint,
            isVisibleToPlayers: monster.isVisibleToPlayers,
        });
        setMonsterFormError('');
        setMonsterUploadError('');
    };

    const handleSaveMonster = () => {
        const trimmedName = monsterForm.name.trim();
        if (!trimmedName) {
            setMonsterFormError('Informe o nome do monstro.');
            return;
        }

        const now = Date.now();
        const monsterId = editingMonsterId || `monster_${now}`;
        const nextMonster: BestiaryMonster = {
            id: monsterId,
            name: trimmedName,
            imageUrl: monsterForm.imageUrl?.trim() || '',
            averageWeight: monsterForm.averageWeight.trim(),
            averageHeight: monsterForm.averageHeight.trim(),
            threatLevel: monsterForm.threatLevel.trim(),
            weakness: monsterForm.weakness.trim(),
            strongPoint: monsterForm.strongPoint.trim(),
            isVisibleToPlayers: monsterForm.isVisibleToPlayers,
            createdAt: editingMonsterId
                ? (monsters.find(monster => monster.id === editingMonsterId)?.createdAt || now)
                : now,
            updatedAt: now,
        };

        const nextMonsters = editingMonsterId
            ? monsters.map(monster => (monster.id === editingMonsterId ? nextMonster : monster))
            : [...monsters, nextMonster];

        updateBestiary(nextMonsters, notes);
        resetMonsterForm();
    };

    const handleToggleMonsterVisibility = (monsterId: string) => {
        const nextMonsters = monsters.map(monster => {
            if (monster.id !== monsterId) return monster;
            return {
                ...monster,
                isVisibleToPlayers: !monster.isVisibleToPlayers,
                updatedAt: Date.now(),
            };
        });
        updateBestiary(nextMonsters, notes);
    };

    const handleUploadMonsterFile = async () => {
        if (!selectedMonsterFile) {
            setMonsterUploadError('Selecione um arquivo de imagem antes de enviar.');
            return;
        }

        setIsUploadingMonsterFile(true);
        setMonsterUploadError('');
        try {
            const monsterPathId = editingMonsterId || `new-${Date.now()}`;
            const publicUrl = await uploadMonsterImage(monsterPathId, selectedMonsterFile);
            setMonsterForm(prev => ({ ...prev, imageUrl: publicUrl }));
            setSelectedMonsterFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            setMonsterUploadError(error instanceof Error ? error.message : 'Falha ao enviar imagem do monstro.');
        } finally {
            setIsUploadingMonsterFile(false);
        }
    };

    const handleSubmitPlayerNote = (monsterId: string) => {
        if (!currentCharacter) return;
        const draft = (noteDrafts[monsterId] || '').trim();
        if (!draft) return;

        const newNote: BestiaryPlayerNote = {
            id: `monster_note_${Date.now()}`,
            monsterId,
            characterId: currentCharacter.id,
            characterName: currentCharacter.name,
            characterColor: getCharacterColor(currentCharacter.id),
            content: draft,
            status: 'pending',
            createdAt: Date.now(),
        };

        updateBestiary(monsters, [...notes, newNote]);
        setNoteDrafts(prev => ({ ...prev, [monsterId]: '' }));
    };

    const handleReviewNote = (noteId: string, approved: boolean) => {
        const masterComment = (reviewComments[noteId] || '').trim();
        const nextNotes = notes.map(note => {
            if (note.id !== noteId) return note;
            return {
                ...note,
                status: approved ? 'approved' : 'rejected',
                reviewedAt: Date.now(),
                masterComment: masterComment || note.masterComment,
            };
        });
        updateBestiary(monsters, nextNotes);
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-900 p-4 rounded-lg border border-purple-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-purple-300">Bestiário da Trilha</h2>
                    <p className="text-sm text-gray-400" style={ANTIQUE_TEXT_STYLE}>
                        Registros ancestrais de monstros e observações da expedição.
                    </p>
                </div>
                <button
                    onClick={onBack}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded-md text-white font-semibold transition"
                >
                    Voltar
                </button>
            </div>

            {isMaster && (
                <div className="bg-gray-800 p-4 rounded-lg border border-purple-700 space-y-3">
                    <h3 className="text-lg font-bold text-purple-300">Cadastro de Monstros (Mestre)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                            value={monsterForm.name}
                            onChange={event => setMonsterForm(prev => ({ ...prev, name: event.target.value }))}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="Nome do monstro"
                        />
                        <input
                            value={monsterForm.threatLevel}
                            onChange={event => setMonsterForm(prev => ({ ...prev, threatLevel: event.target.value }))}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="Nível de ameaça"
                        />
                        <input
                            value={monsterForm.averageWeight}
                            onChange={event => setMonsterForm(prev => ({ ...prev, averageWeight: event.target.value }))}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="Peso médio"
                        />
                        <input
                            value={monsterForm.averageHeight}
                            onChange={event => setMonsterForm(prev => ({ ...prev, averageHeight: event.target.value }))}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="Altura média"
                        />
                        <input
                            value={monsterForm.weakness}
                            onChange={event => setMonsterForm(prev => ({ ...prev, weakness: event.target.value }))}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="Fraqueza"
                        />
                        <input
                            value={monsterForm.strongPoint}
                            onChange={event => setMonsterForm(prev => ({ ...prev, strongPoint: event.target.value }))}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="Ponto forte"
                        />
                        <input
                            value={monsterForm.imageUrl}
                            onChange={event => setMonsterForm(prev => ({ ...prev, imageUrl: event.target.value }))}
                            className="md:col-span-2 p-2 bg-gray-700 rounded-md text-sm"
                            placeholder="URL da imagem do monstro (opcional)"
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={event => setSelectedMonsterFile(event.target.files?.[0] || null)}
                            className="p-2 bg-gray-700 rounded-md text-sm"
                        />
                        <button
                            onClick={handleUploadMonsterFile}
                            disabled={!selectedMonsterFile || isUploadingMonsterFile}
                            className="py-2 bg-cyan-700 hover:bg-cyan-800 rounded-md text-sm font-semibold disabled:bg-gray-700"
                        >
                            {isUploadingMonsterFile ? 'Enviando imagem...' : 'Upload Imagem'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={handleSaveMonster} className="px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-md font-semibold text-sm">
                            {editingMonsterId ? 'Salvar Alterações' : 'Cadastrar Monstro'}
                        </button>
                        {editingMonsterId && (
                            <button onClick={resetMonsterForm} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md font-semibold text-sm">
                                Cancelar Edição
                            </button>
                        )}
                    </div>
                    {monsterFormError && <p className="text-xs text-red-400">{monsterFormError}</p>}
                    {monsterUploadError && <p className="text-xs text-red-400">{monsterUploadError}</p>}
                </div>
            )}

            {isMaster && pendingNotes.length > 0 && (
                <div className="bg-gray-800 p-4 rounded-lg border border-amber-700 space-y-3">
                    <h3 className="text-lg font-bold text-amber-300">Anotações Pendentes de Validação</h3>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {pendingNotes.map(note => {
                            const monster = monsters.find(currentMonster => currentMonster.id === note.monsterId);
                            return (
                                <div key={note.id} className="bg-gray-900 p-3 rounded-md space-y-2">
                                    <p className="text-sm text-cyan-200">
                                        Monstro: <span className="font-semibold">{monster?.name || note.monsterId}</span>
                                    </p>
                                    <p className="text-sm text-gray-200">
                                        Jogador: <span style={{ color: note.characterColor }}>{note.characterName}</span>
                                    </p>
                                    <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>{note.content}</p>
                                    <textarea
                                        value={reviewComments[note.id] || ''}
                                        onChange={event => setReviewComments(prev => ({ ...prev, [note.id]: event.target.value }))}
                                        rows={2}
                                        className="w-full p-2 bg-gray-700 rounded-md text-sm"
                                        placeholder="Comentário do Mestre (opcional)"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => handleReviewNote(note.id, true)} className="py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md text-sm font-semibold">
                                            Aprovar
                                        </button>
                                        <button onClick={() => handleReviewNote(note.id, false)} className="py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm font-semibold">
                                            Rejeitar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {visibleMonsters.length === 0 ? (
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <p className="text-sm text-gray-400" style={ANTIQUE_TEXT_STYLE}>
                            Nenhuma criatura registrada no bestiário visível no momento.
                        </p>
                    </div>
                ) : (
                    visibleMonsters.map(monster => {
                        const approvedNotes = notes.filter(note => note.monsterId === monster.id && note.status === 'approved');
                        const myPendingNotes = currentCharacter
                            ? notes.filter(
                                note => note.monsterId === monster.id && note.characterId === currentCharacter.id && note.status === 'pending'
                            )
                            : [];

                        return (
                            <div key={monster.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                                <div className="flex flex-col md:flex-row gap-4">
                                    <img
                                        src={monster.imageUrl || 'https://via.placeholder.com/320x220?text=Monstro'}
                                        alt={monster.name}
                                        className="w-full md:w-56 h-44 object-cover rounded-md bg-gray-700"
                                    />
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold text-red-300">{monster.name}</h3>
                                        <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>Peso médio: {monster.averageWeight || '-'}</p>
                                        <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>Altura média: {monster.averageHeight || '-'}</p>
                                        <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>Nível de ameaça: {monster.threatLevel || '-'}</p>
                                        <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>Fraqueza: {monster.weakness || '-'}</p>
                                        <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>Ponto forte: {monster.strongPoint || '-'}</p>
                                        {isMaster && (
                                            <div className="flex gap-2 pt-2">
                                                <button onClick={() => handleEditMonster(monster)} className="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 rounded-md text-xs font-semibold">
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleToggleMonsterVisibility(monster.id)}
                                                    className="px-3 py-1 bg-purple-700 hover:bg-purple-800 rounded-md text-xs font-semibold"
                                                >
                                                    {monster.isVisibleToPlayers ? 'Ocultar dos Jogadores' : 'Tornar Visível'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-gray-900 p-3 rounded-md space-y-2">
                                    <h4 className="font-semibold text-amber-300">Anotações Publicadas</h4>
                                    {approvedNotes.length === 0 ? (
                                        <p className="text-xs text-gray-400" style={ANTIQUE_TEXT_STYLE}>Nenhuma anotação aprovada.</p>
                                    ) : (
                                        approvedNotes.map(note => (
                                            <div key={note.id} className="border-l-2 border-gray-600 pl-3">
                                                <p className="text-xs font-semibold" style={{ color: note.characterColor }}>{note.characterName}</p>
                                                <p className="text-sm text-gray-300" style={ANTIQUE_TEXT_STYLE}>{note.content}</p>
                                            </div>
                                        ))
                                    )}

                                    {!isMaster && currentCharacter && (
                                        <div className="pt-2 space-y-2">
                                            <textarea
                                                value={noteDrafts[monster.id] || ''}
                                                onChange={event => setNoteDrafts(prev => ({ ...prev, [monster.id]: event.target.value }))}
                                                rows={2}
                                                className="w-full p-2 bg-gray-700 rounded-md text-sm"
                                                placeholder="Escreva uma observação curta sobre este monstro..."
                                            />
                                            <button
                                                onClick={() => handleSubmitPlayerNote(monster.id)}
                                                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 rounded-md text-sm font-semibold"
                                            >
                                                Enviar Anotação para Validação
                                            </button>
                                            {myPendingNotes.length > 0 && (
                                                <p className="text-xs text-yellow-300">
                                                    Você possui {myPendingNotes.length} anotação(ões) pendente(s) para este monstro.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default BestiaryView;

