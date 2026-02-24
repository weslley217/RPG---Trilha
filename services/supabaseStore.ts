import { BestiaryState, Character, Equipment, Role, User } from '../types';
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

const CAMPAIGN_STATE_ID = 'main';
const SCHEMA_HINT = 'Verifique se o script supabase/schema.sql foi executado no seu projeto Supabase.';

const clone = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

export const buildInitialCampaignState = (): PersistedAppState => ({
    characters: clone(initialCharacters),
    equipment: clone(PARADOX_EQUIPMENT),
    bestiary: {
        monsters: [],
        notes: [],
    },
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

export const loadOrSeedUsers = async (): Promise<User[]> => {
    const { data, error } = await supabase
        .from('app_users')
        .select('id, username, password, role, created_at')
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`Falha ao carregar usuários do Supabase: ${error.message}. ${SCHEMA_HINT}`);
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
            .from('app_users')
            .insert(missingSeedRows)
            .select('id, username, password, role, created_at');

        if (seedMissingError) {
            throw new Error(`Falha ao completar seed de usuários no Supabase: ${seedMissingError.message}. ${SCHEMA_HINT}`);
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
        .from('app_users')
        .insert(seedRows)
        .select('id, username, password, role, created_at');

    if (insertError) {
        throw new Error(`Falha ao popular usuários no Supabase: ${insertError.message}. ${SCHEMA_HINT}`);
    }

    return ((insertedUsers || []) as DbUserRow[]).map(normalizeUserRow);
};

export const registerUserInSupabase = async (newUser: User): Promise<User> => {
    const { data, error } = await supabase
        .from('app_users')
        .insert({
            id: newUser.id,
            username: newUser.username,
            password: newUser.password || '',
            role: newUser.role,
        })
        .select('id, username, password, role, created_at')
        .single();

    if (error) {
        throw new Error(`Falha ao registrar usuário no Supabase: ${error.message}. ${SCHEMA_HINT}`);
    }

    return normalizeUserRow(data as DbUserRow);
};

export const loadOrSeedCampaignState = async (): Promise<PersistedAppState> => {
    const { data, error } = await supabase
        .from('campaign_states')
        .select('id, state, created_at, updated_at')
        .eq('id', CAMPAIGN_STATE_ID)
        .maybeSingle();

    if (error) {
        throw new Error(`Falha ao carregar estado da campanha no Supabase: ${error.message}. ${SCHEMA_HINT}`);
    }

    if (data?.state) {
        return data.state as PersistedAppState;
    }

    const seededState = buildInitialCampaignState();
    const { error: insertError } = await supabase
        .from('campaign_states')
        .insert({
            id: CAMPAIGN_STATE_ID,
            state: seededState,
        });

    if (insertError) {
        throw new Error(`Falha ao popular estado inicial no Supabase: ${insertError.message}. ${SCHEMA_HINT}`);
    }

    return seededState;
};

export const saveCampaignState = async (state: PersistedAppState): Promise<void> => {
    const payload: DbCampaignStateRow = {
        id: CAMPAIGN_STATE_ID,
        state: state,
    };

    const { error } = await supabase
        .from('campaign_states')
        .upsert(payload, { onConflict: 'id' });

    if (error) {
        throw new Error(`Falha ao salvar estado da campanha no Supabase: ${error.message}. ${SCHEMA_HINT}`);
    }
};
