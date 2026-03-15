
import React, { createContext, useReducer, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Attribute, BestiaryState, Character, Effect, Equipment, EffectType, PendingAttack, Proficiency, Technique } from '../types';
import { initialCharacters, PARADOX_EQUIPMENT } from '../constants';
import * as Rules from '../services/rulesEngine';
import { getCampaignRealtimeTargets, loadOrSeedCampaignState, PersistedAppState, saveCampaignState } from '../services/supabaseStore';
import { supabase } from '../services/supabaseClient';

type AppState = {
    characters: Character[];
    equipment: Equipment[];
    bestiary: BestiaryState;
    turnCount: number;
    currentDay: number;
    turnOrder: string[];
    activeCharacterIndex: number;
}

type Action =
    | { type: 'HYDRATE_STATE'; payload: AppState }
    | { type: 'SET_CHARACTERS'; payload: Character[] }
    | { type: 'SET_BESTIARY'; payload: BestiaryState }
    | { type: 'UPDATE_CHARACTER'; payload: Character }
    | { type: 'ADD_CHARACTER'; payload: Character }
    | { type: 'UPDATE_EQUIPMENT', payload: Equipment }
    | { type: 'ADVANCE_ROUND' }
    | { type: 'RESET_TURNS' }
    | { type: 'SET_TURN_ORDER'; payload: string[] }
    | { type: 'NEXT_TURN' }
    | { type: 'START_TURN'; payload: { characterId: string } }
    | { type: 'SUBMIT_ATTACK'; payload: PendingAttack }
    | { type: 'VALIDATE_ATTACK'; payload: { attackId: string; validatedDamage: number } }
    | { type: 'ADVANCE_DAY' }
    | { type: 'GENERAL_RESTORATION' };

type CharacterContextType = {
    state: AppState,
    dispatch: React.Dispatch<Action>;
    isHydrated: boolean;
    syncError: string | null;
    persistStateNow: (nextState?: PersistedAppState) => Promise<void>;
};

const CharacterContext = createContext<CharacterContextType | undefined>(undefined);

const rollD4 = (): number => Math.floor(Math.random() * 4) + 1;

const sanitizeOzyState = (char: Character) => {
    if (!char.ozyState) return undefined;
    return {
        ...char.ozyState,
        auraExpandir: {
            ...char.ozyState.auraExpandir,
            conjurationPhase: Math.max(0, Math.min(3, char.ozyState.auraExpandir.conjurationPhase)) as 0 | 1 | 2 | 3,
            areaMeters: Math.max(0, char.ozyState.auraExpandir.areaMeters || 0),
            alliesInArea: Math.max(0, char.ozyState.auraExpandir.alliesInArea || 0),
            enemiesInArea: Math.max(0, char.ozyState.auraExpandir.enemiesInArea || 0),
            affectedCharacterIds: Array.isArray(char.ozyState.auraExpandir.affectedCharacterIds)
                ? char.ozyState.auraExpandir.affectedCharacterIds
                : [],
            intimidationThreshold: Math.max(0, char.ozyState.auraExpandir.intimidationThreshold || 0),
            intimidatedTargets: Math.max(0, char.ozyState.auraExpandir.intimidatedTargets || 0),
            resistancePenaltyApplied: char.ozyState.auraExpandir.resistancePenaltyApplied || 0,
        },
        egoTargetsInRange: Math.max(0, char.ozyState.egoTargetsInRange || 0),
    };
};

const sanitizeGabrielState = (char: Character) => {
    if (!char.gabrielState) return undefined;
    return {
        ...char.gabrielState,
        escudoDoMestreUsesRemaining: Math.max(0, char.gabrielState.escudoDoMestreUsesRemaining ?? 5),
        armedEscudoDoMestre: Boolean(char.gabrielState.armedEscudoDoMestre),
        armedRegrasDaCasa: Boolean(char.gabrielState.armedRegrasDaCasa),
        armedAjustarTokens: Boolean(char.gabrielState.armedAjustarTokens),
        dailyInteractionsUsed: Math.max(0, char.gabrielState.dailyInteractionsUsed ?? 0),
        activeHouseRuleUntilDay: char.gabrielState.activeHouseRuleUntilDay ?? null,
        tavern: {
            ...char.gabrielState.tavern,
            isActive: Boolean(char.gabrielState.tavern?.isActive),
            activeUntilDay: char.gabrielState.tavern?.activeUntilDay ?? null,
            bankAuraCoins: Math.max(0, char.gabrielState.tavern?.bankAuraCoins || 0),
            infoPrice: Math.max(0, char.gabrielState.tavern?.infoPrice || 0),
            foodPrice: Math.max(0, char.gabrielState.tavern?.foodPrice || 0),
            lodgingPrice: Math.max(0, char.gabrielState.tavern?.lodgingPrice || 0),
            items: Array.isArray(char.gabrielState.tavern?.items) ? char.gabrielState.tavern.items : [],
            missions: Array.isArray(char.gabrielState.tavern?.missions) ? char.gabrielState.tavern.missions : [],
        }
    };
};

const sanitizeMatheusState = (char: Character) => {
    if (!char.matheusState) return undefined;
    return {
        ...char.matheusState,
        isChoosingProspectionAction: Boolean(char.matheusState.isChoosingProspectionAction),
        pendingRequest: char.matheusState.pendingRequest || null,
        lastResolvedRequest: char.matheusState.lastResolvedRequest || null,
        copiedTechniques: Array.isArray(char.matheusState.copiedTechniques)
            ? char.matheusState.copiedTechniques.map(copy => ({
                ...copy,
                usesRemaining: Math.max(0, copy.usesRemaining || 0),
                addedByCopy: Boolean(copy.addedByCopy),
                grantedAt: copy.grantedAt || Date.now(),
            }))
            : [],
    };
};

const hasOzyAbilityActive = (char: Character, effects: Effect[]): boolean => {
    const hasAuraExpandir = char.ozyState?.auraExpandir.isActive || false;
    const hasAuraPlusEgo = char.ozyState?.auraPlusEgoActive || false;
    const hasAnyActiveTechnique = effects.some(effect => effect.duration === Infinity || effect.duration > 0);
    return hasAuraExpandir || hasAuraPlusEgo || hasAnyActiveTechnique;
};

const removeEffectByNamePrefixes = (effects: Effect[], prefixes: string[]): Effect[] => {
    return effects.filter(effect => !prefixes.some(prefix => effect.name.startsWith(prefix)));
};

const createDefaultBestiaryState = (): BestiaryState => ({
    monsters: [],
    notes: [],
});

const sanitizeBestiaryState = (bestiary?: Partial<BestiaryState>): BestiaryState => {
    const monsters = Array.isArray(bestiary?.monsters) ? bestiary!.monsters : [];
    const notes = Array.isArray(bestiary?.notes) ? bestiary!.notes : [];

    return {
        monsters: monsters.map(monster => ({
            ...monster,
            imageUrl: monster.imageUrl || '',
            averageWeight: monster.averageWeight || '',
            averageHeight: monster.averageHeight || '',
            threatLevel: monster.threatLevel || '',
            weakness: monster.weakness || '',
            strongPoint: monster.strongPoint || '',
            isVisibleToPlayers: Boolean(monster.isVisibleToPlayers),
            createdAt: monster.createdAt || Date.now(),
            updatedAt: monster.updatedAt || Date.now(),
        })),
        notes: notes.map(note => ({
            ...note,
            status: note.status || 'pending',
            characterColor: note.characterColor || '#93c5fd',
            createdAt: note.createdAt || Date.now(),
        })),
    };
};

const buildStateSignature = (state: PersistedAppState): string => {
    return JSON.stringify({
        characters: state.characters,
        equipment: state.equipment,
        bestiary: state.bestiary,
        turnCount: state.turnCount,
        currentDay: state.currentDay,
        turnOrder: state.turnOrder,
        activeCharacterIndex: state.activeCharacterIndex,
    });
};

const appReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case 'HYDRATE_STATE':
            return action.payload;
        case 'SET_CHARACTERS':
            return { ...state, characters: action.payload };
        case 'SET_BESTIARY':
            return { ...state, bestiary: action.payload };
        case 'UPDATE_CHARACTER':
            const previousCharacter = state.characters.find(char => char.id === action.payload.id);
            if (previousCharacter?.ozyState) {
                const wasAuraExpandirActive = previousCharacter.ozyState.auraExpandir.isActive || previousCharacter.ozyState.auraPlusEgoActive;
                const isAuraExpandirActive = action.payload.ozyState
                    ? (action.payload.ozyState.auraExpandir.isActive || action.payload.ozyState.auraPlusEgoActive)
                    : false;

                if (wasAuraExpandirActive && !isAuraExpandirActive) {
                    const affectedIds = previousCharacter.ozyState.auraExpandir.affectedCharacterIds || [];
                    return {
                        ...state,
                        characters: state.characters.map(char => {
                            if (char.id === action.payload.id) {
                                return action.payload;
                            }
                            if (!affectedIds.includes(char.id)) {
                                return char;
                            }
                            const cleanedEffects = removeEffectByNamePrefixes(char.effects, ['Aura Expandir Alvo -']);
                            if (cleanedEffects.length === char.effects.length) {
                                return char;
                            }
                            return {
                                ...char,
                                effects: cleanedEffects,
                                combatLog: [...char.combatLog, `Efeitos de Aura Expandir de ${action.payload.name} foram encerrados.`],
                            };
                        })
                    };
                }
            }
            return { ...state, characters: state.characters.map(char => char.id === action.payload.id ? action.payload : char) };
        case 'ADD_CHARACTER':
            const newTurnOrder = [...state.turnOrder, action.payload.id];
            return { ...state, characters: [...state.characters, action.payload], turnOrder: newTurnOrder };
        case 'UPDATE_EQUIPMENT':
            return { ...state, equipment: state.equipment.map(item => item.id === action.payload.id ? action.payload : item) };
        case 'RESET_TURNS':
            return { ...state, turnCount: 0 };
        case 'SET_TURN_ORDER':
            return { ...state, turnOrder: action.payload };
        case 'START_TURN': {
            return {
                ...state,
                characters: state.characters.map(char => {
                    if (char.id === action.payload.characterId) {
                        const totalAttacksBuff = char.effects.find(e => e.target === 'TotalAttacks' && e.type === EffectType.Buff);
                        const totalAttacks = totalAttacksBuff ? totalAttacksBuff.value : 1;
                        return { ...char, actions: { ...char.actions, attacks: totalAttacks, totalAttacks: totalAttacks } };
                    }
                    return char;
                })
            }
        }
        case 'NEXT_TURN': {
            if (state.turnOrder.length === 0) return state;
            const nextIndex = (state.activeCharacterIndex + 1) % state.turnOrder.length;
            return { ...state, activeCharacterIndex: nextIndex };
        }
        case 'SUBMIT_ATTACK': {
            return {
                ...state,
                characters: state.characters.map(char => 
                    char.id === action.payload.attackerId 
                        ? { ...char, pendingAttack: action.payload }
                        : char
                )
            };
        }
        case 'VALIDATE_ATTACK': {
            const { attackId, validatedDamage } = action.payload;
            const attacker = state.characters.find(c => c.pendingAttack?.attackId === attackId);
            if (!attacker || !attacker.pendingAttack) return state;
            
            const { attackType, hasParadoxBuff, weaponId, hitCount } = attacker.pendingAttack;
            const safeValidatedDamage = Math.max(0, validatedDamage);
            const paradoxBonus = hasParadoxBuff && weaponId
                ? Rules.calculateParadoxValidationBonus(safeValidatedDamage, weaponId)
                : 0;
            const finalValidatedDamage = safeValidatedDamage + paradoxBonus;

            let finalLogMessage = `Mestre valida o ataque de ${attacker.name} com ${attackType}. Dano base validado: ${safeValidatedDamage}. Dano efetivo final: ${finalValidatedDamage}.`;
            if (paradoxBonus > 0 && weaponId) {
                finalLogMessage += `\nBônus do Paradoxo da arma ${weaponId}: +${paradoxBonus}.`;
            }
            if (hitCount && hitCount > 1) {
                finalLogMessage += `\nInstâncias de dano consideradas: ${hitCount}.`;
            }

            // Create a mutable copy for updates
            let updatedAttacker = { ...attacker };

            // Handle specific weapon effects based on validated damage
            if (weaponId === 6) {
                const maxHealth = Rules.calculateMaxHealth(updatedAttacker);
                const maxAura = Rules.calculateMaxAura(updatedAttacker);
                updatedAttacker.currentHealth = Math.min(maxHealth, updatedAttacker.currentHealth + finalValidatedDamage);
                updatedAttacker.currentAura = Math.min(maxAura, updatedAttacker.currentAura + finalValidatedDamage);
                finalLogMessage += `\nO Chicote Elétrico drena ${finalValidatedDamage} de vida e aura para ${attacker.name}.`;
            }
            if (weaponId === 8) {
                finalLogMessage += `\nO disparo de energia do martelo causa ${finalValidatedDamage} de dano adicional.`;
            }

            const hasEscudoBuff = updatedAttacker.effects.some(
                e => e.name.includes('Escudo Torre') && e.type === EffectType.Buff
            );
            if (hasEscudoBuff && finalValidatedDamage > 0) {
                const maxHealth = Rules.calculateMaxHealth(updatedAttacker);
                const maxAura = Rules.calculateMaxAura(updatedAttacker);
                updatedAttacker.currentHealth = Math.min(maxHealth, updatedAttacker.currentHealth + finalValidatedDamage);
                updatedAttacker.currentAura = Math.min(maxAura, updatedAttacker.currentAura + finalValidatedDamage);
                finalLogMessage += `\nBuff do Escudo Torre: ${attacker.name} recupera ${finalValidatedDamage} de vida e aura pelo dano causado.`;
            }
            
            updatedAttacker.combatLog = [...attacker.combatLog, finalLogMessage];
            updatedAttacker.pendingAttack = null;

            return {
                ...state,
                characters: state.characters.map(char => 
                    char.id === updatedAttacker.id ? updatedAttacker : char
                )
            };
        }
        case 'ADVANCE_ROUND': {
            const nextTurn = state.turnCount + 1;
            const updatedCharacters = state.characters.map(char => {
                let newAura = char.currentAura;
                let newHealth = char.currentHealth;
                let newMaxAuraPermanentBonus = char.maxAuraPermanentBonus || 0;
                let newMaxHealthPermanentBonus = char.maxHealthPermanentBonus || 0;
                const newLog = [...char.combatLog];
                let updatedOzyState = sanitizeOzyState(char);
                let updatedGabrielState = sanitizeGabrielState(char);

                const activeEffects = char.effects.filter(effect => effect.duration > 0);
                const expiredEffectNames = char.effects.filter(effect => effect.duration === 1).map(e => e.name);

                let updatedEffects = activeEffects.map(effect => {
                    if (effect.turnCost) {
                        if (effect.turnCost.resource === 'Aura') {
                            newAura -= effect.turnCost.value;
                            newLog.push(`Turno ${nextTurn}: ${effect.name} drenou ${effect.turnCost.value} de aura.`);
                        } else if (effect.turnCost.resource === 'Health') {
                            newHealth -= effect.turnCost.value;
                            newLog.push(`Turno ${nextTurn}: ${effect.name} drenou ${effect.turnCost.value} de vida.`);
                        }
                    }
                    return { ...effect, duration: effect.duration - 1 };
                }).filter(effect => effect.duration > 0 || effect.duration === Infinity);

                if (expiredEffectNames.length > 0) {
                    newLog.push(`Turno ${nextTurn}: Efeitos expiraram - ${expiredEffectNames.join(', ')}.`);
                }

                if (updatedOzyState) {
                    const dominio = Rules.getEffectiveProficiency(char, Proficiency.DominioDeAura);
                    const espiritoBruto = char.attributes[Attribute.Espirito];
                    const espiritoMod = Rules.calculateModifier(Rules.getEffectiveAttribute(char, Attribute.Espirito));
                    const baseDrainPerTarget = Math.max(0, dominio + espiritoBruto + espiritoMod);
                    const targets = Math.max(0, updatedOzyState.egoTargetsInRange);

                    if (updatedOzyState.auraPlusEgoActive && targets > 0) {
                        const roll = rollD4();
                        const absorbed = baseDrainPerTarget * roll * targets;
                        const maxAura = Rules.calculateMaxAura(char);
                        const maxHealth = Rules.calculateMaxHealth(char);

                        if (updatedOzyState.auraPlusEgoConversion === 'heal_health') {
                            newHealth = Math.min(maxHealth, newHealth + absorbed);
                            newLog.push(`Turno ${nextTurn}: Aura + Ego absorveu ${absorbed} de energia e converteu em cura de vida.`);
                        } else if (updatedOzyState.auraPlusEgoConversion === 'heal_aura') {
                            newAura = Math.min(maxAura, newAura + absorbed);
                            newLog.push(`Turno ${nextTurn}: Aura + Ego absorveu ${absorbed} de energia e converteu em aura.`);
                        } else if (updatedOzyState.auraPlusEgoConversion === 'max_health') {
                            const gain = Math.ceil(absorbed * 0.1);
                            newMaxHealthPermanentBonus += gain;
                            newLog.push(`Turno ${nextTurn}: Aura + Ego converteu ${gain} em vida máxima permanente.`);
                        } else if (updatedOzyState.auraPlusEgoConversion === 'max_aura') {
                            const gain = Math.ceil(absorbed * 0.1);
                            newMaxAuraPermanentBonus += gain;
                            newLog.push(`Turno ${nextTurn}: Aura + Ego converteu ${gain} em aura máxima permanente.`);
                        }

                        const damageExtra = (Rules.getEffectiveProficiency(char, Proficiency.Marcialidade) + dominio + espiritoMod) * targets;
                        updatedEffects = removeEffectByNamePrefixes(updatedEffects, ['Aura + Ego Dano Extra']);
                        updatedEffects.push({
                            id: `ozy_aura_plus_ego_dmg_${Date.now()}`,
                            name: 'Aura + Ego Dano Extra',
                            type: EffectType.Buff,
                            target: 'AllDamage',
                            value: damageExtra,
                            duration: 1,
                        });
                    } else if (updatedOzyState.passiveEgoEnabled && targets > 0 && hasOzyAbilityActive(char, updatedEffects)) {
                        const secretRoll = Math.floor(Math.random() * 20) + 1 + dominio;
                        if (secretRoll >= 15) {
                            const absorbed = baseDrainPerTarget * targets;
                            const maxAura = Rules.calculateMaxAura(char);
                            newAura = Math.min(maxAura, newAura + absorbed);
                            newLog.push(`Turno ${nextTurn}: Ego absorveu ${absorbed} de aura de ${targets} alvo(s).`);
                        } else {
                            newLog.push(`Turno ${nextTurn}: Ego falhou no teste secreto de drenagem.`);
                        }
                    }
                }
                
                // Reset actions for the new round
                const totalAttacksBuff = updatedEffects.find(e => e.target === 'TotalAttacks' && e.type === EffectType.Buff);
                const totalAttacks = totalAttacksBuff ? totalAttacksBuff.value : 1;
                const newActions = { attacks: totalAttacks, totalAttacks: totalAttacks };
                newLog.push(`Turno ${nextTurn}: Ações de ${char.name} foram restauradas.`);

                return {
                    ...char,
                    effects: updatedEffects,
                    currentAura: newAura,
                    currentHealth: newHealth,
                    combatLog: newLog,
                    actions: newActions,
                    ozyState: updatedOzyState,
                    gabrielState: updatedGabrielState,
                    maxAuraPermanentBonus: newMaxAuraPermanentBonus,
                    maxHealthPermanentBonus: newMaxHealthPermanentBonus,
                };
            });

            return { ...state, characters: updatedCharacters, turnCount: nextTurn, activeCharacterIndex: 0 };
        }
        case 'ADVANCE_DAY': {
            const nextDay = state.currentDay + 1;
            const updatedCharacters = state.characters.map(char => {
                const maxHealth = Rules.calculateMaxHealth(char);
                const maxAura = Rules.calculateMaxAura(char);
                const sanitizedGabriel = sanitizeGabrielState(char);
                const updatedGabrielState = sanitizedGabriel
                    ? {
                        ...sanitizedGabriel,
                        escudoDoMestreUsesRemaining: 5,
                        armedEscudoDoMestre: false,
                        armedRegrasDaCasa: false,
                        armedAjustarTokens: false,
                        dailyInteractionsUsed: 0,
                        activeHouseRuleId: null,
                        activeHouseRuleUntilDay: null,
                    }
                    : undefined;

                if (updatedGabrielState?.tavern.activeUntilDay && updatedGabrielState.tavern.activeUntilDay <= nextDay) {
                    updatedGabrielState.tavern = {
                        ...updatedGabrielState.tavern,
                        isActive: false,
                    };
                }

                return {
                    ...char,
                    currentHealth: Math.min(maxHealth, char.currentHealth),
                    currentAura: Math.min(maxAura, char.currentAura),
                    gabrielState: updatedGabrielState,
                    tavernDailyInteractionsUsed: 0,
                    tavernUsedOptions: [],
                    tavernLastInteractionRound: -1,
                    pendingTavernSellRequest: null,
                    activeTavernMissionId: null,
                    combatLog: [...char.combatLog, `Mestre avançou para o dia ${nextDay}. Recursos diários foram atualizados.`],
                };
            });

            return {
                ...state,
                currentDay: nextDay,
                characters: updatedCharacters,
            };
        }
        case 'GENERAL_RESTORATION': {
            const updatedCharacters = state.characters.map(char => {
                const maxHealth = Rules.calculateMaxHealth(char);
                const maxAura = Rules.calculateMaxAura(char);
                const updatedGabrielState = sanitizeGabrielState(char);

                const persistentEffects = char.effects.filter(effect => effect.name === 'Ten Ativo');
                const totalAttacksBuff = persistentEffects.find(e => e.target === 'TotalAttacks' && e.type === EffectType.Buff);
                const totalAttacks = totalAttacksBuff ? totalAttacksBuff.value : 1;

                return {
                    ...char,
                    currentHealth: maxHealth,
                    currentAura: maxAura,
                    tempHealth: 0,
                    barriers: 0,
                    pendingAttack: null,
                    testRequest: null,
                    effects: persistentEffects,
                    actions: { attacks: totalAttacks, totalAttacks },
                    gabrielState: updatedGabrielState,
                    combatLog: [...char.combatLog, 'Mestre aplicou Restauração Geral: vida e aura cheias, ações resetadas e efeitos temporários removidos.'],
                };
            });

            return {
                ...state,
                characters: updatedCharacters,
            };
        }
        default:
            return state;
    }
};

export const CharacterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const emptyState: AppState = {
        characters: [],
        equipment: [],
        bestiary: createDefaultBestiaryState(),
        turnCount: 0,
        currentDay: 1,
        turnOrder: [],
        activeCharacterIndex: 0,
    };

    const [state, dispatch] = useReducer(appReducer, emptyState);
    const [isHydrated, setIsHydrated] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const saveTimeoutRef = useRef<number | null>(null);
    const realtimeRefreshTimeoutRef = useRef<number | null>(null);
    const isRealtimeSyncInFlightRef = useRef(false);
    const skipNextAutoSaveRef = useRef(false);
    const lastStateSignatureRef = useRef('');

    const normalizeLoadedState = (loaded: Partial<PersistedAppState>): AppState => {
        const loadedCharacters = Array.isArray(loaded.characters) ? loaded.characters : [];
        const loadedEquipment = Array.isArray(loaded.equipment) ? loaded.equipment : [];

        const techniqueTemplateByName = initialCharacters.reduce((acc, templateChar) => {
            templateChar.techniques.forEach(templateTechnique => {
                acc.set(templateTechnique.name, templateTechnique);
            });
            return acc;
        }, new Map<string, Technique>());
        const characterTemplateById = initialCharacters.reduce((acc, templateChar) => {
            acc.set(templateChar.id, templateChar);
            return acc;
        }, new Map<string, Character>());

        const normalizeTechniqueName = (name: string): string => {
            if (
                name === 'Equacao do Destino' ||
                (name.toLowerCase().includes('equa') && name.toLowerCase().includes('destino'))
            ) {
                return 'Equação do Destino';
            }
            return name;
        };

        const sanitizedCharacters = loadedCharacters.map((character: Character) => {
            const normalizedTechniques = (character.techniques || []).map((technique: Technique) => {
                const normalizedName = normalizeTechniqueName(technique.name);
                const template = techniqueTemplateByName.get(normalizedName);
                if (!template) {
                    return { ...technique, name: normalizedName };
                }
                return {
                    ...technique,
                    name: template.name,
                    type: template.type,
                    baseCost: template.baseCost,
                    description: template.description,
                };
            });

            const templateCharacter = characterTemplateById.get(character.id);
            const missingTemplateTechniques = (templateCharacter?.techniques || []).filter(templateTechnique =>
                !normalizedTechniques.some(existingTechnique => existingTechnique.name === templateTechnique.name)
            );
            const mergedTechniques = [...normalizedTechniques, ...missingTemplateTechniques];

            return {
                ...(templateCharacter || {}),
                ...character,
                attributes: {
                    ...(templateCharacter?.attributes || {}),
                    ...(character.attributes || {}),
                },
                proficiencies: {
                    ...(templateCharacter?.proficiencies || {}),
                    ...(character.proficiencies || {}),
                },
                techniques: mergedTechniques,
                pendingAttack: character.pendingAttack || null,
                tavernDailyInteractionsUsed: Math.max(0, character.tavernDailyInteractionsUsed || 0),
                tavernUsedOptions: Array.isArray(character.tavernUsedOptions) ? character.tavernUsedOptions : [],
                tavernLastInteractionRound: typeof character.tavernLastInteractionRound === 'number' ? character.tavernLastInteractionRound : -1,
                pendingTavernSellRequest: character.pendingTavernSellRequest || null,
                activeTavernMissionId: character.activeTavernMissionId || null,
                age: character.age ?? templateCharacter?.age ?? '',
                backstory: character.backstory ?? templateCharacter?.backstory ?? '',
                motivations: character.motivations ?? templateCharacter?.motivations ?? '',
                inventory: character.inventory ?? templateCharacter?.inventory ?? '',
                wealth: typeof character.wealth === 'number' ? character.wealth : (templateCharacter?.wealth ?? 0),
                imageUrl: character.imageUrl ?? templateCharacter?.imageUrl,
                maxAuraMasterBonus: character.maxAuraMasterBonus || 0,
                maxHealthMasterBonus: character.maxHealthMasterBonus || 0,
                maxAuraPermanentBonus: character.maxAuraPermanentBonus || 0,
                maxHealthPermanentBonus: character.maxHealthPermanentBonus || 0,
                paradoxState: character.paradoxState
                    ? { ...character.paradoxState, preparedExtraShots: character.paradoxState.preparedExtraShots || 0 }
                    : character.paradoxState,
                ozyState: sanitizeOzyState(character) || templateCharacter?.ozyState,
                matheusState: sanitizeMatheusState(character) || templateCharacter?.matheusState,
                gabrielState: sanitizeGabrielState(character) || templateCharacter?.gabrielState,
            };
        });

        const existingCharacterIds = new Set(sanitizedCharacters.map(character => character.id));
        const missingInitialCharacters = initialCharacters.filter(character => !existingCharacterIds.has(character.id));
        const mergedCharacters = [...sanitizedCharacters, ...missingInitialCharacters];
        const mergedCharacterIds = mergedCharacters.map(character => character.id);

        const savedTurnOrder = Array.isArray(loaded.turnOrder) ? loaded.turnOrder : [];
        const sanitizedTurnOrder = [
            ...savedTurnOrder.filter(id => mergedCharacterIds.includes(id)),
            ...mergedCharacterIds.filter(id => !savedTurnOrder.includes(id)),
        ];
        const safeActiveCharacterIndex = Math.min(
            Math.max(0, loaded.activeCharacterIndex || 0),
            Math.max(0, sanitizedTurnOrder.length - 1)
        );

        return {
            characters: mergedCharacters,
            equipment: loadedEquipment.length > 0 ? loadedEquipment : PARADOX_EQUIPMENT,
            bestiary: sanitizeBestiaryState(loaded.bestiary),
            turnCount: loaded.turnCount || 0,
            currentDay: loaded.currentDay || 1,
            turnOrder: sanitizedTurnOrder,
            activeCharacterIndex: safeActiveCharacterIndex,
        };
    };

    useEffect(() => {
        let isCancelled = false;

        const hydrate = async () => {
            try {
                const persistedState = await loadOrSeedCampaignState();
                if (isCancelled) return;
                const normalizedState = normalizeLoadedState(persistedState);
                lastStateSignatureRef.current = buildStateSignature(normalizedState);
                dispatch({ type: 'HYDRATE_STATE', payload: normalizedState });
                setSyncError(null);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Erro ao carregar dados da campanha no Supabase.';
                console.error(message);
                if (isCancelled) return;
                setSyncError(message);
                lastStateSignatureRef.current = buildStateSignature(emptyState);
                dispatch({ type: 'HYDRATE_STATE', payload: emptyState });
            } finally {
                if (!isCancelled) {
                    setIsHydrated(true);
                }
            }
        };

        hydrate();

        return () => {
            isCancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isHydrated) return;
        lastStateSignatureRef.current = buildStateSignature(state);
    }, [state, isHydrated]);

    useEffect(() => {
        if (!isHydrated) return;

        if (skipNextAutoSaveRef.current) {
            skipNextAutoSaveRef.current = false;
            return;
        }

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            try {
                await saveCampaignState(state);
                setSyncError(null);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Erro ao sincronizar estado da campanha no Supabase.';
                console.error(message);
                setSyncError(message);
            }
        }, 200);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [state, isHydrated]);

    useEffect(() => {
        if (!isHydrated) return;

        let isCancelled = false;
        const realtimeTargets = getCampaignRealtimeTargets();
        if (realtimeTargets.length === 0) return;

        const channel = supabase.channel(`campaign-state-sync-${Date.now()}`);

        const refreshFromRemote = async () => {
            if (isCancelled || isRealtimeSyncInFlightRef.current) return;
            isRealtimeSyncInFlightRef.current = true;

            try {
                const persistedState = await loadOrSeedCampaignState();
                if (isCancelled) return;

                const normalizedState = normalizeLoadedState(persistedState);
                const remoteSignature = buildStateSignature(normalizedState);
                if (remoteSignature === lastStateSignatureRef.current) {
                    return;
                }

                skipNextAutoSaveRef.current = true;
                lastStateSignatureRef.current = remoteSignature;
                dispatch({ type: 'HYDRATE_STATE', payload: normalizedState });
                setSyncError(null);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Erro ao sincronizar mudancas remotas da campanha.';
                console.error(message);
                if (!isCancelled) {
                    setSyncError(message);
                }
            } finally {
                isRealtimeSyncInFlightRef.current = false;
            }
        };

        const scheduleRemoteRefresh = () => {
            if (realtimeRefreshTimeoutRef.current) {
                window.clearTimeout(realtimeRefreshTimeoutRef.current);
            }

            realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
                void refreshFromRemote();
            }, 250);
        };

        realtimeTargets.forEach(target => {
            channel.on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: target.table,
                    filter: target.filter,
                },
                scheduleRemoteRefresh
            );
        });

        channel.subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
                const message = 'Erro ao assinar realtime da campanha no Supabase.';
                console.error(message);
                if (!isCancelled) {
                    setSyncError(message);
                }
            }
        });

        return () => {
            isCancelled = true;

            if (realtimeRefreshTimeoutRef.current) {
                window.clearTimeout(realtimeRefreshTimeoutRef.current);
                realtimeRefreshTimeoutRef.current = null;
            }

            void supabase.removeChannel(channel);
        };
    }, [isHydrated]);

    const persistStateNow = async (nextState?: PersistedAppState): Promise<void> => {
        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        const stateToPersist = nextState || state;

        try {
            await saveCampaignState(stateToPersist);
            lastStateSignatureRef.current = buildStateSignature(stateToPersist);
            setSyncError(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao sincronizar estado da campanha no Supabase.';
            console.error(message);
            setSyncError(message);
            throw error;
        }
    };

    return (
        <CharacterContext.Provider value={{ state, dispatch, isHydrated, syncError, persistStateNow }}>
            {children}
        </CharacterContext.Provider>
    );
};

export const useCharacterContext = () => {
    const context = useContext(CharacterContext);
    if (context === undefined) {
        throw new Error('useCharacterContext must be used within a CharacterProvider');
    }
    return context;
};


