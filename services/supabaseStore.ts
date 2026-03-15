import { BestiaryMonster, BestiaryPlayerNote, BestiaryState, Character, Equipment, Role, User } from '../types';
import { initialCharacters, initialUsers, PARADOX_EQUIPMENT } from '../constants';
import { supabase } from './supabaseClient';

export type PersistedAppState = {
    characters: Character[];
    equipment: Equipment[];
    bestiary: BestiaryState;
    turnCount: number;
    currentDay: number;
    turnOrder: string[];
    activeCharacterIndex: number;
};

type DbUserRow = {
    id: string;
    username: string;
    password: string | null;
    role: Role | string;
    created_at?: string;
};

type DbCampaignStateRow = {
    id: string;
    state: PersistedAppState;
    created_at?: string;
    updated_at?: string;
};

type DbCampaignMetaRow = {
    id: string;
    turn_count: number | null;
    current_day: number | null;
    turn_order: string[] | null;
    active_character_index: number | null;
    created_at?: string;
    updated_at?: string;
};

type DbCampaignCharacterRow = {
    campaign_id: string;
    character_id: string;
    position: number | null;
    data: Character;
    created_at?: string;
    updated_at?: string;
};

type DbCampaignEquipmentRow = {
    campaign_id: string;
    equipment_id: number;
    position: number | null;
    data: Equipment;
    created_at?: string;
    updated_at?: string;
};

type DbCampaignBestiaryMonsterRow = {
    campaign_id: string;
    monster_id: string;
    position: number | null;
    data: BestiaryMonster;
    created_at?: string;
    updated_at?: string;
};

type DbCampaignBestiaryNoteRow = {
    campaign_id: string;
    note_id: string;
    position: number | null;
    data: BestiaryPlayerNote;
    created_at?: string;
    updated_at?: string;
};

type CampaignStateSnapshot = {
    meta: string;
    characters: Map<string, string>;
    equipment: Map<string, string>;
    monsters: Map<string, string>;
    notes: Map<string, string>;
};

export type CampaignRealtimeTarget = {
    table: string;
    filter: string;
};

const CAMPAIGN_STATE_ID = 'main';
const USERS_TABLE = 'app_users';
const LEGACY_CAMPAIGN_TABLE = 'campaign_states';
const CAMPAIGN_META_TABLE = 'campaign_meta';
const CAMPAIGN_CHARACTERS_TABLE = 'campaign_characters';
const CAMPAIGN_EQUIPMENT_TABLE = 'campaign_equipment';
const CAMPAIGN_BESTIARY_MONSTERS_TABLE = 'campaign_bestiary_monsters';
const CAMPAIGN_BESTIARY_NOTES_TABLE = 'campaign_bestiary_notes';
const SCHEMA_HINT = 'Verifique se o script supabase/schema.sql foi executado no seu projeto Supabase.';

let lastCampaignSnapshot: CampaignStateSnapshot | null = null;
let segmentedStorageAvailable: boolean | null = null;

const clone = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;
const toJsonSignature = (value: unknown): string => JSON.stringify(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const getErrorMessage = (error: unknown): string => {
    if (isRecord(error) && typeof error.message === 'string') {
        return error.message;
    }
    return 'erro desconhecido';
};

const isMissingRelationError = (error: unknown): boolean => {
    if (!isRecord(error)) {
        return false;
    }

    const code = typeof error.code === 'string' ? error.code : '';
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';

    return code === 'PGRST205'
        || code === '42P01'
        || message.includes('could not find the table')
        || (message.includes('relation') && message.includes('does not exist'));
};

const createEmptyBestiary = (): BestiaryState => ({
    monsters: [],
    notes: [],
});

const normalizeCampaignState = (loaded: Partial<PersistedAppState>): PersistedAppState => {
    const bestiary = loaded.bestiary || createEmptyBestiary();

    return {
        characters: Array.isArray(loaded.characters) ? loaded.characters : [],
        equipment: Array.isArray(loaded.equipment) ? loaded.equipment : [],
        bestiary: {
            monsters: Array.isArray(bestiary.monsters) ? bestiary.monsters : [],
            notes: Array.isArray(bestiary.notes) ? bestiary.notes : [],
        },
        turnCount: typeof loaded.turnCount === 'number' ? loaded.turnCount : 0,
        currentDay: typeof loaded.currentDay === 'number' ? loaded.currentDay : 1,
        turnOrder: Array.isArray(loaded.turnOrder) ? loaded.turnOrder : [],
        activeCharacterIndex: typeof loaded.activeCharacterIndex === 'number' ? loaded.activeCharacterIndex : 0,
    };
};

const buildCampaignSnapshot = (state: PersistedAppState): CampaignStateSnapshot => ({
    meta: toJsonSignature({
        turnCount: state.turnCount,
        currentDay: state.currentDay,
        turnOrder: state.turnOrder,
        activeCharacterIndex: state.activeCharacterIndex,
    }),
    characters: new Map(
        state.characters.map((character, position) => [
            character.id,
            toJsonSignature({ position, data: character }),
        ])
    ),
    equipment: new Map(
        state.equipment.map((item, position) => [
            String(item.id),
            toJsonSignature({ position, data: item }),
        ])
    ),
    monsters: new Map(
        state.bestiary.monsters.map((monster, position) => [
            monster.id,
            toJsonSignature({ position, data: monster }),
        ])
    ),
    notes: new Map(
        state.bestiary.notes.map((note, position) => [
            note.id,
            toJsonSignature({ position, data: note }),
        ])
    ),
});

const collectRemovedIds = (previous: Map<string, string>, next: Map<string, string>): string[] => {
    const removedIds: string[] = [];
    previous.forEach((_, id) => {
        if (!next.has(id)) {
            removedIds.push(id);
        }
    });
    return removedIds;
};

const setSnapshot = (state: PersistedAppState): void => {
    lastCampaignSnapshot = buildCampaignSnapshot(state);
};

const markSegmentedStorageAvailable = (): void => {
    segmentedStorageAvailable = true;
};

const markSegmentedStorageUnavailable = (): void => {
    segmentedStorageAvailable = false;
};

const shouldAttemptSegmentedStorage = (): boolean => segmentedStorageAvailable !== false;

export const getCampaignRealtimeTargets = (): CampaignRealtimeTarget[] => {
    const legacyTarget: CampaignRealtimeTarget = {
        table: LEGACY_CAMPAIGN_TABLE,
        filter: `id=eq.${CAMPAIGN_STATE_ID}`,
    };

    if (segmentedStorageAvailable === false) {
        return [legacyTarget];
    }

    const segmentedTargets: CampaignRealtimeTarget[] = [
        { table: CAMPAIGN_META_TABLE, filter: `id=eq.${CAMPAIGN_STATE_ID}` },
        { table: CAMPAIGN_CHARACTERS_TABLE, filter: `campaign_id=eq.${CAMPAIGN_STATE_ID}` },
        { table: CAMPAIGN_EQUIPMENT_TABLE, filter: `campaign_id=eq.${CAMPAIGN_STATE_ID}` },
        { table: CAMPAIGN_BESTIARY_MONSTERS_TABLE, filter: `campaign_id=eq.${CAMPAIGN_STATE_ID}` },
        { table: CAMPAIGN_BESTIARY_NOTES_TABLE, filter: `campaign_id=eq.${CAMPAIGN_STATE_ID}` },
    ];

    return segmentedStorageAvailable === true
        ? segmentedTargets
        : [...segmentedTargets, legacyTarget];
};

export const buildInitialCampaignState = (): PersistedAppState => ({
    characters: clone(initialCharacters),
    equipment: clone(PARADOX_EQUIPMENT),
    bestiary: createEmptyBestiary(),
    turnCount: 0,
    currentDay: 1,
    turnOrder: initialCharacters.map(character => character.id),
    activeCharacterIndex: 0,
});

const normalizeUserRow = (row: DbUserRow): User => ({
    id: row.id,
    username: row.username,
    password: row.password || '',
    role: row.role === Role.MASTER ? Role.MASTER : Role.PLAYER,
});

const loadSegmentedCampaignState = async (): Promise<PersistedAppState | null> => {
    if (!shouldAttemptSegmentedStorage()) {
        return null;
    }

    const [metaResponse, charactersResponse, equipmentResponse, monstersResponse, notesResponse] = await Promise.all([
        supabase
            .from(CAMPAIGN_META_TABLE)
            .select('id, turn_count, current_day, turn_order, active_character_index, created_at, updated_at')
            .eq('id', CAMPAIGN_STATE_ID)
            .maybeSingle(),
        supabase
            .from(CAMPAIGN_CHARACTERS_TABLE)
            .select('campaign_id, character_id, position, data, created_at, updated_at')
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .order('position', { ascending: true }),
        supabase
            .from(CAMPAIGN_EQUIPMENT_TABLE)
            .select('campaign_id, equipment_id, position, data, created_at, updated_at')
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .order('position', { ascending: true }),
        supabase
            .from(CAMPAIGN_BESTIARY_MONSTERS_TABLE)
            .select('campaign_id, monster_id, position, data, created_at, updated_at')
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .order('position', { ascending: true }),
        supabase
            .from(CAMPAIGN_BESTIARY_NOTES_TABLE)
            .select('campaign_id, note_id, position, data, created_at, updated_at')
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .order('position', { ascending: true }),
    ]);

    const queryErrors = [
        metaResponse.error,
        charactersResponse.error,
        equipmentResponse.error,
        monstersResponse.error,
        notesResponse.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
        const firstError = queryErrors[0];
        if (isMissingRelationError(firstError)) {
            markSegmentedStorageUnavailable();
            return null;
        }
        throw firstError;
    }

    markSegmentedStorageAvailable();

    const metaRow = (metaResponse.data || null) as DbCampaignMetaRow | null;
    const characterRows = (charactersResponse.data || []) as DbCampaignCharacterRow[];
    const equipmentRows = (equipmentResponse.data || []) as DbCampaignEquipmentRow[];
    const monsterRows = (monstersResponse.data || []) as DbCampaignBestiaryMonsterRow[];
    const noteRows = (notesResponse.data || []) as DbCampaignBestiaryNoteRow[];

    const hasSegmentedData = Boolean(metaRow)
        || characterRows.length > 0
        || equipmentRows.length > 0
        || monsterRows.length > 0
        || noteRows.length > 0;

    if (!hasSegmentedData) {
        return null;
    }

    const characters = characterRows.map(row => row.data).filter(Boolean);
    const equipment = equipmentRows.map(row => row.data).filter(Boolean);
    const monsters = monsterRows.map(row => row.data).filter(Boolean);
    const notes = noteRows.map(row => row.data).filter(Boolean);
    const fallbackTurnOrder = characters.map(character => character.id);

    return normalizeCampaignState({
        characters,
        equipment,
        bestiary: {
            monsters,
            notes,
        },
        turnCount: metaRow?.turn_count ?? 0,
        currentDay: metaRow?.current_day ?? 1,
        turnOrder: Array.isArray(metaRow?.turn_order) ? metaRow.turn_order : fallbackTurnOrder,
        activeCharacterIndex: metaRow?.active_character_index ?? 0,
    });
};

const loadLegacyCampaignState = async (): Promise<PersistedAppState | null> => {
    const { data, error } = await supabase
        .from(LEGACY_CAMPAIGN_TABLE)
        .select('id, state, created_at, updated_at')
        .eq('id', CAMPAIGN_STATE_ID)
        .maybeSingle();

    if (error) {
        if (isMissingRelationError(error)) {
            return null;
        }
        throw error;
    }

    if (!data?.state) {
        return null;
    }

    return normalizeCampaignState(data.state as Partial<PersistedAppState>);
};

const saveLegacyCampaignState = async (state: PersistedAppState): Promise<void> => {
    const payload: DbCampaignStateRow = {
        id: CAMPAIGN_STATE_ID,
        state,
    };

    const { error } = await supabase
        .from(LEGACY_CAMPAIGN_TABLE)
        .upsert(payload, { onConflict: 'id' });

    if (error) {
        throw error;
    }
};

const saveSegmentedCampaignState = async (
    state: PersistedAppState,
    options?: { forceFullSave?: boolean }
): Promise<void> => {
    if (!shouldAttemptSegmentedStorage()) {
        throw new Error('Segmented storage unavailable');
    }

    const nextSnapshot = buildCampaignSnapshot(state);
    const previousSnapshot = options?.forceFullSave ? null : lastCampaignSnapshot;
    const forceFullSave = !previousSnapshot;

    const metaPayload: DbCampaignMetaRow = {
        id: CAMPAIGN_STATE_ID,
        turn_count: state.turnCount,
        current_day: state.currentDay,
        turn_order: state.turnOrder,
        active_character_index: state.activeCharacterIndex,
    };

    const shouldUpsertMeta = forceFullSave || previousSnapshot.meta !== nextSnapshot.meta;
    if (shouldUpsertMeta) {
        const { error: metaError } = await supabase
            .from(CAMPAIGN_META_TABLE)
            .upsert(metaPayload, { onConflict: 'id' });
        if (metaError) {
            throw metaError;
        }
    }

    const characterRows: DbCampaignCharacterRow[] = state.characters.map((character, position) => ({
        campaign_id: CAMPAIGN_STATE_ID,
        character_id: character.id,
        position,
        data: character,
    }));
    const charactersToUpsert = forceFullSave
        ? characterRows
        : characterRows.filter(row => previousSnapshot?.characters.get(row.character_id) !== nextSnapshot.characters.get(row.character_id));
    const removedCharacterIds = forceFullSave || !previousSnapshot
        ? []
        : collectRemovedIds(previousSnapshot.characters, nextSnapshot.characters);

    if (removedCharacterIds.length > 0) {
        const { error: deleteCharactersError } = await supabase
            .from(CAMPAIGN_CHARACTERS_TABLE)
            .delete()
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .in('character_id', removedCharacterIds);
        if (deleteCharactersError) {
            throw deleteCharactersError;
        }
    }

    if (charactersToUpsert.length > 0) {
        const { error: upsertCharactersError } = await supabase
            .from(CAMPAIGN_CHARACTERS_TABLE)
            .upsert(charactersToUpsert, { onConflict: 'campaign_id,character_id' });
        if (upsertCharactersError) {
            throw upsertCharactersError;
        }
    }

    const equipmentRows: DbCampaignEquipmentRow[] = state.equipment.map((item, position) => ({
        campaign_id: CAMPAIGN_STATE_ID,
        equipment_id: item.id,
        position,
        data: item,
    }));
    const equipmentToUpsert = forceFullSave
        ? equipmentRows
        : equipmentRows.filter(row => previousSnapshot?.equipment.get(String(row.equipment_id)) !== nextSnapshot.equipment.get(String(row.equipment_id)));
    const removedEquipmentIds = forceFullSave || !previousSnapshot
        ? []
        : collectRemovedIds(previousSnapshot.equipment, nextSnapshot.equipment)
            .map(id => Number(id))
            .filter(id => Number.isFinite(id));

    if (removedEquipmentIds.length > 0) {
        const { error: deleteEquipmentError } = await supabase
            .from(CAMPAIGN_EQUIPMENT_TABLE)
            .delete()
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .in('equipment_id', removedEquipmentIds);
        if (deleteEquipmentError) {
            throw deleteEquipmentError;
        }
    }

    if (equipmentToUpsert.length > 0) {
        const { error: upsertEquipmentError } = await supabase
            .from(CAMPAIGN_EQUIPMENT_TABLE)
            .upsert(equipmentToUpsert, { onConflict: 'campaign_id,equipment_id' });
        if (upsertEquipmentError) {
            throw upsertEquipmentError;
        }
    }

    const monsterRows: DbCampaignBestiaryMonsterRow[] = state.bestiary.monsters.map((monster, position) => ({
        campaign_id: CAMPAIGN_STATE_ID,
        monster_id: monster.id,
        position,
        data: monster,
    }));
    const monstersToUpsert = forceFullSave
        ? monsterRows
        : monsterRows.filter(row => previousSnapshot?.monsters.get(row.monster_id) !== nextSnapshot.monsters.get(row.monster_id));
    const removedMonsterIds = forceFullSave || !previousSnapshot
        ? []
        : collectRemovedIds(previousSnapshot.monsters, nextSnapshot.monsters);

    if (removedMonsterIds.length > 0) {
        const { error: deleteMonstersError } = await supabase
            .from(CAMPAIGN_BESTIARY_MONSTERS_TABLE)
            .delete()
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .in('monster_id', removedMonsterIds);
        if (deleteMonstersError) {
            throw deleteMonstersError;
        }
    }

    if (monstersToUpsert.length > 0) {
        const { error: upsertMonstersError } = await supabase
            .from(CAMPAIGN_BESTIARY_MONSTERS_TABLE)
            .upsert(monstersToUpsert, { onConflict: 'campaign_id,monster_id' });
        if (upsertMonstersError) {
            throw upsertMonstersError;
        }
    }

    const noteRows: DbCampaignBestiaryNoteRow[] = state.bestiary.notes.map((note, position) => ({
        campaign_id: CAMPAIGN_STATE_ID,
        note_id: note.id,
        position,
        data: note,
    }));
    const notesToUpsert = forceFullSave
        ? noteRows
        : noteRows.filter(row => previousSnapshot?.notes.get(row.note_id) !== nextSnapshot.notes.get(row.note_id));
    const removedNoteIds = forceFullSave || !previousSnapshot
        ? []
        : collectRemovedIds(previousSnapshot.notes, nextSnapshot.notes);

    if (removedNoteIds.length > 0) {
        const { error: deleteNotesError } = await supabase
            .from(CAMPAIGN_BESTIARY_NOTES_TABLE)
            .delete()
            .eq('campaign_id', CAMPAIGN_STATE_ID)
            .in('note_id', removedNoteIds);
        if (deleteNotesError) {
            throw deleteNotesError;
        }
    }

    if (notesToUpsert.length > 0) {
        const { error: upsertNotesError } = await supabase
            .from(CAMPAIGN_BESTIARY_NOTES_TABLE)
            .upsert(notesToUpsert, { onConflict: 'campaign_id,note_id' });
        if (upsertNotesError) {
            throw upsertNotesError;
        }
    }

    markSegmentedStorageAvailable();
    lastCampaignSnapshot = nextSnapshot;
};

const migrateToSegmentedStorageIfPossible = async (state: PersistedAppState): Promise<void> => {
    if (!shouldAttemptSegmentedStorage()) {
        return;
    }

    try {
        await saveSegmentedCampaignState(state, { forceFullSave: true });
    } catch (error) {
        if (isMissingRelationError(error)) {
            markSegmentedStorageUnavailable();
            return;
        }
        throw error;
    }
};

export const loadOrSeedUsers = async (): Promise<User[]> => {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('id, username, password, role, created_at')
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`Falha ao carregar usuarios do Supabase: ${error.message}. ${SCHEMA_HINT}`);
    }

    const rows = (data || []) as DbUserRow[];
    if (rows.length > 0) {
        const existingByUsername = new Set(rows.map(row => row.username.toLowerCase()));
        const missingSeedRows = initialUsers
            .filter(user => !existingByUsername.has(user.username.toLowerCase()))
            .map(user => ({
                id: user.id,
                username: user.username,
                password: user.password || '',
                role: user.role,
            }));

        if (missingSeedRows.length === 0) {
            return rows.map(normalizeUserRow);
        }

        const { data: insertedRows, error: seedMissingError } = await supabase
            .from(USERS_TABLE)
            .insert(missingSeedRows)
            .select('id, username, password, role, created_at');

        if (seedMissingError) {
            throw new Error(`Falha ao completar seed de usuarios no Supabase: ${seedMissingError.message}. ${SCHEMA_HINT}`);
        }

        return [...rows, ...((insertedRows || []) as DbUserRow[])].map(normalizeUserRow);
    }

    const seedRows = initialUsers.map(user => ({
        id: user.id,
        username: user.username,
        password: user.password || '',
        role: user.role,
    }));

    const { data: insertedUsers, error: insertError } = await supabase
        .from(USERS_TABLE)
        .insert(seedRows)
        .select('id, username, password, role, created_at');

    if (insertError) {
        throw new Error(`Falha ao popular usuarios no Supabase: ${insertError.message}. ${SCHEMA_HINT}`);
    }

    return ((insertedUsers || []) as DbUserRow[]).map(normalizeUserRow);
};

export const registerUserInSupabase = async (newUser: User): Promise<User> => {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .insert({
            id: newUser.id,
            username: newUser.username,
            password: newUser.password || '',
            role: newUser.role,
        })
        .select('id, username, password, role, created_at')
        .single();

    if (error) {
        throw new Error(`Falha ao registrar usuario no Supabase: ${error.message}. ${SCHEMA_HINT}`);
    }

    return normalizeUserRow(data as DbUserRow);
};

export const loadOrSeedCampaignState = async (): Promise<PersistedAppState> => {
    try {
        const segmentedState = await loadSegmentedCampaignState();
        if (segmentedState) {
            setSnapshot(segmentedState);
            return segmentedState;
        }

        const legacyState = await loadLegacyCampaignState();
        if (legacyState) {
            await migrateToSegmentedStorageIfPossible(legacyState);
            if (!lastCampaignSnapshot) {
                setSnapshot(legacyState);
            }
            return legacyState;
        }

        const seededState = buildInitialCampaignState();
        await saveCampaignState(seededState);
        setSnapshot(seededState);
        return seededState;
    } catch (error) {
        throw new Error(`Falha ao carregar estado da campanha no Supabase: ${getErrorMessage(error)}. ${SCHEMA_HINT}`);
    }
};

export const saveCampaignState = async (state: PersistedAppState): Promise<void> => {
    const normalizedState = normalizeCampaignState(state);

    if (shouldAttemptSegmentedStorage()) {
        try {
            await saveSegmentedCampaignState(normalizedState);
            return;
        } catch (error) {
            if (isMissingRelationError(error)) {
                markSegmentedStorageUnavailable();
            } else {
                throw new Error(`Falha ao salvar estado da campanha no Supabase: ${getErrorMessage(error)}. ${SCHEMA_HINT}`);
            }
        }
    }

    try {
        await saveLegacyCampaignState(normalizedState);
        setSnapshot(normalizedState);
    } catch (error) {
        throw new Error(`Falha ao salvar estado da campanha no Supabase: ${getErrorMessage(error)}. ${SCHEMA_HINT}`);
    }
};
