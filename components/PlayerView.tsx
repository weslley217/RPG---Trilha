import React, { useMemo, useState } from 'react';
import { User, Character, PendingAttack } from '../types';
import { useCharacterContext } from '../context/CharacterContext';
import CharacterSheet from './CharacterSheet';
import BestiaryView from './BestiaryView';
import * as Rules from '../services/rulesEngine';
import { ATTRIBUTE_LABELS, PROFICIENCY_LABELS } from '../constants';

interface PlayerViewProps {
    user: User;
    onLogout: () => void;
}

type AttackMeta = {
    weaponName?: string;
    weaponId?: number;
    isParadoxWeaponAttack?: boolean;
    hasParadoxBuff?: boolean;
    hitCount?: number;
    attackNote?: string;
};

const AttackModal: React.FC<{ character: Character, onAttack: (type: string, damage: number, meta?: AttackMeta) => void, onClose: () => void }> = ({ character, onAttack, onClose }) => {
    const [rifleShots, setRifleShots] = useState(10);

    const physicalRange = Rules.calculatePhysicalDamageDisplayRange(character);
    const auraDamage = Rules.calculateAuraEnhancedDamage(character);
    const activeWeapon = character.paradoxState?.selectedEquipment;
    const weaponDamageRange = activeWeapon ? Rules.calculateParadoxWeaponDamageRange(character) : null;
    const hasParadoxBuff = activeWeapon ? Rules.isParadoxWeaponBuffActive(character, activeWeapon.id) : false;

    const preparedExtraShots = activeWeapon?.id === 1 ? character.paradoxState?.preparedExtraShots || 0 : 0;
    const weaponHitCount = activeWeapon?.id === 9 ? rifleShots : 1 + preparedExtraShots;
    const totalWeaponDamageRange = weaponDamageRange
        ? { min: weaponDamageRange.min * weaponHitCount, max: weaponDamageRange.max * weaponHitCount }
        : null;

    const handleAttackClick = (type: string, damage: number | null, meta?: AttackMeta) => {
        if (damage === null || damage === undefined) return;
        onAttack(type, damage, meta);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-900 p-6 rounded-lg shadow-2xl border border-red-500 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-red-400 mb-4">Escolha seu Ataque</h2>
                <div className="space-y-3">
                    <button
                        onClick={() => {
                            const roll = Rules.rollPhysicalDamage(character);
                            handleAttackClick('Ataque Físico', roll.damage, {
                                attackNote: `Rolagem física base: ${roll.rolledBase} (faixa ${roll.minBase}-${roll.maxBase}).`,
                            });
                        }}
                        className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-md transition flex justify-between items-center"
                    >
                        <div>
                            <h3 className="font-bold text-white">Ataque Físico</h3>
                            <p className="text-sm text-gray-400">Dano variável por golpe.</p>
                        </div>
                        <p className="text-2xl font-mono">{physicalRange.min}-{physicalRange.max}</p>
                    </button>

                    <button onClick={() => handleAttackClick('Ataque com Aura', auraDamage)} className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700 rounded-md transition flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-white">Ataque com Aura</h3>
                            <p className="text-sm text-gray-400">Ataque aprimorado com Nen.</p>
                        </div>
                        <p className="text-2xl font-mono">{auraDamage}</p>
                    </button>

                    {activeWeapon && totalWeaponDamageRange !== null && (
                        <button
                            onClick={() => {
                                const roll = Rules.rollPhysicalDamage(character);
                                const weaponDamage = Rules.calculateParadoxWeaponDamage(character, false, roll.damage);
                                if (weaponDamage === null) return;
                                const totalWeaponDamage = weaponDamage * weaponHitCount;
                                handleAttackClick(`Ataque com ${activeWeapon.name}`, totalWeaponDamage, {
                                    weaponName: activeWeapon.name,
                                    weaponId: activeWeapon.id,
                                    isParadoxWeaponAttack: true,
                                    hasParadoxBuff,
                                    hitCount: weaponHitCount,
                                    attackNote: `Componente físico rolado: ${roll.rolledBase} (faixa ${roll.minBase}-${roll.maxBase}).`,
                                });
                            }}
                            className="w-full text-left p-4 bg-yellow-900/50 hover:bg-yellow-900/70 rounded-md transition flex justify-between items-center border border-yellow-700"
                        >
                            <div>
                                <h3 className="font-bold text-yellow-300">{activeWeapon.name}</h3>
                                <p className="text-sm text-yellow-400/80">
                                    Dano da arma do Paradoxo.
                                    {hasParadoxBuff && ' Bônus de buff aplicado após a validação do Mestre.'}
                                </p>
                                {activeWeapon.id === 1 && preparedExtraShots > 0 && (
                                    <p className="text-xs text-cyan-300">Flechas extras prontas: +{preparedExtraShots}</p>
                                )}
                                {activeWeapon.id === 9 && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <label className="text-xs text-gray-300">Tiros:</label>
                                        <input
                                            type="number"
                                            min={10}
                                            max={20}
                                            value={rifleShots}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                const parsed = parseInt(e.target.value, 10);
                                                const safeShots = Number.isNaN(parsed) ? 10 : Math.max(10, Math.min(20, parsed));
                                                setRifleShots(safeShots);
                                            }}
                                            className="w-20 p-1 bg-gray-800 rounded-md text-sm"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-mono">{totalWeaponDamageRange.min}-{totalWeaponDamageRange.max}</p>
                                {weaponHitCount > 1 && <p className="text-xs text-yellow-200">{weaponHitCount} hits</p>}
                            </div>
                        </button>
                    )}
                </div>
                <button onClick={onClose} className="mt-6 w-full py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white font-semibold transition">Cancelar</button>
            </div>
        </div>
    );
};

const PlayerActionsPanel: React.FC<{ character: Character, onUpdate: (char: Character) => void; dispatch: any; }> = ({ character, onUpdate, dispatch }) => {
    const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
    const isUnconscious = character.effects.some(effect => effect.name === 'Desmaiado');

    const handleAction = (logMessage: string) => {
        onUpdate({ ...character, combatLog: [...character.combatLog, logMessage] });
    };

    const handleAttack = (type: string, damage: number, meta?: AttackMeta) => {
        if (isUnconscious) {
            handleAction(`${character.name} está desmaiado e não pode agir.`);
            return;
        }

        if (character.actions.attacks <= 0) {
            handleAction(`${character.name} tenta atacar, mas não tem ações de ataque restantes.`);
            return;
        }

        const hitInfo = meta?.hitCount && meta.hitCount > 1 ? ` em ${meta.hitCount} instâncias` : '';
        const note = meta?.attackNote ? ` ${meta.attackNote}` : '';
        const logMessage = `${character.name} usa '${type}' com dano potencial de ${damage}${hitInfo}.${note} Aguardando validação do Mestre.`;

        const pendingAttack: PendingAttack = {
            attackId: `${character.id}_${Date.now()}`,
            attackerId: character.id,
            baseDamage: damage,
            hitCount: meta?.hitCount,
            weaponName: meta?.weaponName || 'Ataque Desarmado',
            weaponId: meta?.weaponId,
            isParadoxWeaponAttack: meta?.isParadoxWeaponAttack || false,
            hasParadoxBuff: meta?.hasParadoxBuff || false,
            attackType: type,
            logMessage,
        };

        dispatch({ type: 'SUBMIT_ATTACK', payload: pendingAttack });

        const shouldConsumeArcoPreparedShots =
            meta?.isParadoxWeaponAttack && meta.weaponId === 1 && !!character.paradoxState?.preparedExtraShots;
        const updatedParadoxState = shouldConsumeArcoPreparedShots && character.paradoxState
            ? { ...character.paradoxState, preparedExtraShots: 0 }
            : character.paradoxState;

        onUpdate({
            ...character,
            pendingAttack,
            paradoxState: updatedParadoxState,
            actions: { ...character.actions, attacks: character.actions.attacks - 1 },
            combatLog: [...character.combatLog, logMessage]
        });
    };

    return (
        <div className="bg-gray-900 p-4 rounded-lg shadow-2xl border border-green-500 sticky top-24">
            <h3 className="text-lg font-bold text-green-400 mb-3 text-center">Ações Possíveis</h3>
            <div className="flex flex-col gap-2">
                <button onClick={() => setIsAttackModalOpen(true)} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white font-semibold transition disabled:bg-gray-600" disabled={character.actions.attacks <= 0 || isUnconscious}>
                    Atacar ({character.actions.attacks}/{character.actions.totalAttacks})
                </button>
                <button onClick={() => handleAction(`${character.name} usa sua ação para se movimentar.`)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition disabled:bg-gray-600" disabled={isUnconscious}>Movimentar-se</button>
                <button onClick={() => handleAction(`${character.name} tenta interagir com o cenário.`)} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-md text-white font-semibold transition disabled:bg-gray-600" disabled={isUnconscious}>Interagir</button>
            </div>
            {isUnconscious && <p className="text-xs text-red-300 mt-2 text-center">Desmaiado: sem ações por 3 turnos.</p>}
            {isAttackModalOpen && <AttackModal character={character} onAttack={handleAttack} onClose={() => setIsAttackModalOpen(false)} />}
        </div>
    );
};

const TestRequestModal: React.FC<{ character: any; onResolve: (result: string) => void }> = ({ character, onResolve }) => {
    if (!character.testRequest) return null;

    const { proficiency, testContext } = character.testRequest;

    const handleRoll = () => {
        const roll = Math.floor(Math.random() * 20) + 1;
        const profValue = Rules.getEffectiveProficiency(character, proficiency);
        const { modifier, attribute } = Rules.calculateTestModifier(character, proficiency, testContext);
        const total = roll + profValue + modifier;

        const resultDetail = `Rolagem de ${PROFICIENCY_LABELS[proficiency]} (Contexto: ${testContext || 'Geral'} -> ${ATTRIBUTE_LABELS[attribute]}):\nDado (1d20): ${roll}\nProficiência (${PROFICIENCY_LABELS[proficiency]}): ${profValue}\nModificador (${ATTRIBUTE_LABELS[attribute]}): ${modifier}\nTotal: ${total}`;
        onResolve(resultDetail);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-8 rounded-lg shadow-2xl border border-green-500 text-center">
                <h2 className="text-2xl font-bold text-green-400 mb-4">Teste Solicitado!</h2>
                <p className="text-lg mb-6">O Mestre pediu um teste de <span className="font-bold text-white">{PROFICIENCY_LABELS[proficiency]}</span>.</p>
                <button
                    onClick={handleRoll}
                    className="px-6 py-3 font-bold text-white bg-green-600 rounded-md hover:bg-green-700 transition duration-300"
                >
                    Rolar o Dado
                </button>
            </div>
        </div>
    );
};

const PlayerView: React.FC<PlayerViewProps> = ({ user, onLogout }) => {
    const { state, dispatch } = useCharacterContext();
    const [isBestiaryOpen, setIsBestiaryOpen] = useState(false);
    const character = useMemo(() => state.characters.find(c => c.playerId === user.id), [state.characters, user.id]);

    const isMyTurn = useMemo(() => {
        if (state.turnOrder.length === 0 || !character) return false;
        return state.turnOrder[state.activeCharacterIndex] === character.id;
    }, [state.turnOrder, state.activeCharacterIndex, character]);

    const handleUpdateCharacter = (updatedChar: Character) => {
        dispatch({ type: 'UPDATE_CHARACTER', payload: updatedChar });
    };

    const handleResolveTest = (result: string) => {
        if (!character) return;
        const updatedCharacter = {
            ...character,
            testRequest: null,
            combatLog: [...character.combatLog, result],
        };
        dispatch({ type: 'UPDATE_CHARACTER', payload: updatedCharacter });
    };

    if (!character) {
        return <div className="p-4 text-center">Personagem não encontrado. Se você acabou de se registrar, por favor, saia e entre novamente.</div>;
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            {isMyTurn && !isBestiaryOpen && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-green-500 text-black font-bold text-xl px-8 py-3 rounded-lg shadow-lg z-50 animate-pulse">
                    É a sua vez de agir!
                </div>
            )}
            <header className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-green-400">
                    {isBestiaryOpen ? 'Bestiário' : `Ficha de ${character.name}`}
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsBestiaryOpen(prev => !prev)}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-md text-white font-semibold transition"
                    >
                        {isBestiaryOpen ? 'Voltar à Ficha' : 'Abrir Bestiário'}
                    </button>
                    <button onClick={onLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white font-semibold transition">
                        Sair
                    </button>
                </div>
            </header>
            {isBestiaryOpen ? (
                <BestiaryView user={user} onBack={() => setIsBestiaryOpen(false)} />
            ) : (
                <>
                    <CharacterSheet
                        character={character}
                        isMasterView={false}
                        onUpdate={handleUpdateCharacter}
                        actionsPanel={isMyTurn ? <PlayerActionsPanel character={character} onUpdate={handleUpdateCharacter} dispatch={dispatch} /> : null}
                    />
                    <TestRequestModal character={character} onResolve={handleResolveTest} />
                </>
            )}
        </div>
    );
};

export default PlayerView;
