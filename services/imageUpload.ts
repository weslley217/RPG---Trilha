import { supabase } from './supabaseClient';

const IMAGE_BUCKET = 'rpg-images';

const normalizeFileName = (name: string): string => {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9._-]/g, '');
};

const getFileExtension = (fileName: string): string => {
    const normalized = normalizeFileName(fileName);
    const lastDotIndex = normalized.lastIndexOf('.');
    if (lastDotIndex < 0) {
        return 'png';
    }
    const extension = normalized.substring(lastDotIndex + 1);
    return extension || 'png';
};

const uploadImage = async (path: string, file: File): Promise<string> => {
    const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, {
            upsert: true,
            contentType: file.type || undefined,
            cacheControl: '3600',
        });

    if (error) {
        throw new Error(`Falha no upload da imagem: ${error.message}`);
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
};

export const uploadCharacterImage = async (characterId: string, file: File): Promise<string> => {
    const extension = getFileExtension(file.name);
    const safeCharacterId = normalizeFileName(characterId);
    const path = `characters/${safeCharacterId}/${Date.now()}.${extension}`;
    return uploadImage(path, file);
};

export const uploadWeaponImage = async (weaponId: number, file: File): Promise<string> => {
    const extension = getFileExtension(file.name);
    const path = `weapons/weapon-${weaponId}/${Date.now()}.${extension}`;
    return uploadImage(path, file);
};

export const uploadMonsterImage = async (monsterId: string, file: File): Promise<string> => {
    const extension = getFileExtension(file.name);
    const safeMonsterId = normalizeFileName(monsterId || 'monster');
    const path = `monsters/${safeMonsterId}/${Date.now()}.${extension}`;
    return uploadImage(path, file);
};
