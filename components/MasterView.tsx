
import React, { useState, useMemo, useEffect } from 'react';
import { Attribute, User, Character, Proficiency, Equipment, EffectType, PendingAttack, Effect } from '../types';
import { useCharacterContext } from '../context/CharacterContext';
import CharacterSheet from './CharacterSheet';
import BestiaryView from './BestiaryView';
import { ALL_PROFICIENCIES, PROFICIENCY_LABELS } from '../constants';
import * as Rules from '../services/rulesEngine';
import { uploadWeaponImage } from '../services/imageUpload';

interface MasterViewProps {
    user: User;
    onLogout: () => void;
}

const removeNamedEffectPrefixes = (effects: Effect[], prefixes: string[]): Effect[] => {
    return effects.filter(effect => !prefixes.some(prefix => effect.name.startsWith(prefix)));
};

const buildAuraExpandirTierEffects = (character: Character, affectedTargets: number): { effects: Effect[]; tierLabel: string } => {
    const dominioAura = Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura);
    const marcialidade = Rules.getEffectiveProficiency(character, Proficiency.Marcialidade);
    const resistencia = Rules.getEffectiveProficiency(character, Proficiency.Resistencia);
    const espiritoBruto = character.attributes[Attribute.Espirito];
    const espiritoMod = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));

    let corpoBonus = 0;
    let espiritoBonus = 0;
    let allStatsBonus = 0;
    let flatDamageBase = 0;
    let flatResistanceBase = 0;
    let tierLabel = 'sem alvos';

    if (affectedTargets >= 11) {
        allStatsBonus = 10;
        flatDamageBase = 40;
        flatResistanceBase = 60;
        tierLabel = '11+ alvos';
    } else if (affectedTargets >= 6) {
        allStatsBonus = 6;
        flatDamageBase = 20;
        flatResistanceBase = 40;
        tierLabel = '6-10 alvos';
    } else if (affectedTargets >= 3) {
        corpoBonus = 4;
        espiritoBonus = 4;
        flatDamageBase = 10;
        flatResistanceBase = 20;
        tierLabel = '3-5 alvos';
    } else if (affectedTargets >= 1) {
        corpoBonus = 2;
        flatDamageBase = 10;
        flatResistanceBase = 10;
        tierLabel = '1-2 alvos';
    }

    if (affectedTargets <= 0) {
        return { effects: [], tierLabel };
    }

    const extraDamage = flatDamageBase + dominioAura + marcialidade + espiritoMod + espiritoBruto;
    const extraResistance = flatResistanceBase + resistencia + dominioAura;
    const duration = 3;
    const effects: Effect[] = [];

    if (corpoBonus > 0) {
        effects.push({
            id: `aura_expandir_corpo_${Date.now()}`,
            name: 'Aura Expandir Corpo',
            type: EffectType.Buff,
            target: Attribute.Corpo,
            value: corpoBonus,
            duration,
        });
    }
    if (espiritoBonus > 0) {
        effects.push({
            id: `aura_expandir_espirito_${Date.now()}`,
            name: 'Aura Expandir Espírito',
            type: EffectType.Buff,
            target: Attribute.Espirito,
            value: espiritoBonus,
            duration,
        });
    }
    if (allStatsBonus > 0) {
        effects.push({
            id: `aura_expandir_allstats_${Date.now()}`,
            name: 'Aura Expandir AllStats',
            type: EffectType.Buff,
            target: 'AllStats',
            value: allStatsBonus,
            duration,
        });
    }

    effects.push({
        id: `aura_expandir_damage_${Date.now()}`,
        name: 'Aura Expandir Dano',
        type: EffectType.Buff,
        target: 'AllDamage',
        value: extraDamage,
        duration,
    });
    effects.push({
        id: `aura_expandir_resist_${Date.now()}`,
        name: 'Aura Expandir Resistência',
        type: EffectType.Buff,
        target: 'DamageReduction',
        value: extraResistance,
        duration,
    });

    return { effects, tierLabel };
};

const PendingAttacksViewer: React.FC<{ attackerId?: string; title?: string; showWhenEmpty?: boolean }> = ({ attackerId, title = 'Ataques Pendentes de Validação', showWhenEmpty = false }) => {
    const { state, dispatch } = useCharacterContext();
    const [validatedDamages, setValidatedDamages] = useState<Record<string, string>>({});
    const [validationModes, setValidationModes] = useState<Record<string, 'pass' | 'block'>>({});

    const pendingAttacks = useMemo(() => {
        return state.characters.reduce((acc, char) => {
            if (char.pendingAttack && (!attackerId || char.id === attackerId)) {
                acc.push(char.pendingAttack);
            }
            return acc;
        }, [] as PendingAttack[]);
    }, [state.characters, attackerId]);

    const handleValidation = (attack: PendingAttack) => {
        const parsedDamage = parseInt(validatedDamages[attack.attackId] || '0', 10);
        const safeInput = Number.isNaN(parsedDamage) ? 0 : Math.max(0, parsedDamage);
        const mode = validationModes[attack.attackId] || 'pass';
        const validatedDamage = mode === 'block'
            ? Math.max(0, attack.baseDamage - safeInput)
            : safeInput;

        dispatch({ type: 'VALIDATE_ATTACK', payload: { attackId: attack.attackId, validatedDamage } });
        setValidatedDamages(prev => {
            const newState = { ...prev };
            delete newState[attack.attackId];
            return newState;
        });
        setValidationModes(prev => {
            const newState = { ...prev };
            delete newState[attack.attackId];
            return newState;
        });
    };

    if (pendingAttacks.length === 0 && !showWhenEmpty) {
        return null;
    }

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-yellow-500 mb-6">
            <h2 className="text-xl font-bold text-yellow-400 mb-3">{title}</h2>
            {pendingAttacks.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum ataque pendente para validação.</p>
            ) : (
            <div className="space-y-4">
                {pendingAttacks.map(attack => {
                    const attacker = state.characters.find(c => c.id === attack.attackerId);
                    const mode = validationModes[attack.attackId] || 'pass';
                    const parsedInputValue = parseInt(validatedDamages[attack.attackId] || '0', 10);
                    const safeInputValue = Number.isNaN(parsedInputValue) ? 0 : Math.max(0, parsedInputValue);

                    const previewValidatedBaseDamage = mode === 'block'
                        ? Math.max(0, attack.baseDamage - safeInputValue)
                        : safeInputValue;
                    const previewBlockedDamage = mode === 'block'
                        ? Math.min(attack.baseDamage, safeInputValue)
                        : Math.max(0, attack.baseDamage - previewValidatedBaseDamage);

                    const paradoxBonus = attack.hasParadoxBuff && attack.weaponId
                        ? Rules.calculateParadoxValidationBonus(previewValidatedBaseDamage, attack.weaponId)
                        : 0;
                    const previewFinalDamage = previewValidatedBaseDamage + paradoxBonus;

                    return (
                        <div key={attack.attackId} className="bg-gray-900 p-3 rounded-md flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                            <div>
                                <p><span className="font-bold">{attacker?.name || 'Desconhecido'}</span> usou <span className="text-yellow-300">{attack.attackType}</span>.</p>
                                <p className="text-sm text-gray-400">Dano Potencial: {attack.baseDamage}</p>
                                {attack.hitCount && attack.hitCount > 1 && (
                                    <p className="text-xs text-cyan-300">Instâncias de dano: {attack.hitCount}</p>
                                )}
                                <p className="text-xs text-gray-300">
                                    Preview: bloqueado {previewBlockedDamage} | passa {previewValidatedBaseDamage}
                                    {paradoxBonus > 0 ? ` | bônus paradoxo +${paradoxBonus}` : ''} | final {previewFinalDamage}
                                </p>
                                {attack.hasParadoxBuff && attack.weaponId && (
                                    <p className="text-xs text-yellow-400">
                                        Bônus Paradoxo (arma {attack.weaponId}): +{paradoxBonus} | Dano final previsto: {previewFinalDamage}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={mode}
                                    onChange={(e) => setValidationModes(prev => ({ ...prev, [attack.attackId]: e.target.value as 'pass' | 'block' }))}
                                    className="p-2 bg-gray-700 rounded-md text-sm"
                                >
                                    <option value="pass">Dano que passa</option>
                                    <option value="block">Dano bloqueado</option>
                                </select>
                                <input
                                    type="number"
                                    value={validatedDamages[attack.attackId] || ''}
                                    min={0}
                                    onChange={(e) => setValidatedDamages(prev => ({ ...prev, [attack.attackId]: e.target.value }))}
                                    placeholder={mode === 'block' ? 'Quanto bloquear' : 'Quanto passa'}
                                    className="w-32 p-2 bg-gray-700 rounded-md"
                                />
                                <button
                                    onClick={() => handleValidation(attack)}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold transition"
                                >
                                    Validar
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            )}
        </div>
    );
};


const TurnManager: React.FC = () => {
    const { state, dispatch } = useCharacterContext();
    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-green-400">Controle de Rodada</h2>
                <div className="flex flex-col sm:items-end">
                    <span className="text-xl">Rodada Atual: <span className="font-bold text-white">{state.turnCount}</span></span>
                    <span className="text-sm text-cyan-300">Dia Atual: {state.currentDay}</span>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => dispatch({ type: 'RESET_TURNS' })} 
                        className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-md text-white font-semibold transition"
                    >
                        Resetar
                    </button>
                    <button 
                        onClick={() => dispatch({ type: 'ADVANCE_ROUND' })} 
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition"
                    >
                        Avançar
                    </button>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                    onClick={() => dispatch({ type: 'ADVANCE_DAY' })}
                    className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 rounded-md text-white font-semibold transition"
                >
                    Passar Dia
                </button>
                <button
                    onClick={() => dispatch({ type: 'GENERAL_RESTORATION' })}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 rounded-md text-white font-semibold transition"
                >
                    Restauração Geral
                </button>
            </div>
        </div>
    );
};

const InitiativeTracker: React.FC = () => {
    const { state, dispatch } = useCharacterContext();
    const { characters, turnOrder, activeCharacterIndex } = state;

    const orderedCharacters = useMemo(() => {
        return turnOrder.map(id => characters.find(c => c.id === id)).filter(Boolean) as Character[];
    }, [turnOrder, characters]);
    
    useEffect(() => {
        const charIds = characters.map(c => c.id);
        if (turnOrder.length !== charIds.length || !turnOrder.every(id => charIds.includes(id))) {
             dispatch({ type: 'SET_TURN_ORDER', payload: charIds });
        }
    }, [characters, turnOrder, dispatch]);

    const handleNextTurn = () => {
        const nextIndex = (activeCharacterIndex + 1) % turnOrder.length;
        const nextCharId = turnOrder[nextIndex];
        dispatch({ type: 'NEXT_TURN' });
        if(nextCharId) {
            dispatch({ type: 'START_TURN', payload: { characterId: nextCharId } });
        }
    };
    
    const moveCharacterInOrder = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...turnOrder];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newOrder.length) return;
        [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
        dispatch({ type: 'SET_TURN_ORDER', payload: newOrder });
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
             <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-bold text-green-400">Ordem de Turno</h2>
                 <button onClick={handleNextTurn}  className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold transition">
                    Próximo
                </button>
            </div>
            <ul className="space-y-2">
                {orderedCharacters.map((char, index) => (
                    <li key={char.id} className={`flex items-center justify-between p-2 rounded-md transition-all ${index === activeCharacterIndex ? 'bg-green-900/50 ring-2 ring-green-500' : 'bg-gray-900'}`}>
                        <span className="font-bold">{index + 1}. {char.name}</span>
                        <div className="flex gap-2">
                             <button onClick={() => moveCharacterInOrder(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-white disabled:opacity-30">â–²</button>
                             <button onClick={() => moveCharacterInOrder(index, 'down')} disabled={index === orderedCharacters.length - 1} className="text-gray-400 hover:text-white disabled:opacity-30">â–¼</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

const MiniStatBar: React.FC<{current: number, max: number, color: string}> = ({current, max, color}) => {
    const percentage = max > 0 ? (current / max) * 100 : 0;
    return (
        <div className="w-full bg-gray-700 rounded-full h-2">
            <div className={`${color} h-2 rounded-full`} style={{ width: `${percentage}%` }}></div>
        </div>
    )
}

const PlayerOverview: React.FC<{onSelect: (id: string) => void}> = ({ onSelect }) => {
    const { state } = useCharacterContext();

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h2 className="text-xl font-bold text-green-400 mb-3">Visão Geral dos Jogadores</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                {state.characters.map(char => {
                    const maxHealth = Rules.calculateMaxHealth(char);
                    const maxAura = Rules.calculateMaxAura(char);
                    return (
                        <div key={char.id} className="bg-gray-900 p-3 rounded-md space-y-2 cursor-pointer hover:bg-gray-700 transition" onClick={() => onSelect(char.id)}>
                            <div className="flex justify-between items-baseline">
                                <h3 className="font-bold text-white truncate">{char.name}</h3>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-red-400"><span>Vida</span><span>{char.currentHealth} / {maxHealth}</span></div>
                                <MiniStatBar current={char.currentHealth} max={maxHealth} color="bg-red-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-yellow-400"><span>Aura</span><span>{char.currentAura} / {maxAura}</span></div>
                                <MiniStatBar current={char.currentAura} max={maxAura} color="bg-yellow-400" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const EquipmentViewer: React.FC = () => {
    const { state, dispatch } = useCharacterContext();
    const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
    const [isUploadingByItem, setIsUploadingByItem] = useState<Record<number, boolean>>({});
    const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});

    const handleEquipmentUpdate = (updatedItem: Equipment) => {
        dispatch({ type: 'UPDATE_EQUIPMENT', payload: updatedItem });
    };

    const handleFileSelection = (itemId: number, file: File | null) => {
        setSelectedFiles(prev => ({ ...prev, [itemId]: file }));
        setUploadErrors(prev => ({ ...prev, [itemId]: '' }));
    };

    const handleUploadWeaponImage = async (item: Equipment) => {
        const selectedFile = selectedFiles[item.id];
        if (!selectedFile) {
            setUploadErrors(prev => ({ ...prev, [item.id]: 'Selecione uma imagem antes de enviar.' }));
            return;
        }

        setIsUploadingByItem(prev => ({ ...prev, [item.id]: true }));
        setUploadErrors(prev => ({ ...prev, [item.id]: '' }));
        try {
            const publicUrl = await uploadWeaponImage(item.id, selectedFile);
            handleEquipmentUpdate({ ...item, imageUrl: publicUrl });
            setSelectedFiles(prev => ({ ...prev, [item.id]: null }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Falha ao enviar imagem da arma.';
            setUploadErrors(prev => ({ ...prev, [item.id]: message }));
        } finally {
            setIsUploadingByItem(prev => ({ ...prev, [item.id]: false }));
        }
    };

    return (
         <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="text-lg font-bold text-yellow-400 mb-3">Editor de Equipamentos (Paradoxo)</h3>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {state.equipment.map(item => (
                    <div key={item.id} className="bg-gray-900 p-3 rounded-md space-y-2">
                        <div className="flex flex-col sm:flex-row gap-4">
                             <img src={item.imageUrl} alt={item.name} className="w-20 h-20 object-cover rounded-md bg-gray-700"/>
                             <div className="flex-1">
                                 <h4 className="font-bold text-white">{item.name}</h4>
                                 <p className="text-sm text-gray-400">{item.description}</p>
                                 <p className="text-xs mt-1"><strong className="text-green-400">Buff:</strong> {item.buff}</p>
                                <p className="text-xs"><strong className="text-red-400">Debuff:</strong> {item.debuff}</p>
                             </div>
                        </div>
                        <input type="text" placeholder="URL da Imagem..." value={item.imageUrl || ''} onChange={(e) => handleEquipmentUpdate({ ...item, imageUrl: e.target.value })} className="w-full p-2 bg-gray-700 rounded-md text-sm" />
                        <button onClick={() => handleEquipmentUpdate(item)} className="w-full py-2 bg-cyan-700 hover:bg-cyan-800 rounded-md text-sm font-semibold">
                            Alterar Imagem da Arma
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={e => handleFileSelection(item.id, e.target.files?.[0] || null)}
                                className="sm:col-span-2 w-full p-2 bg-gray-700 rounded-md text-sm"
                            />
                            <button
                                onClick={() => handleUploadWeaponImage(item)}
                                disabled={!selectedFiles[item.id] || !!isUploadingByItem[item.id]}
                                className="w-full py-2 bg-blue-700 hover:bg-blue-800 rounded-md text-sm font-semibold disabled:bg-gray-700"
                            >
                                {isUploadingByItem[item.id] ? 'Enviando...' : 'Upload Arquivo'}
                            </button>
                        </div>
                        {uploadErrors[item.id] && (
                            <p className="text-xs text-red-400">{uploadErrors[item.id]}</p>
                        )}
                        <textarea placeholder="Pergunta de Física para esta arma..." value={item.question || ''} onChange={(e) => handleEquipmentUpdate({ ...item, question: e.target.value })} className="w-full p-2 bg-gray-700 rounded-md text-sm" rows={2} />
                    </div>
                ))}
            </div>
         </div>
    )
}

const MasterControls: React.FC<{ character: Character; onUpdate: (char: Character) => void; }> = ({ character, onUpdate }) => {
    const { state, dispatch, persistStateNow } = useCharacterContext();
    const [testProficiency, setTestProficiency] = useState<Proficiency>(Proficiency.Resistencia);
    const [testContext, setTestContext] = useState<'Physical' | 'Aura' | 'Mental'>('Physical');
    const [attrPoints, setAttrPoints] = useState(0);
    const [profPoints, setProfPoints] = useState(0);
    const [damageAmount, setDamageAmount] = useState(10);
    const [damageType, setDamageType] = useState<'Physical' | 'Aura'>('Physical');
    const [isTrueDamage, setIsTrueDamage] = useState(false);
    const [ozyAlliesInArea, setOzyAlliesInArea] = useState(0);
    const [ozyEnemiesInArea, setOzyEnemiesInArea] = useState(0);
    const [ozyIntimidationThreshold, setOzyIntimidationThreshold] = useState(0);
    const [ozyIntimidatedTargets, setOzyIntimidatedTargets] = useState(0);
    const [ozyEgoTargets, setOzyEgoTargets] = useState(0);
    const [ozyAffectedCharacterIds, setOzyAffectedCharacterIds] = useState<string[]>([]);
    const [matheusMasterResult, setMatheusMasterResult] = useState('');
    const [matheusAdditionalDamage, setMatheusAdditionalDamage] = useState(0);
    const [matheusTestOutcome, setMatheusTestOutcome] = useState<'success' | 'failure'>('success');
    const [gabrielEscudoMasterText, setGabrielEscudoMasterText] = useState('');
    const [gabrielEscudoNumericValue, setGabrielEscudoNumericValue] = useState(0);
    const [gabrielHouseMasterText, setGabrielHouseMasterText] = useState('');
    const [gabrielHouseShieldUsesCost, setGabrielHouseShieldUsesCost] = useState(1);
    const [gabrielTokenMasterText, setGabrielTokenMasterText] = useState('');
    const [tavernInfoPrice, setTavernInfoPrice] = useState(0);
    const [tavernFoodPrice, setTavernFoodPrice] = useState(0);
    const [tavernLodgingPrice, setTavernLodgingPrice] = useState(0);
    const [tavernItemName, setTavernItemName] = useState('');
    const [tavernItemPrice, setTavernItemPrice] = useState(0);
    const [tavernMissionTitle, setTavernMissionTitle] = useState('');
    const [tavernMissionDescription, setTavernMissionDescription] = useState('');
    const [tavernMissionReward, setTavernMissionReward] = useState(0);
    const [tavernSellApprovalValues, setTavernSellApprovalValues] = useState<Record<string, number>>({});
    const [maxHealthTarget, setMaxHealthTarget] = useState(0);
    const [maxAuraTarget, setMaxAuraTarget] = useState(0);
    const [maxStatsMessage, setMaxStatsMessage] = useState('');

    const handleRequestTest = () => onUpdate({ ...character, testRequest: { proficiency: testProficiency, testContext: testContext } });
    const handleRequestTestAll = () => {
        const updatedCharacters = state.characters.map(char => ({
            ...char,
            testRequest: { proficiency: testProficiency, testContext: testContext },
            combatLog: [...char.combatLog, `Mestre solicitou teste de ${PROFICIENCY_LABELS[testProficiency]} (${testContext}).`]
        }));
        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
    };

    useEffect(() => {
        if (character.ozyState) {
            setOzyAlliesInArea(character.ozyState.auraExpandir.alliesInArea || 0);
            setOzyEnemiesInArea(character.ozyState.auraExpandir.enemiesInArea || 0);
            setOzyIntimidationThreshold(character.ozyState.auraExpandir.intimidationThreshold || 0);
            setOzyIntimidatedTargets(character.ozyState.auraExpandir.intimidatedTargets || 0);
            setOzyEgoTargets(character.ozyState.egoTargetsInRange || 0);
            setOzyAffectedCharacterIds(character.ozyState.auraExpandir.affectedCharacterIds || []);
        }
        if (character.gabrielState) {
            setTavernInfoPrice(character.gabrielState.tavern.infoPrice || 0);
            setTavernFoodPrice(character.gabrielState.tavern.foodPrice || 0);
            setTavernLodgingPrice(character.gabrielState.tavern.lodgingPrice || 0);
        }
        setMatheusMasterResult('');
        setMatheusAdditionalDamage(0);
        setMatheusTestOutcome('success');
        setMaxHealthTarget(Rules.calculateBaseMaxHealth(character));
        setMaxAuraTarget(Rules.calculateBaseMaxAura(character));
        setMaxStatsMessage('');
    }, [character]);
    
    const handleGrantPoints = () => {
        onUpdate({ 
            ...character, 
            unspentAttributePoints: character.unspentAttributePoints + attrPoints, 
            unspentProficiencyPoints: character.unspentProficiencyPoints + profPoints 
        });
        setAttrPoints(0);
        setProfPoints(0);
    };

    const handleSaveMaxStats = async () => {
        const targetHealth = Math.max(1, Math.round(maxHealthTarget));
        const targetAura = Math.max(1, Math.round(maxAuraTarget));
        const currentBaseHealth = Rules.calculateBaseMaxHealth(character);
        const currentBaseAura = Rules.calculateBaseMaxAura(character);
        const nextHealthBonus = (character.maxHealthMasterBonus || 0) + (targetHealth - currentBaseHealth);
        const nextAuraBonus = (character.maxAuraMasterBonus || 0) + (targetAura - currentBaseAura);

        const updatedCharacter: Character = {
            ...character,
            maxHealthMasterBonus: nextHealthBonus,
            maxAuraMasterBonus: nextAuraBonus,
            combatLog: [
                ...character.combatLog,
                `Mestre redefiniu os máximos base de ${character.name}: Vida ${currentBaseHealth} -> ${targetHealth}, Aura ${currentBaseAura} -> ${targetAura}.`
            ],
        };

        const updatedMaxHealth = Rules.calculateMaxHealth(updatedCharacter);
        const updatedMaxAura = Rules.calculateMaxAura(updatedCharacter);
        updatedCharacter.currentHealth = Math.min(updatedCharacter.currentHealth, updatedMaxHealth);
        updatedCharacter.currentAura = Math.min(updatedCharacter.currentAura, updatedMaxAura);

        const nextCharacters = state.characters.map(other =>
            other.id === character.id ? updatedCharacter : other
        );

        setMaxStatsMessage('');
        onUpdate(updatedCharacter);

        try {
            await persistStateNow({ ...state, characters: nextCharacters });
            setMaxStatsMessage('Máximos base salvos no Supabase.');
        } catch (error) {
            setMaxStatsMessage(error instanceof Error ? error.message : 'Falha ao salvar os máximos no Supabase.');
        }
    };

    const handleDealDamage = () => {
        let finalDamage = damageAmount;
        let logMessage: string;
        const hasZetsu = character.effects.some(effect => effect.name === 'Zetsu Ativo');

        if (isTrueDamage) {
            logMessage = `Mestre causa ${damageAmount} de dano real em ${character.name}!`;
        } else {
            const { totalReduction, baseResist, mod, attr } = Rules.calculateDamageReduction(character, damageType);
            finalDamage = Math.max(0, damageAmount - totalReduction);
            logMessage = `${character.name} sofre ${damageAmount} de dano ${damageType}, reduzido para ${finalDamage} pelas resistências naturais e efeitos ativos. (Resistência base: ${baseResist}, Mod ${attr}: ${mod})`;

            const auraExpandirExtraDamage = character.effects
                .filter(effect => effect.target === 'AuraExpandirNegativeResistanceExtra')
                .reduce((total, effect) => total + Math.max(0, effect.value), 0);
            if (auraExpandirExtraDamage > 0) {
                finalDamage += auraExpandirExtraDamage;
                logMessage += `\nResistência negativa por Aura Expandir: +${auraExpandirExtraDamage} de dano adicional.`;
            }

            if (damageType === 'Aura' && hasZetsu) {
                finalDamage *= 2;
                logMessage += `\n${character.name} está em Zetsu e sem proteção de aura: dano de aura dobrado para ${finalDamage}.`;
            }
        }

        let newHealth = character.currentHealth - finalDamage;
        let newAura = character.currentAura;
        let newEffects = [...character.effects];

        const hasEscudoBuff = character.effects.some(e => e.name.includes('Escudo Torre') && e.type === EffectType.Buff);
        if (hasEscudoBuff && finalDamage > 0) {
            const maxHealth = Rules.calculateMaxHealth(character);
            const maxAura = Rules.calculateMaxAura(character);
            newHealth = Math.min(maxHealth, newHealth + finalDamage);
            newAura = Math.min(maxAura, newAura + finalDamage);
            logMessage += `\nO buff do Escudo Torre restaura o dano sofrido para vida e aura.`;
        }

        if (newHealth < 0) {
            const lethalRolls = Array.from({ length: 3 }, () => Math.floor(Math.random() * 20) + 1);
            const lethalSuccesses = lethalRolls.filter(value => value > 10).length;
            newHealth = 1;

            if (lethalSuccesses >= 2) {
                const moribundoEffect: Effect = {
                    id: `moribundo_${Date.now()}`,
                    name: 'Moribundo',
                    type: EffectType.State,
                    target: 'State',
                    value: 1,
                    duration: 3,
                };
                newEffects = [
                    ...newEffects.filter(effect => effect.name !== 'Desmaiado' && effect.name !== 'Moribundo'),
                    moribundoEffect
                ];
                logMessage += `\nDANO LETAL! Teste 3d20: [${lethalRolls.join(', ')}] => ${lethalSuccesses} sucessos. ${character.name} permanece com 1 de vida e está MORIBUNDO.`;
            } else {
                const unconsciousEffect: Effect = {
                    id: `desmaiado_${Date.now()}`,
                    name: 'Desmaiado',
                    type: EffectType.Debuff,
                    target: 'State',
                    value: 0,
                    duration: 3,
                };
                newEffects = [
                    ...newEffects.filter(effect => effect.name !== 'Desmaiado' && effect.name !== 'Moribundo'),
                    unconsciousEffect
                ];
                logMessage += `\nDANO LETAL! Teste 3d20: [${lethalRolls.join(', ')}] => ${lethalSuccesses} sucessos. ${character.name} fica com 1 de vida e desmaia por 3 turnos.`;
            }
        }

        onUpdate({
            ...character,
            effects: newEffects,
            currentHealth: newHealth,
            currentAura: newAura,
            combatLog: [...character.combatLog, logMessage]
        });
    };

    const handleResetActions = () => {
        const totalAttacksBuff = character.effects.find(e => e.target === 'TotalAttacks' && e.type === EffectType.Buff);
        const totalAttacks = totalAttacksBuff ? totalAttacksBuff.value : 1;
        onUpdate({
            ...character,
            actions: { ...character.actions, attacks: totalAttacks, totalAttacks: totalAttacks },
            combatLog: [...character.combatLog, `Mestre reiniciou as ações de ${character.name}.`]
        });
    };

    const handleToggleOzyAffectedCharacter = (targetCharacterId: string) => {
        setOzyAffectedCharacterIds(prev => (
            prev.includes(targetCharacterId)
                ? prev.filter(id => id !== targetCharacterId)
                : [...prev, targetCharacterId]
        ));
    };

    const handleApplyOzyAuraExpandirContext = () => {
        if (!character.ozyState) return;
        const resistancePenalty = Math.max(0, Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito))
            + Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura));
        const areaMeters = Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura)
            + character.attributes[Attribute.Espirito]
            + Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));
        const shouldRequestTargetTests = character.ozyState.auraExpandir.conjurationPhase >= 1 || character.ozyState.auraPlusEgoActive;
        const shouldApplyTargetDebuffs = character.ozyState.auraExpandir.conjurationPhase >= 2 || character.ozyState.auraPlusEgoActive;
        const shouldApplyTierBuffs = character.ozyState.auraExpandir.conjurationPhase >= 3 || character.ozyState.auraPlusEgoActive;
        const tierData = buildAuraExpandirTierEffects(character, ozyIntimidatedTargets);

        const updatedCharacters = state.characters.map(targetCharacter => {
            if (targetCharacter.id === character.id) {
                const cleanedEffects = removeNamedEffectPrefixes(targetCharacter.effects, ['Aura Expandir ']);
                const refreshedEffects = shouldApplyTierBuffs
                    ? [
                        ...cleanedEffects,
                        {
                            id: `aura_expandir_upkeep_${Date.now()}`,
                            name: 'Aura Expandir Ativo',
                            type: EffectType.Buff as const,
                            target: 'State',
                            value: 1,
                            duration: Infinity,
                            turnCost: { resource: 'Aura', value: 100 },
                        },
                        ...tierData.effects,
                    ]
                    : cleanedEffects;
                return {
                    ...targetCharacter,
                    effects: refreshedEffects,
                    ozyState: {
                        ...character.ozyState!,
                        egoTargetsInRange: Math.max(0, ozyEgoTargets),
                        auraExpandir: {
                            ...character.ozyState!.auraExpandir,
                            areaMeters: Math.max(0, areaMeters),
                            alliesInArea: Math.max(0, ozyAlliesInArea),
                            enemiesInArea: Math.max(0, ozyEnemiesInArea),
                            affectedCharacterIds: ozyAffectedCharacterIds,
                            intimidationThreshold: Math.max(0, ozyIntimidationThreshold),
                            intimidatedTargets: Math.max(0, ozyIntimidatedTargets),
                            resistancePenaltyApplied: resistancePenalty,
                            isActive: character.ozyState!.auraExpandir.conjurationPhase > 0 || character.ozyState!.auraPlusEgoActive,
                        }
                    },
                    combatLog: [
                        ...targetCharacter.combatLog,
                        `Mestre atualizou Aura Expandir: aliados ${Math.max(0, ozyAlliesInArea)}, inimigos ${Math.max(0, ozyEnemiesInArea)}, corte ${Math.max(0, ozyIntimidationThreshold)}, afetados ${Math.max(0, ozyIntimidatedTargets)}${shouldApplyTierBuffs ? ` (${tierData.tierLabel})` : ''}.`
                    ]
                };
            }

            const cleanedTargetEffects = removeNamedEffectPrefixes(targetCharacter.effects, ['Aura Expandir Alvo -']);
            if (!ozyAffectedCharacterIds.includes(targetCharacter.id)) {
                if (cleanedTargetEffects.length !== targetCharacter.effects.length) {
                    return {
                        ...targetCharacter,
                        effects: cleanedTargetEffects,
                        testRequest: null,
                        combatLog: [...targetCharacter.combatLog, `Efeitos de Aura Expandir de ${character.name} removidos.`]
                    };
                }
                return targetCharacter;
            }

            if (!shouldApplyTargetDebuffs) {
                if (shouldRequestTargetTests) {
                    return {
                        ...targetCharacter,
                        effects: cleanedTargetEffects,
                        testRequest: { proficiency: Proficiency.Resistencia, testContext: 'Aura' },
                        combatLog: [
                            ...targetCharacter.combatLog,
                            `${character.name} expandiu Aura Expandir na sua área. Faça teste de Resistência (Espírito) contra corte ${Math.max(0, ozyIntimidationThreshold)}.`
                        ]
                    };
                }
                return {
                    ...targetCharacter,
                    effects: cleanedTargetEffects,
                };
            }

            const predictedBaseReduction = Rules.calculateDamageReduction(targetCharacter, 'Physical').totalReduction;
            const predictedAfterPenalty = predictedBaseReduction - resistancePenalty;
            const negativeResistanceExtraDamage = Math.max(0, Math.ceil(-predictedAfterPenalty));

            const debuffEffects: Effect[] = [
                {
                    id: `aura_expandir_target_spirit_${Date.now()}_${targetCharacter.id}`,
                    name: 'Aura Expandir Alvo - Espírito',
                    type: EffectType.Debuff,
                    target: Attribute.Espirito,
                    value: 2,
                    duration: Infinity,
                },
                {
                    id: `aura_expandir_target_resist_${Date.now()}_${targetCharacter.id}`,
                    name: 'Aura Expandir Alvo - Resistência',
                    type: EffectType.Debuff,
                    target: 'DamageReduction',
                    value: -resistancePenalty,
                    duration: Infinity,
                },
            ];

            if (negativeResistanceExtraDamage > 0) {
                debuffEffects.push({
                    id: `aura_expandir_target_vulnerable_${Date.now()}_${targetCharacter.id}`,
                    name: 'Aura Expandir Alvo - Vulnerabilidade',
                    type: EffectType.Debuff,
                    target: 'AuraExpandirNegativeResistanceExtra',
                    value: negativeResistanceExtraDamage,
                    duration: Infinity,
                });
            }

            return {
                ...targetCharacter,
                effects: [...cleanedTargetEffects, ...debuffEffects],
                testRequest: { proficiency: Proficiency.Resistencia, testContext: 'Aura' },
                combatLog: [
                    ...targetCharacter.combatLog,
                    `${character.name} aplicou Aura Expandir em você: -2 Espírito e -${resistancePenalty} de resistência. Faça teste de Resistência (Espírito) contra corte ${Math.max(0, ozyIntimidationThreshold)}.`
                ]
            };
        });

        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
    };

    const handleResolveMatheusRequest = (approved: boolean) => {
        if (!character.matheusState?.pendingRequest) return;
        const pending = character.matheusState.pendingRequest;
        const isTestSuccess = matheusTestOutcome === 'success';
        const resolvedRequest = {
            ...pending,
            status: approved ? ('approved' as const) : ('rejected' as const),
            masterResult: matheusMasterResult.trim() || (approved ? 'Aprovado pelo Mestre.' : 'Rejeitado pelo Mestre.'),
            testOutcome: isTestSuccess ? ('success' as const) : ('failure' as const),
            additionalDamage: approved && isTestSuccess ? Math.max(0, matheusAdditionalDamage) : 0,
        };

        const nextEffects = [...character.effects];
        let nextTechniques = [...character.techniques];
        let nextMatheusState = {
            ...character.matheusState,
            copiedTechniques: [...(character.matheusState.copiedTechniques || [])],
        };

        if (approved && isTestSuccess) {
            if (resolvedRequest.additionalDamage && resolvedRequest.additionalDamage > 0) {
                nextEffects.push({
                    id: `matheus_prospection_damage_${Date.now()}`,
                    name: 'Prospecção Intuitiva (Dano Extra)',
                    type: EffectType.Buff,
                    target: 'AllDamage',
                    value: resolvedRequest.additionalDamage,
                    duration: Math.max(1, pending.requestedUses || 1),
                });
            }

            if (pending.action === 'replicar') {
                const copiedName = pending.copiedTechniqueName || 'Habilidade inimiga';
                nextEffects.push({
                    id: `matheus_prospection_copy_${Date.now()}`,
                    name: `Cópia Intuitiva: ${copiedName}`,
                    type: EffectType.State,
                    target: 'State',
                    value: 1,
                    duration: Math.max(1, pending.requestedUses || 1),
                });

                if (pending.targetType === 'player' && pending.targetCharacterId && pending.copiedTechniqueName) {
                    const copiedFromCharacter = state.characters.find(other => other.id === pending.targetCharacterId);
                    const copiedTechnique = copiedFromCharacter?.techniques.find(technique => technique.name === pending.copiedTechniqueName);
                    if (copiedTechnique) {
                        const alreadyHasTechnique = nextTechniques.some(technique => technique.name === copiedTechnique.name);
                        if (!alreadyHasTechnique) {
                            nextTechniques.push({ ...copiedTechnique });
                        }

                        const grantedUses = Math.max(1, pending.requestedUses || 1);
                        const existingCopy = nextMatheusState.copiedTechniques.find(copy => copy.techniqueName === copiedTechnique.name);
                        if (existingCopy) {
                            existingCopy.usesRemaining += grantedUses;
                            existingCopy.grantedAt = Date.now();
                            if (!alreadyHasTechnique) {
                                existingCopy.addedByCopy = true;
                            }
                        } else {
                            nextMatheusState.copiedTechniques.push({
                                id: `matheus_copy_${Date.now()}_${copiedTechnique.name}`,
                                techniqueName: copiedTechnique.name,
                                sourceCharacterId: pending.targetCharacterId,
                                usesRemaining: grantedUses,
                                addedByCopy: !alreadyHasTechnique,
                                grantedAt: Date.now(),
                            });
                        }
                    }
                }
            }
        }

        if (
            approved &&
            pending.action === 'replicar' &&
            pending.targetType === 'player' &&
            pending.targetCharacterId
        ) {
            const copiedFromCharacter = state.characters.find(other => other.id === pending.targetCharacterId);
            if (copiedFromCharacter) {
                dispatch({
                    type: 'UPDATE_CHARACTER',
                    payload: {
                        ...copiedFromCharacter,
                        combatLog: [
                            ...copiedFromCharacter.combatLog,
                            `Mestre validou Prospecção Intuitiva: ${character.name} copiou ${pending.copiedTechniqueName || 'uma habilidade'} de ${copiedFromCharacter.name}.`
                        ]
                    }
                });
            }
        }

        onUpdate({
            ...character,
            effects: nextEffects,
            techniques: nextTechniques,
            paradoxState: (() => {
                const shouldGrantParadoxState = approved
                    && isTestSuccess
                    && pending.action === 'replicar'
                    && pending.copiedTechniqueName === 'Paradoxo do Conjurador'
                    && !character.paradoxState;

                if (!shouldGrantParadoxState) return character.paradoxState;
                return {
                    isActive: false,
                    question: '',
                    playerAnswer: null,
                    nextUseCostDoubled: false,
                    isEquationOfDestinyActive: false,
                    forceNextBuff: false,
                    forceNextDebuff: false,
                    activeNeutralWeapon: false,
                    selectedEquipment: null,
                    preparedExtraShots: 0,
                };
            })(),
            matheusState: {
                ...nextMatheusState,
                pendingRequest: null,
                lastResolvedRequest: resolvedRequest,
            },
            combatLog: [
                ...character.combatLog,
                `Mestre ${approved ? 'aprovou' : 'rejeitou'} Prospecção Intuitiva: ${resolvedRequest.masterResult}${approved ? ` | Teste de Espírito: ${isTestSuccess ? 'sucesso' : 'falha'}` : ''}`
            ]
        });
        setMatheusMasterResult('');
        setMatheusAdditionalDamage(0);
        setMatheusTestOutcome('success');
    };

    const handleResolveGabrielEscudoRequest = (approved: boolean) => {
        if (!character.gabrielState?.pendingEscudoRequest) return;
        const pending = character.gabrielState.pendingEscudoRequest;
        const masterText = gabrielEscudoMasterText.trim() || (approved ? 'Efeito aprovado.' : 'Efeito rejeitado.');
        const numericValue = Math.max(0, gabrielEscudoNumericValue);
        const targetCharacterId = pending.targetCharacterId || character.id;
        const targetCharacter = state.characters.find(other => other.id === targetCharacterId) || character;

        const updatedCharacters = state.characters.map(other => {
            if (other.id === character.id) {
                return {
                    ...other,
                    gabrielState: {
                        ...character.gabrielState!,
                        armedEscudoDoMestre: false,
                        escudoDoMestreUsesRemaining: approved
                            ? Math.max(0, character.gabrielState!.escudoDoMestreUsesRemaining - 1)
                            : character.gabrielState!.escudoDoMestreUsesRemaining,
                        pendingEscudoRequest: null,
                    },
                    combatLog: [
                        ...other.combatLog,
                        `Mestre ${approved ? 'aprovou' : 'rejeitou'} Escudo do Mestre: ${masterText}`
                    ]
                };
            }
            if (!approved || other.id !== targetCharacter.id) return other;

            const updatedTarget = { ...other, effects: [...other.effects], combatLog: [...other.combatLog] };
            if (pending.kind === 'cura') {
                const maxHealth = Rules.calculateMaxHealth(updatedTarget);
                const maxAura = Rules.calculateMaxAura(updatedTarget);
                const healValue = Math.max(0, numericValue);
                updatedTarget.currentHealth = Math.min(maxHealth, updatedTarget.currentHealth + healValue);
                updatedTarget.currentAura = Math.min(maxAura, updatedTarget.currentAura + healValue);
                updatedTarget.combatLog.push(`Escudo do Mestre aplicado por Gabriel: cura de ${healValue} em vida e aura.`);
                return updatedTarget;
            }

            if (numericValue > 0) {
                let target: Effect['target'] = 'State';
                if (pending.kind === 'dano_extra') target = 'AllDamage';
                if (pending.kind === 'resistencia') target = 'DamageReduction';
                if (pending.kind === 'atributo') target = Attribute.Corpo;
                if (pending.kind === 'pericia') target = Proficiency.DominioDeAura;
                if (pending.kind === 'vida') target = 'VidaMaxima';
                if (pending.kind === 'aura') target = 'AuraMaxima';

                updatedTarget.effects.push({
                    id: `gabriel_escudo_effect_${Date.now()}_${updatedTarget.id}`,
                    name: `Escudo do Mestre (${pending.kind})`,
                    type: EffectType.Buff,
                    target,
                    value: numericValue,
                    duration: pending.kind === 'narrativo' ? 1 : 3,
                });
            }
            updatedTarget.combatLog.push(`Escudo do Mestre aplicado por Gabriel: ${masterText}`);
            return updatedTarget;
        });

        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
        setGabrielEscudoMasterText('');
        setGabrielEscudoNumericValue(0);
    };

    const handleResolveGabrielHouseRule = (approved: boolean) => {
        if (!character.gabrielState?.pendingHouseRuleRequest) return;
        const pending = character.gabrielState.pendingHouseRuleRequest;
        const validatedUses = Math.max(1, Math.min(3, gabrielHouseShieldUsesCost || pending.proposedShieldUsesCost || 1));
        const validatedText = gabrielHouseMasterText.trim() || pending.proposedText || 'Regra validada pelo Mestre.';
        let storedRules = [...character.gabrielState.storedHouseRules];
        let activeHouseRuleId = character.gabrielState.activeHouseRuleId;
        let usesRemaining = character.gabrielState.escudoDoMestreUsesRemaining;

        if (approved) {
            if (pending.mode === 'new') {
                const ruleId = `house_rule_${Date.now()}`;
                storedRules.push({
                    id: ruleId,
                    name: pending.proposedName || `Regra ${storedRules.length + 1}`,
                    text: validatedText,
                    auraCost: 100,
                    shieldUsesCost: validatedUses,
                    createdDay: state.currentDay,
                });
                activeHouseRuleId = ruleId;
            } else {
                activeHouseRuleId = pending.ruleIdToReuse || activeHouseRuleId;
            }
            usesRemaining = Math.max(0, usesRemaining - validatedUses);
        }

        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                armedRegrasDaCasa: false,
                escudoDoMestreUsesRemaining: usesRemaining,
                pendingHouseRuleRequest: null,
                storedHouseRules: storedRules,
                activeHouseRuleId,
                activeHouseRuleUntilDay: approved ? state.currentDay : character.gabrielState.activeHouseRuleUntilDay,
            },
            combatLog: [
                ...character.combatLog,
                `Mestre ${approved ? 'aprovou' : 'rejeitou'} Regras da Casa: ${validatedText}`
            ]
        });
        setGabrielHouseMasterText('');
        setGabrielHouseShieldUsesCost(1);
    };

    const handleResolveGabrielTokenRequest = (approved: boolean) => {
        if (!character.gabrielState?.pendingTokenAdjustRequest) return;
        const request = character.gabrielState.pendingTokenAdjustRequest;
        const explicitText = gabrielTokenMasterText.trim();
        const targetCharacter = request.targetCharacterId
            ? state.characters.find(other => other.id === request.targetCharacterId)
            : state.characters.find(other => other.name === request.target);
        const gabrielSpiritMod = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));
        const gabrielMindMod = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Mente));
        const dc = 10 + gabrielSpiritMod + gabrielMindMod;

        let finalApproved = approved;
        let resolutionText = explicitText || (approved ? 'Movimentação aprovada.' : 'Movimentação negada.');

        if (approved && request.moveType === 'self') {
            finalApproved = true;
            resolutionText = explicitText || 'Movimentação própria realizada sem teste.';
        } else if (approved && request.moveType === 'ally' && targetCharacter) {
            if (request.allyIsVoluntary) {
                finalApproved = true;
                resolutionText = explicitText || `${targetCharacter.name} aceitou ser movido voluntariamente.`;
            } else {
                const roll = Math.floor(Math.random() * 20) + 1;
                const resistance = Rules.getEffectiveProficiency(targetCharacter, Proficiency.Resistencia);
                const spiritMod = Rules.calculateModifier(Rules.getEffectiveAttribute(targetCharacter, Attribute.Espirito));
                const total = roll + resistance + spiritMod;
                finalApproved = total < dc;
                resolutionText = explicitText || `${targetCharacter.name} rolou Resistência (Espírito): ${roll} + ${resistance} + ${spiritMod} = ${total} contra CD ${dc}. ${finalApproved ? 'Foi movido.' : 'Resistiu ao movimento.'}`;
            }
        }

        const updatedCharacters = state.characters.map(other => {
            if (other.id === character.id) {
                return {
                    ...other,
                    gabrielState: {
                        ...character.gabrielState!,
                        armedAjustarTokens: false,
                        pendingTokenAdjustRequest: null,
                    },
                    combatLog: [...other.combatLog, `Mestre ${finalApproved ? 'aprovou' : 'rejeitou'} Ajustar Tokens: ${resolutionText}`]
                };
            }
            if (targetCharacter && other.id === targetCharacter.id) {
                return {
                    ...other,
                    combatLog: [...other.combatLog, `Ajustar Tokens de Gabriel: ${resolutionText}`]
                };
            }
            return other;
        });

        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
        setGabrielTokenMasterText('');
    };

    const handleUpdateTavernCatalog = () => {
        if (!character.gabrielState) return;
        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                tavern: {
                    ...character.gabrielState.tavern,
                    infoPrice: Math.max(0, tavernInfoPrice),
                    foodPrice: Math.max(0, tavernFoodPrice),
                    lodgingPrice: Math.max(0, tavernLodgingPrice),
                },
            },
            combatLog: [...character.combatLog, 'Mestre atualizou os preços do Carvalho Ensandecido.']
        });
    };

    const handleAddTavernItem = () => {
        if (!character.gabrielState || !tavernItemName.trim()) return;
        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                tavern: {
                    ...character.gabrielState.tavern,
                    items: [
                        ...character.gabrielState.tavern.items,
                        { id: `item_${Date.now()}`, name: tavernItemName.trim(), price: Math.max(0, tavernItemPrice) }
                    ]
                }
            },
            combatLog: [...character.combatLog, `Mestre cadastrou item na taverna: ${tavernItemName.trim()}.`]
        });
        setTavernItemName('');
        setTavernItemPrice(0);
    };

    const handleAddTavernMission = () => {
        if (!character.gabrielState || !tavernMissionTitle.trim()) return;
        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                tavern: {
                    ...character.gabrielState.tavern,
                    missions: [
                        ...character.gabrielState.tavern.missions,
                        {
                            id: `mission_${Date.now()}`,
                            title: tavernMissionTitle.trim(),
                            description: tavernMissionDescription.trim(),
                            rewardAuraCoins: Math.max(0, tavernMissionReward),
                            completed: false,
                        }
                    ]
                }
            },
            combatLog: [...character.combatLog, `Mestre adicionou missão na taverna: ${tavernMissionTitle.trim()}.`]
        });
        setTavernMissionTitle('');
        setTavernMissionDescription('');
        setTavernMissionReward(0);
    };

    const handleCompleteTavernMission = (missionId: string) => {
        if (!character.gabrielState) return;
        const mission = character.gabrielState.tavern.missions.find(currentMission => currentMission.id === missionId);
        if (!mission || mission.completed) return;

        const updatedCharacters = state.characters.map(other => {
            if (other.id === character.id && other.gabrielState) {
                return {
                    ...other,
                    gabrielState: {
                        ...other.gabrielState,
                        tavern: {
                            ...other.gabrielState.tavern,
                            missions: other.gabrielState.tavern.missions.map(currentMission =>
                                currentMission.id === missionId ? { ...currentMission, completed: true } : currentMission
                            ),
                        },
                    },
                    combatLog: [...other.combatLog, `Missão "${mission.title}" marcada como concluída.`],
                };
            }
            if (mission.acceptedByCharacterId && other.id === mission.acceptedByCharacterId) {
                return {
                    ...other,
                    maxAuraPermanentBonus: (other.maxAuraPermanentBonus || 0) + mission.rewardAuraCoins,
                    activeTavernMissionId: other.activeTavernMissionId === missionId ? null : other.activeTavernMissionId,
                    combatLog: [...other.combatLog, `Missão "${mission.title}" concluída. Recompensa: +${mission.rewardAuraCoins} de aura máxima.`],
                };
            }
            return other;
        });

        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
    };

    const handleResolveTavernSellRequest = (sellerCharacterId: string, approved: boolean) => {
        if (!character.gabrielState) return;
        const seller = state.characters.find(other => other.id === sellerCharacterId);
        const request = seller?.pendingTavernSellRequest;
        if (!seller || !request || request.tavernOwnerCharacterId !== character.id) return;

        const approvedPriceRaw = tavernSellApprovalValues[request.id];
        const approvedPrice = Math.max(0, typeof approvedPriceRaw === 'number' ? approvedPriceRaw : request.requestedPrice);
        const canPay = character.gabrielState.tavern.bankAuraCoins >= approvedPrice;
        const finalApproved = approved && canPay;

        const updatedCharacters = state.characters.map(other => {
            if (other.id === character.id && other.gabrielState) {
                const nextBank = finalApproved
                    ? Math.max(0, other.gabrielState.tavern.bankAuraCoins - approvedPrice)
                    : other.gabrielState.tavern.bankAuraCoins;
                const nextItems = finalApproved
                    ? [
                        ...other.gabrielState.tavern.items,
                        { id: `sold_item_${Date.now()}`, name: request.itemName, price: approvedPrice }
                    ]
                    : other.gabrielState.tavern.items;

                return {
                    ...other,
                    gabrielState: {
                        ...other.gabrielState,
                        tavern: {
                            ...other.gabrielState.tavern,
                            bankAuraCoins: nextBank,
                            items: nextItems,
                        },
                    },
                    combatLog: [
                        ...other.combatLog,
                        `Mestre ${finalApproved ? 'comprou' : 'não comprou'} item de ${seller.name}: "${request.itemName}" (${approvedPrice}).`
                    ],
                };
            }
            if (other.id === sellerCharacterId) {
                return {
                    ...other,
                    pendingTavernSellRequest: null,
                    maxAuraPermanentBonus: finalApproved
                        ? (other.maxAuraPermanentBonus || 0) + approvedPrice
                        : other.maxAuraPermanentBonus,
                    combatLog: [
                        ...other.combatLog,
                        `Venda no Carvalho Ensandecido ${finalApproved ? `aprovada por ${approvedPrice}` : 'rejeitada'}.`
                    ],
                };
            }
            return other;
        });

        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
        setTavernSellApprovalValues(prev => {
            const next = { ...prev };
            delete next[request.id];
            return next;
        });
    };

    return (
        <div className="space-y-6 mt-6">
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="text-xl font-bold text-green-400 mb-3 text-center">Controles do Mestre para: {character.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-5 gap-4">
                    <div className="bg-gray-900 p-3 rounded-md space-y-2"><h4 className="font-bold text-lg text-center mb-2">Causar Dano</h4>
                        <input type="number" value={damageAmount} onChange={e => setDamageAmount(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md"/>
                        <select value={damageType} onChange={e => setDamageType(e.target.value as any)} className="w-full p-2 bg-gray-700 rounded-md text-sm"><option value="Physical">Físico</option><option value="Aura">Aura</option></select>
                        <div className="flex items-center gap-2 text-sm"><input type="checkbox" id="trueDamage" checked={isTrueDamage} onChange={e => setIsTrueDamage(e.target.checked)} className="form-checkbox h-4 w-4 text-red-600 bg-gray-700 border-gray-600 rounded"/><label htmlFor="trueDamage">Dano Real</label></div>
                        <button onClick={handleDealDamage} className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold transition">Aplicar Dano</button>
                    </div>
                    <div className="bg-gray-900 p-3 rounded-md space-y-2"><h4 className="font-bold text-lg text-center mb-2">Conceder Pontos</h4><div className="flex items-center gap-2"><label className="flex-1">Atributo:</label><input type="number" value={attrPoints} onChange={e => setAttrPoints(parseInt(e.target.value) || 0)} className="w-24 p-2 bg-gray-700 rounded-md"/></div><div className="flex items-center gap-2"><label className="flex-1">Perícia:</label><input type="number" value={profPoints} onChange={e => setProfPoints(parseInt(e.target.value) || 0)} className="w-24 p-2 bg-gray-700 rounded-md"/></div><button onClick={handleGrantPoints} className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold transition mt-auto">Conceder</button></div>
                    <div className="bg-gray-900 p-3 rounded-md space-y-2"><h4 className="font-bold text-lg text-center mb-2">Solicitar Teste</h4>
                        <select value={testProficiency} onChange={e => setTestProficiency(e.target.value as Proficiency)} className="w-full p-2 bg-gray-700 rounded-md">{ALL_PROFICIENCIES.map(p => <option key={p} value={p}>{PROFICIENCY_LABELS[p]}</option>)}</select>
                        <select value={testContext} onChange={e => setTestContext(e.target.value as any)} className="w-full p-2 bg-gray-700 rounded-md text-sm"><option value="Physical">Físico</option><option value="Aura">Aura</option><option value="Mental">Mental</option></select>
                        <button onClick={handleRequestTest} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold transition mt-auto">Solicitar</button>
                        <button onClick={handleRequestTestAll} className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 rounded-md font-semibold transition">Solicitar para Todos</button>
                    </div>
                    <div className="bg-gray-900 p-3 rounded-md space-y-2">
                        <h4 className="font-bold text-lg text-center mb-2">Máximos Base</h4>
                        <p className="text-xs text-gray-400">Defina o novo padrão persistente de Vida e Aura máximas.</p>
                        <div className="text-xs text-cyan-300">
                            Exibido agora: Vida {Rules.calculateMaxHealth(character)} | Aura {Rules.calculateMaxAura(character)}
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex-1 text-sm">Vida</label>
                            <input type="number" min={1} value={maxHealthTarget} onChange={e => setMaxHealthTarget(parseInt(e.target.value, 10) || 1)} className="w-28 p-2 bg-gray-700 rounded-md"/>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex-1 text-sm">Aura</label>
                            <input type="number" min={1} value={maxAuraTarget} onChange={e => setMaxAuraTarget(parseInt(e.target.value, 10) || 1)} className="w-28 p-2 bg-gray-700 rounded-md"/>
                        </div>
                        <button onClick={handleSaveMaxStats} className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md font-semibold transition">Salvar Novos Máximos</button>
                        {maxStatsMessage && (
                            <p className={`text-xs ${maxStatsMessage.includes('Falha') ? 'text-red-400' : 'text-emerald-300'}`}>{maxStatsMessage}</p>
                        )}
                    </div>
                    <div className="bg-gray-900 p-3 rounded-md space-y-2"><h4 className="font-bold text-lg text-center mb-2">Ações de Turno</h4><button onClick={handleResetActions} className="w-full h-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold transition">Resetar Ações</button></div>
                </div>
            </div>
            <PendingAttacksViewer attackerId={character.id} title={`Validação de Dano: ${character.name}`} showWhenEmpty={true} />
            {character.ozyState && (
                <div className="bg-gray-800 p-4 rounded-lg border border-cyan-700 space-y-3">
                    <h3 className="text-lg font-bold text-cyan-300">Aura Expandir / Ego (Ozymandias)</h3>
                    <p className="text-xs text-cyan-100/80">
                        Preencha os campos com os valores da cena: quantidades na área, corte da intimidação e alvos afetados.
                        Isso alimenta os efeitos automáticos da Aura Expandir e do Ego.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                        <div className="space-y-1">
                            <label className="text-xs text-cyan-200">Aliados na área</label>
                            <input type="number" value={ozyAlliesInArea} onChange={e => setOzyAlliesInArea(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Qtd de aliados no alcance" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-cyan-200">Inimigos na área</label>
                            <input type="number" value={ozyEnemiesInArea} onChange={e => setOzyEnemiesInArea(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Qtd de inimigos no alcance" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-cyan-200">Corte de intimidação</label>
                            <input type="number" value={ozyIntimidationThreshold} onChange={e => setOzyIntimidationThreshold(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Total do teste do Ozy" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-cyan-200">Alvos intimidados</label>
                            <input type="number" value={ozyIntimidatedTargets} onChange={e => setOzyIntimidatedTargets(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Falharam no corte" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-cyan-200">Alvos para Ego</label>
                            <input type="number" value={ozyEgoTargets} onChange={e => setOzyEgoTargets(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Qtd drenada por turno" />
                        </div>
                    </div>
                    <div className="text-xs text-cyan-100/70 space-y-1">
                        <p><span className="font-semibold">Corte de intimidação:</span> valor mínimo que cada alvo deve superar no teste de Resistência (Espírito).</p>
                        <p><span className="font-semibold">Alvos intimidados:</span> usados para aplicar os tiers da 3ª conjuração e os debuffs da 2ª conjuração.</p>
                        <p><span className="font-semibold">Alvos para Ego:</span> quantidade usada no dreno por turno (Ego passivo ou Aura + Ego).</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded-md">
                        <p className="text-sm text-cyan-200 mb-2">Alvos que recebem os efeitos da 2ª conjuração:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {state.characters
                                .filter(other => other.id !== character.id)
                                .map(other => (
                                    <label key={other.id} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={ozyAffectedCharacterIds.includes(other.id)}
                                            onChange={() => handleToggleOzyAffectedCharacter(other.id)}
                                        />
                                        {other.name}
                                    </label>
                                ))}
                        </div>
                    </div>
                    <button onClick={handleApplyOzyAuraExpandirContext} className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md font-semibold transition">
                        Aplicar Contexto da Aura Expandir
                    </button>
                </div>
            )}
            {character.matheusState?.pendingRequest && (
                <div className="bg-gray-800 p-4 rounded-lg border border-emerald-700 space-y-3">
                    <h3 className="text-lg font-bold text-emerald-300">Prospecção Intuitiva (Validação)</h3>
                    <p className="text-sm text-gray-300">
                        Ação: <span className="font-semibold">{character.matheusState.pendingRequest.action}</span> | Alvo: <span className="font-semibold">{character.matheusState.pendingRequest.target}</span>
                    </p>
                    <p className="text-xs text-cyan-300">
                        Cópia: {character.matheusState.pendingRequest.copiedTechniqueName || 'N/A'} | Usos: {character.matheusState.pendingRequest.requestedUses || 1} | Custo por uso: {character.matheusState.pendingRequest.costPerUse || 0}
                    </p>
                    <p className="text-xs text-cyan-300">
                        Teste de Espírito: d20 {character.matheusState.pendingRequest.spiritRoll ?? 0} {((character.matheusState.pendingRequest.spiritModifier ?? 0) >= 0 ? '+' : '')}{character.matheusState.pendingRequest.spiritModifier ?? 0} = {character.matheusState.pendingRequest.spiritTotal ?? 0}
                    </p>
                    <p className="text-xs text-gray-400">{character.matheusState.pendingRequest.details || 'Sem detalhes adicionais.'}</p>
                    <select
                        value={matheusTestOutcome}
                        onChange={e => setMatheusTestOutcome(e.target.value as 'success' | 'failure')}
                        className="w-full p-2 bg-gray-700 rounded-md text-sm"
                    >
                        <option value="success">Teste de Espírito: sucesso</option>
                        <option value="failure">Teste de Espírito: falha</option>
                    </select>
                    <textarea
                        value={matheusMasterResult}
                        onChange={e => setMatheusMasterResult(e.target.value)}
                        rows={2}
                        className="w-full p-2 bg-gray-700 rounded-md text-sm"
                        placeholder="Resultado narrativo ou mecânico validado pelo Mestre"
                    />
                    <input
                        type="number"
                        value={matheusAdditionalDamage}
                        onChange={e => setMatheusAdditionalDamage(parseInt(e.target.value) || 0)}
                        className="w-full p-2 bg-gray-700 rounded-md text-sm"
                        placeholder="Dano adicional (opcional)"
                        disabled={matheusTestOutcome === 'failure'}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleResolveMatheusRequest(true)} className="py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md font-semibold">Aprovar</button>
                        <button onClick={() => handleResolveMatheusRequest(false)} className="py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">Rejeitar</button>
                    </div>
                </div>
            )}
            {character.gabrielState && (
                <div className="bg-gray-800 p-4 rounded-lg border border-violet-700 space-y-4">
                    <h3 className="text-lg font-bold text-violet-300">Escudo/Regra/Taverna (Gabriel)</h3>
                    <p className="text-sm text-gray-300">Escudos disponíveis no dia: <span className="font-semibold">{character.gabrielState.escudoDoMestreUsesRemaining}/5</span></p>

                    {character.gabrielState.pendingEscudoRequest && (
                        <div className="bg-gray-900 p-3 rounded-md space-y-2">
                            <p className="text-sm"><span className="text-gray-400">Escudo do Mestre:</span> {character.gabrielState.pendingEscudoRequest.kind} -&gt; {character.gabrielState.pendingEscudoRequest.target}</p>
                            <p className="text-xs text-gray-400">{character.gabrielState.pendingEscudoRequest.text}</p>
                            <textarea value={gabrielEscudoMasterText} onChange={e => setGabrielEscudoMasterText(e.target.value)} rows={2} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Texto final validado pelo Mestre" />
                            <input type="number" value={gabrielEscudoNumericValue} onChange={e => setGabrielEscudoNumericValue(parseInt(e.target.value) || 0)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Valor numérico (opcional)" />
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleResolveGabrielEscudoRequest(true)} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold">Aprovar</button>
                                <button onClick={() => handleResolveGabrielEscudoRequest(false)} className="py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">Rejeitar</button>
                            </div>
                        </div>
                    )}

                    {character.gabrielState.pendingHouseRuleRequest && (
                        <div className="bg-gray-900 p-3 rounded-md space-y-2">
                            <p className="text-sm"><span className="text-gray-400">Regras da Casa:</span> {character.gabrielState.pendingHouseRuleRequest.mode === 'new' ? 'Nova regra' : 'Reuso'} </p>
                            <p className="text-xs text-gray-400">{character.gabrielState.pendingHouseRuleRequest.proposedText || 'Sem texto informado.'}</p>
                            <textarea value={gabrielHouseMasterText} onChange={e => setGabrielHouseMasterText(e.target.value)} rows={2} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Texto final validado pelo Mestre" />
                            <input type="number" min={1} max={3} value={gabrielHouseShieldUsesCost} onChange={e => setGabrielHouseShieldUsesCost(parseInt(e.target.value) || 1)} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Consumo de escudos (1-3)" />
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleResolveGabrielHouseRule(true)} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold">Aprovar</button>
                                <button onClick={() => handleResolveGabrielHouseRule(false)} className="py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">Rejeitar</button>
                            </div>
                        </div>
                    )}

                    {character.gabrielState.pendingTokenAdjustRequest && (
                        <div className="bg-gray-900 p-3 rounded-md space-y-2">
                            <p className="text-sm">
                                <span className="text-gray-400">Ajustar Tokens:</span> {character.gabrielState.pendingTokenAdjustRequest.moveType} em {character.gabrielState.pendingTokenAdjustRequest.target}
                            </p>
                            <textarea value={gabrielTokenMasterText} onChange={e => setGabrielTokenMasterText(e.target.value)} rows={2} className="w-full p-2 bg-gray-700 rounded-md text-sm" placeholder="Resultado do teste/validação" />
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleResolveGabrielTokenRequest(true)} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold">Aprovar</button>
                                <button onClick={() => handleResolveGabrielTokenRequest(false)} className="py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">Rejeitar</button>
                            </div>
                        </div>
                    )}

                    <div className="bg-gray-900 p-3 rounded-md space-y-2">
                        <h4 className="font-semibold text-violet-200">Carvalho Ensandecido (Configuração)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input type="number" value={tavernInfoPrice} onChange={e => setTavernInfoPrice(parseInt(e.target.value) || 0)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Preço info" />
                            <input type="number" value={tavernFoodPrice} onChange={e => setTavernFoodPrice(parseInt(e.target.value) || 0)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Preço comida" />
                            <input type="number" value={tavernLodgingPrice} onChange={e => setTavernLodgingPrice(parseInt(e.target.value) || 0)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Preço estalagem" />
                            <button onClick={handleUpdateTavernCatalog} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm">Salvar Preços</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input value={tavernItemName} onChange={e => setTavernItemName(e.target.value)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Nome do item" />
                            <input type="number" value={tavernItemPrice} onChange={e => setTavernItemPrice(parseInt(e.target.value) || 0)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Preço do item" />
                            <button onClick={handleAddTavernItem} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm">Adicionar Item</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input value={tavernMissionTitle} onChange={e => setTavernMissionTitle(e.target.value)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Título da missão" />
                            <input value={tavernMissionDescription} onChange={e => setTavernMissionDescription(e.target.value)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Descrição" />
                            <input type="number" value={tavernMissionReward} onChange={e => setTavernMissionReward(parseInt(e.target.value) || 0)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Recompensa (moedas de aura)" />
                            <button onClick={handleAddTavernMission} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm">Adicionar Missão</button>
                        </div>

                        <div className="bg-gray-800 p-3 rounded-md border border-violet-800 space-y-2">
                            <h5 className="font-semibold text-violet-200 text-sm">Missões Ativas do Carvalho</h5>
                            {character.gabrielState.tavern.missions.length === 0 ? (
                                <p className="text-xs text-gray-400">Nenhuma missão cadastrada.</p>
                            ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {character.gabrielState.tavern.missions.map(mission => {
                                        const acceptedBy = mission.acceptedByCharacterId
                                            ? state.characters.find(other => other.id === mission.acceptedByCharacterId)?.name || mission.acceptedByCharacterId
                                            : null;
                                        return (
                                            <div key={mission.id} className="bg-gray-900 p-2 rounded-md space-y-1">
                                                <p className="text-sm font-semibold text-white">{mission.title}</p>
                                                <p className="text-xs text-gray-400">{mission.description || 'Sem descrição.'}</p>
                                                <p className="text-xs text-cyan-300">Recompensa: {mission.rewardAuraCoins} moedas de aura</p>
                                                <p className="text-xs text-gray-300">
                                                    Status: {mission.completed ? 'Concluída' : acceptedBy ? `Em andamento por ${acceptedBy}` : 'Disponível'}
                                                </p>
                                                {!mission.completed && acceptedBy && (
                                                    <button
                                                        onClick={() => handleCompleteTavernMission(mission.id)}
                                                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md text-sm font-semibold"
                                                    >
                                                        Marcar Como Concluída
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-800 p-3 rounded-md border border-violet-800 space-y-2">
                            <h5 className="font-semibold text-violet-200 text-sm">Solicitações de Venda de Itens</h5>
                            <p className="text-xs text-gray-400">
                                Banco disponível: {character.gabrielState.tavern.bankAuraCoins} moedas de aura
                            </p>
                            {state.characters.filter(other => other.pendingTavernSellRequest?.tavernOwnerCharacterId === character.id).length === 0 ? (
                                <p className="text-xs text-gray-400">Nenhuma venda pendente.</p>
                            ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {state.characters
                                        .filter(other => other.pendingTavernSellRequest?.tavernOwnerCharacterId === character.id)
                                        .map(other => {
                                            const request = other.pendingTavernSellRequest!;
                                            const proposedValue = tavernSellApprovalValues[request.id] ?? request.requestedPrice;
                                            const canPay = character.gabrielState!.tavern.bankAuraCoins >= proposedValue;
                                            return (
                                                <div key={request.id} className="bg-gray-900 p-2 rounded-md space-y-2">
                                                    <p className="text-sm text-white font-semibold">{other.name}</p>
                                                    <p className="text-xs text-gray-300">Item: {request.itemName}</p>
                                                    <p className="text-xs text-gray-300">Pedido: {request.requestedPrice}</p>
                                                    <input
                                                        type="number"
                                                        value={proposedValue}
                                                        onChange={e => setTavernSellApprovalValues(prev => ({ ...prev, [request.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                        className="w-full p-2 bg-gray-700 rounded-md text-sm"
                                                        placeholder="Valor aprovado"
                                                    />
                                                    {!canPay && (
                                                        <p className="text-xs text-red-300">Banco insuficiente para este valor.</p>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => handleResolveTavernSellRequest(other.id, true)}
                                                            className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md text-sm font-semibold disabled:bg-gray-700"
                                                            disabled={!canPay}
                                                        >
                                                            Aprovar Compra
                                                        </button>
                                                        <button
                                                            onClick={() => handleResolveTavernSellRequest(other.id, false)}
                                                            className="py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm font-semibold"
                                                        >
                                                            Rejeitar
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
             <EquipmentViewer />
        </div>
    );
};


const MasterView: React.FC<MasterViewProps> = ({ user, onLogout }) => {
    const { state, dispatch } = useCharacterContext();
    const [selectedCharId, setSelectedCharId] = useState<string | null>(state.characters[0]?.id || null);
    const [isBestiaryOpen, setIsBestiaryOpen] = useState(false);

    const selectedCharacter = useMemo(() => state.characters.find(c => c.id === selectedCharId), [state.characters, selectedCharId]);

    const handleUpdateCharacter = (updatedChar: Character) => dispatch({ type: 'UPDATE_CHARACTER', payload: updatedChar });

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            <header className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-green-400">{isBestiaryOpen ? 'Bestiário (Mestre)' : 'Painel do Mestre'}</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsBestiaryOpen(prev => !prev)}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-md text-white font-semibold transition"
                    >
                        {isBestiaryOpen ? 'Voltar ao Painel' : 'Abrir Bestiário'}
                    </button>
                    <button onClick={onLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white font-semibold transition">Sair</button>
                </div>
            </header>

            {isBestiaryOpen ? (
                <BestiaryView user={user} onBack={() => setIsBestiaryOpen(false)} />
            ) : (
                <>
                    <PendingAttacksViewer />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <aside className="lg:col-span-1 space-y-6">
                            <TurnManager />
                            <InitiativeTracker />
                            <PlayerOverview onSelect={setSelectedCharId} />
                        </aside>
                        <main className="lg:col-span-2">
                            {selectedCharacter ? (
                                <div>
                                    <CharacterSheet character={selectedCharacter} isMasterView={true} onUpdate={handleUpdateCharacter} />
                                    <MasterControls character={selectedCharacter} onUpdate={handleUpdateCharacter} />
                                </div>
                            ) : (<div className="bg-gray-800 p-8 rounded-lg text-center h-full flex items-center justify-center"><p className="text-xl">Selecione um personagem na visão geral para ver os detalhes.</p></div>)}
                        </main>
                    </div>
                </>
            )}
        </div>
    );
};

export default MasterView;


