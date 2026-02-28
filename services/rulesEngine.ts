
import { Character, Attribute, Effect, EffectType, Proficiency, Technique, TechniqueType, TestRequest } from '../types';
import { TECHNIQUE_LEVEL_MODIFIERS, PROFICIENCY_ATTRIBUTES } from '../constants';

// Função obrigatória: getValorAtual(atributo)
export const getEffectiveValue = (
    baseValue: number,
    effects: Effect[],
    target: Attribute | Proficiency | 'VidaMaxima' | 'AuraMaxima' | string
): number => {
    return effects.reduce((currentValue, effect) => {
        if (effect.target === target) {
            if (effect.type === EffectType.Buff) {
                return currentValue + effect.value;
            }
            if (effect.type === EffectType.Debuff) {
                return currentValue - effect.value;
            }
        }
        return currentValue;
    }, baseValue);
};

// Função obrigatória: calcularModificador(atributo)
export const calculateModifier = (attributeValue: number): number => {
    return Math.floor((attributeValue - 10) / 2);
};

export const getEffectiveAttribute = (char: Character, attribute: Attribute): number => {
    const directValue = getEffectiveValue(char.attributes[attribute], char.effects, attribute);
    const allStatsDelta = char.effects.reduce((delta, effect) => {
        if (effect.target !== 'AllStats') return delta;
        if (effect.type === EffectType.Buff) return delta + effect.value;
        if (effect.type === EffectType.Debuff) return delta - effect.value;
        return delta;
    }, 0);
    return directValue + allStatsDelta;
};

export const getEffectiveProficiency = (char: Character, proficiency: Proficiency): number => {
    const directValue = getEffectiveValue(char.proficiencies[proficiency], char.effects, proficiency);
    const allStatsDelta = char.effects.reduce((delta, effect) => {
        if (effect.target !== 'AllStats') return delta;
        if (effect.type === EffectType.Buff) return delta + effect.value;
        if (effect.type === EffectType.Debuff) return delta - effect.value;
        return delta;
    }, 0);
    return directValue + allStatsDelta;
};

export const calculateTestModifier = (
    char: Character,
    proficiency: Proficiency,
    context?: 'Physical' | 'Aura' | 'Mental'
): { modifier: number; attribute: Attribute } => {
    const associatedAttributes = PROFICIENCY_ATTRIBUTES[proficiency];
    let targetAttribute: Attribute;

    if (context === 'Physical' && associatedAttributes.includes(Attribute.Corpo)) {
        targetAttribute = Attribute.Corpo;
    } else if (context === 'Aura' && associatedAttributes.includes(Attribute.Espirito)) {
        targetAttribute = Attribute.Espirito;
    } else if (context === 'Mental' && associatedAttributes.includes(Attribute.Mente)) {
        targetAttribute = Attribute.Mente;
    } else {
        // Default to the highest attribute modifier among the associated ones if context is unclear
        let bestAttribute = associatedAttributes[0];
        let maxModifier = -Infinity;
        for (const attr of associatedAttributes) {
            const currentModifier = calculateModifier(getEffectiveAttribute(char, attr));
            if (currentModifier > maxModifier) {
                maxModifier = currentModifier;
                bestAttribute = attr;
            }
        }
        targetAttribute = bestAttribute;
    }

    const attributeValue = getEffectiveAttribute(char, targetAttribute);
    return {
        modifier: calculateModifier(attributeValue),
        attribute: targetAttribute,
    };
};


// Função obrigatória: calcularAuraMaxima()
export const calculateMaxAura = (char: Character): number => {
    return getEffectiveValue(calculateBaseMaxAura(char), char.effects, 'AuraMaxima');
};

export const calculateBaseMaxAura = (char: Character): number => {
    const mente = getEffectiveAttribute(char, Attribute.Mente);
    const espirito = getEffectiveAttribute(char, Attribute.Espirito);
    const corpo = getEffectiveAttribute(char, Attribute.Corpo);
    let baseMaxAura = (corpo * mente * espirito);

    if (char.maxAuraMasterBonus) {
        baseMaxAura += char.maxAuraMasterBonus;
    }

    if (char.maxAuraPermanentBonus) {
        baseMaxAura += char.maxAuraPermanentBonus;
    }

    return Math.max(1, Math.round(baseMaxAura));
};

// Função obrigatória: calcularVidaMaxima() - REGRA ATUALIZADA
export const calculateMaxHealth = (char: Character): number => {
    return getEffectiveValue(calculateBaseMaxHealth(char), char.effects, 'VidaMaxima');
};

export const calculateBaseMaxHealth = (char: Character): number => {
    const corpoBruto = getEffectiveAttribute(char, Attribute.Corpo);
    const modEspirito = calculateModifier(getEffectiveAttribute(char, Attribute.Espirito));
    const modCorpo = calculateModifier(getEffectiveAttribute(char, Attribute.Corpo));
    const modMente = calculateModifier(getEffectiveAttribute(char, Attribute.Mente));

    // se os valores de modificadores forem negativos ou zero use o valor de +1 para a operação.
    // Apenas use os valores reais dos modificadores quando forem positivos e maiores que zero.
    const safeModEspirito = Math.max(0, modEspirito);
    const safeModCorpo = Math.max(0, modCorpo);
    const safeModMente = Math.max(0, modMente);
    const sumMods = safeModEspirito + safeModCorpo + safeModMente;
    const effectiveSum = sumMods > 0 ? sumMods : 1;

    let baseMaxHealth = corpoBruto * effectiveSum;

    if (char.maxHealthMasterBonus) {
        baseMaxHealth += char.maxHealthMasterBonus;
    }

    if (char.maxHealthPermanentBonus) {
        baseMaxHealth += char.maxHealthPermanentBonus;
    }

    return Math.max(1, Math.round(baseMaxHealth));
};

export const calculateTechniqueCost = (char: Character, technique: Technique): number => {
    if (technique.baseCost === 0) {
        return 0;
    }

    // Redução Geral (baseada nos atributos brutos e perícia)
    const menteBruto = char.attributes[Attribute.Mente];
    const espiritoBruto = char.attributes[Attribute.Espirito];
    const menteMod = calculateModifier(getEffectiveAttribute(char, Attribute.Mente));
    const espiritoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Espirito));
    const dominioDeAura = getEffectiveProficiency(char, Proficiency.DominioDeAura);
    const generalReduction = menteBruto + espiritoBruto + menteMod + espiritoMod + dominioDeAura;

    // Redução Específica (baseada no nível da técnica)
    const levelModifiers = TECHNIQUE_LEVEL_MODIFIERS[technique.level];
    let levelReduction = 0;
    if (technique.type === TechniqueType.Basica) {
        levelReduction = levelModifiers.reductionBasic;
    } else if (technique.type === TechniqueType.Avancada || technique.type === TechniqueType.Unica) {
        levelReduction = levelModifiers.reductionAdvanced;
    }
    
    const totalReduction = generalReduction + levelReduction;
    const finalCost = technique.baseCost - totalReduction;

    if(technique.name === 'Paradoxo do Conjurador' && char.paradoxState?.nextUseCostDoubled) {
        return Math.max(1, Math.round(finalCost * 2));
    }

    return Math.max(1, Math.round(finalCost)); // Custo mínimo 1
};

const applyDamageMultipliers = (damage: number, char: Character): number => {
    return char.effects.reduce((currentDamage, effect) => {
        if (effect.target === 'DamageMultiplier' && effect.type === EffectType.Buff) {
            return currentDamage * effect.value;
        }
        return currentDamage;
    }, damage);
};

const getActiveTechniqueBonuses = (char: Character): { damageBonus: number; resistanceBonus: number } => {
    return char.effects.reduce((acc, effect) => {
        if (!effect.name.endsWith(' Ativo')) {
            return acc;
        }

        const techniqueName = effect.name.replace(' Ativo', '');
        const technique = char.techniques.find(t => t.name === techniqueName);
        if (!technique) {
            return acc;
        }

        const levelModifiers = TECHNIQUE_LEVEL_MODIFIERS[technique.level];
        return {
            damageBonus: acc.damageBonus + levelModifiers.damageBonus,
            resistanceBonus: acc.resistanceBonus + levelModifiers.resistanceBonus,
        };
    }, { damageBonus: 0, resistanceBonus: 0 });
};

export const isParadoxWeaponBuffActive = (char: Character, weaponId: number): boolean => {
    return char.effects.some(
        effect => effect.type === EffectType.Buff && effect.id.startsWith(`paradox_${weaponId}_`)
    );
};

export const calculateParadoxValidationBonus = (validatedDamage: number, weaponId: number): number => {
    const safeValidatedDamage = Math.max(0, validatedDamage);
    return Math.ceil(safeValidatedDamage * (weaponId / 10));
};

const getPhysicalFlatBonuses = (char: Character): number => {
    let bonusFromEffects = 0;
    char.effects.forEach(effect => {
        if (effect.target === 'PhysicalDamage' || effect.target === 'AllDamage') {
            bonusFromEffects += effect.value;
        }
    });
    const { damageBonus } = getActiveTechniqueBonuses(char);
    return bonusFromEffects + damageBonus;
};

const applyPhysicalDamageModifiers = (char: Character, baseDamage: number): number => {
    const withBonuses = baseDamage + getPhysicalFlatBonuses(char);
    const withMultipliers = applyDamageMultipliers(withBonuses, char);
    return Math.round(Math.max(0, withMultipliers));
};

export const calculatePhysicalDamageRange = (char: Character): { min: number; max: number } => {
    const corpoBruto = char.attributes[Attribute.Corpo];
    const corpoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Corpo));
    const marcialidade = getEffectiveProficiency(char, Proficiency.Marcialidade);

    const minBase = corpoBruto + corpoMod + marcialidade;
    const maxBase = corpoBruto + corpoMod + (2 * marcialidade);
    const min = Math.min(minBase, maxBase);
    const max = Math.max(minBase, maxBase);

    return { min, max };
};

export const calculatePhysicalDamageDisplayRange = (char: Character): { min: number; max: number } => {
    const { min, max } = calculatePhysicalDamageRange(char);
    return {
        min: applyPhysicalDamageModifiers(char, min),
        max: applyPhysicalDamageModifiers(char, max),
    };
};

export const rollPhysicalDamage = (char: Character): { damage: number; rolledBase: number; minBase: number; maxBase: number } => {
    const { min, max } = calculatePhysicalDamageRange(char);
    const rolledBase = Math.floor(Math.random() * (max - min + 1)) + min;
    return {
        damage: applyPhysicalDamageModifiers(char, rolledBase),
        rolledBase,
        minBase: min,
        maxBase: max,
    };
};

export const calculatePhysicalDamage = (char: Character): number => {
    const { min, max } = calculatePhysicalDamageRange(char);
    const midpoint = Math.round((min + max) / 2);
    return applyPhysicalDamageModifiers(char, midpoint);
};

export const calculateAuraEnhancedDamage = (char: Character): number => {
    if (char.effects.some(e => e.name === 'Zetsu Ativo')) {
        return 0; // Zetsu desabilita ataques de aura
    }

    // Part 1: The additive base from effective stats
    const mente = getEffectiveAttribute(char, Attribute.Mente);
    const corpo = getEffectiveAttribute(char, Attribute.Corpo);
    const espirito = getEffectiveAttribute(char, Attribute.Espirito);
    const dominioAura = getEffectiveProficiency(char, Proficiency.DominioDeAura);
    const additiveBase = mente + corpo + dominioAura + espirito;

    // Part 2: The multiplier from effective stat modifiers
    const menteMod = calculateModifier(mente);
    const espiritoMod = calculateModifier(espirito);

    // Special rule: if modifier is 0 or negative, it's treated as 1 for this calculation
    const effectiveMenteMod = menteMod > 0 ? menteMod : 1;
    const effectiveEspiritoMod = espiritoMod > 0 ? espiritoMod : 1;
    const multiplier = effectiveMenteMod + effectiveEspiritoMod;

    // Base damage calculation
    let baseDamage = additiveBase * multiplier;

    // Add other flat bonuses from effects (like Gyo, Ko)
    char.effects.forEach(effect => {
        if (effect.target === 'AuraDamage' || effect.target === 'AllDamage') {
            baseDamage += effect.value;
        }
    });

    const { damageBonus } = getActiveTechniqueBonuses(char);
    baseDamage += damageBonus;

    // Apply global damage multipliers (like from Chicote Elétrico)
    const finalDamage = applyDamageMultipliers(baseDamage, char);

    return Math.round(finalDamage);
};

export const calculateDamageReduction = (char: Character, damageType: 'Physical' | 'Aura'): { totalReduction: number; baseResist: number; mod: number; attr: Attribute } => {
    const reductionFromEffects = getActiveDamageReductionBonus(char);
    const corpoBruto = char.attributes[Attribute.Corpo];
    const corpoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Corpo));
    const resistenciaValue = getEffectiveProficiency(char, Proficiency.Resistencia);
    const espiritoBruto = char.attributes[Attribute.Espirito];
    const espiritoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Espirito));
    const dominioAura = getEffectiveProficiency(char, Proficiency.DominioDeAura);

    const naturalReduction = damageType === 'Physical'
        ? (corpoBruto + corpoMod + resistenciaValue)
        : (corpoBruto + corpoMod + resistenciaValue + dominioAura + espiritoBruto + espiritoMod);

    const { resistanceBonus } = getActiveTechniqueBonuses(char);

    const total = naturalReduction + reductionFromEffects + resistanceBonus;
    
    return {
        totalReduction: Math.max(0, total),
        baseResist: naturalReduction,
        mod: damageType === 'Physical' ? corpoMod : espiritoMod,
        attr: damageType === 'Physical' ? Attribute.Corpo : Attribute.Espirito,
    };
};

export const getActiveDamageReductionBonus = (char: Character): number => {
    let reductionFromEffects = 0;

    char.effects.forEach(effect => {
        if (effect.target === 'DamageReduction') {
            reductionFromEffects += effect.value;
        }
    });

    if (reductionFromEffects > 0) {
        const espiritoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Espirito));
        const menteMod = calculateModifier(getEffectiveAttribute(char, Attribute.Mente));
        const dominio = getEffectiveProficiency(char, Proficiency.DominioDeAura);
        reductionFromEffects += (espiritoMod + menteMod + dominio);
    }

    const { resistanceBonus } = getActiveTechniqueBonuses(char);
    return reductionFromEffects + resistanceBonus;
};

const calculateParadoxWeaponDamageBase = (char: Character, physicalDamageValue: number): number | null => {
    const weapon = char.paradoxState?.selectedEquipment;
    if (!weapon) {
        return null;
    }

    if (weapon.id === 10) {
        return 0;
    }

    const auraDamage = calculateAuraEnhancedDamage(char);
    const espiritoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Espirito));
    const menteMod = calculateModifier(getEffectiveAttribute(char, Attribute.Mente));
    const dominioAura = getEffectiveProficiency(char, Proficiency.DominioDeAura);
    const marcialidade = getEffectiveProficiency(char, Proficiency.Marcialidade);
    const corpoMod = calculateModifier(getEffectiveAttribute(char, Attribute.Corpo));

    return physicalDamageValue + auraDamage + espiritoMod + menteMod + dominioAura + marcialidade + corpoMod;
};

export const calculateParadoxWeaponDamage = (
    char: Character,
    includeBuffBonus: boolean = true,
    physicalDamageOverride?: number
): number | null => {
    const weapon = char.paradoxState?.selectedEquipment;
    if (!weapon) {
        return null;
    }

    const physicalDamage = physicalDamageOverride ?? calculatePhysicalDamage(char);
    const baseDamage = calculateParadoxWeaponDamageBase(char, physicalDamage);
    if (baseDamage === null) {
        return null;
    }

    let damage = baseDamage;
    const hasBuff = isParadoxWeaponBuffActive(char, weapon.id);
    if (includeBuffBonus && hasBuff) {
        damage += calculateParadoxValidationBonus(damage, weapon.id);
    }

    return Math.round(Math.max(0, damage));
};

export const calculateParadoxWeaponDamageRange = (char: Character): { min: number; max: number } | null => {
    if (!char.paradoxState?.selectedEquipment) {
        return null;
    }

    const physicalRange = calculatePhysicalDamageDisplayRange(char);
    const minBase = calculateParadoxWeaponDamageBase(char, physicalRange.min);
    const maxBase = calculateParadoxWeaponDamageBase(char, physicalRange.max);
    if (minBase === null || maxBase === null) {
        return null;
    }

    return {
        min: Math.round(Math.max(0, minBase)),
        max: Math.round(Math.max(0, maxBase)),
    };
};

