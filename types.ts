
export enum Role {
    PLAYER = 'PLAYER',
    MASTER = 'MASTER',
}

export interface User {
    id: string;
    username: string;
    password?: string; // Not used for validation in this frontend-only app
    role: Role;
}

export enum Attribute {
    Corpo = 'Corpo',
    Mente = 'Mente',
    Espirito = 'Espirito',
}

export enum Proficiency {
    Resistencia = 'Resistência',
    DominioDeAura = 'Domínio de Aura',
    Marcialidade = 'Marcialidade',
    Investigacao = 'Investigação',
    Intimidacao = 'Intimidação',
    Reacao = 'Reação',
    Enganacao = 'Enganação',
    Conhecimento = 'Conhecimento',
}

export enum TechniqueType {
    Basica = 'Básica',
    Avancada = 'Avançada',
    Unica = 'Única',
}

export enum TechniqueLevel {
    Amador = 'Amador',
    Usuario = 'Usuário',
    Experiente = 'Experiente',
    Profissional = 'Profissional',
    Graduado = 'Graduado',
    Mestre = 'Mestre',
    GraoMestre = 'Grão-Mestre',
    Anciao = 'Ancião',
}

export interface Technique {
    name: string;
    description: string;
    type: TechniqueType;
    baseCost: number;
    level: TechniqueLevel;
}

export enum EffectType {
    Buff = 'Buff',
    Debuff = 'Debuff',
    State = 'State',
}

export interface Effect {
    id: string;
    name: string;
    type: EffectType;
    target: Attribute | Proficiency | 'VidaMaxima' | 'AuraMaxima' | 'DamageReduction' | 'PhysicalDamage' | 'AuraDamage' | 'AllDamage' | 'DamageMultiplier' | 'TotalAttacks' | string;
    value: number;
    duration: number; // in turns. Infinity for toggles.
    turnCost?: {
        resource: 'Aura' | 'Health';
        value: number;
    }
}

export interface TestRequest {
    proficiency: Proficiency;
    attribute?: Attribute; // Kept for potential legacy use, but new logic favors context.
    testContext?: 'Physical' | 'Aura' | 'Mental';
}

export interface Equipment {
    id: number;
    name: string;
    description: string;
    buff: string;
    debuff: string;
    imageUrl?: string;
    question?: string;
}

export interface ParadoxState {
  isActive: boolean;
  question: string;
  playerAnswer: string | null;
  outcome?: 'correct' | 'incorrect' | 'no_answer' | 'pending';
  nextUseCostDoubled: boolean;
  isEquationOfDestinyActive: boolean;
  forceNextBuff: boolean;
  forceNextDebuff: boolean;
  activeNeutralWeapon: boolean;
  selectedEquipment: Equipment | null;
  chosenBoseWeaponId?: number;
  preparedExtraShots?: number;
}

export type OzyAuraPlusEgoConversion = 'heal_health' | 'heal_aura' | 'max_health' | 'max_aura';

export interface OzyAuraExpandirState {
    conjurationPhase: 0 | 1 | 2 | 3;
    areaMeters: number;
    alliesInArea: number;
    enemiesInArea: number;
    affectedCharacterIds: string[];
    intimidationThreshold: number;
    intimidatedTargets: number;
    resistancePenaltyApplied: number;
    isActive: boolean;
}

export interface OzyState {
    auraExpandir: OzyAuraExpandirState;
    egoTargetsInRange: number;
    passiveEgoEnabled: boolean;
    auraPlusEgoActive: boolean;
    auraPlusEgoConversion: OzyAuraPlusEgoConversion;
}

export type MatheusProspectionAction = 'replicar' | 'expor' | 'sugerir_controlar';

export interface MatheusProspectionRequest {
    id: string;
    action: MatheusProspectionAction;
    target: string;
    targetType?: 'player' | 'enemy';
    targetCharacterId?: string;
    copiedTechniqueName?: string;
    requestedUses?: number;
    costPerUse?: number;
    totalCost?: number;
    spiritRoll?: number;
    spiritModifier?: number;
    spiritTotal?: number;
    testOutcome?: 'success' | 'failure';
    details: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
    masterResult?: string;
    additionalDamage?: number;
}

export interface MatheusState {
    isChoosingProspectionAction: boolean;
    pendingRequest: MatheusProspectionRequest | null;
    lastResolvedRequest: MatheusProspectionRequest | null;
    copiedTechniques: {
        id: string;
        techniqueName: string;
        sourceCharacterId?: string;
        usesRemaining: number;
        addedByCopy: boolean;
        grantedAt: number;
    }[];
}

export type GabrielShieldRequestKind =
    | 'narrativo'
    | 'dano_extra'
    | 'resistencia'
    | 'atributo'
    | 'pericia'
    | 'vida'
    | 'aura'
    | 'cura';

export interface GabrielEscudoRequest {
    id: string;
    sourceTechnique: 'Escudo do Mestre';
    kind: GabrielShieldRequestKind;
    target: string;
    targetCharacterId?: string;
    text: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
    masterText?: string;
    numericValue?: number;
}

export interface GabrielHouseRule {
    id: string;
    name: string;
    text: string;
    auraCost: number;
    shieldUsesCost: number;
    createdDay: number;
}

export interface GabrielHouseRuleRequest {
    id: string;
    sourceTechnique: 'Regras da Casa';
    mode: 'new' | 'reuse';
    proposedName: string;
    proposedText: string;
    proposedShieldUsesCost: number;
    ruleIdToReuse?: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
    masterText?: string;
    approvedShieldUsesCost?: number;
}

export interface GabrielTokenAdjustRequest {
    id: string;
    sourceTechnique: 'Ajustar Tokens da Party';
    moveType: 'self' | 'ally' | 'enemy';
    target: string;
    targetCharacterId?: string;
    allyIsVoluntary?: boolean;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
    masterResult?: string;
}

export interface TavernSellRequest {
    id: string;
    tavernOwnerCharacterId: string;
    itemName: string;
    requestedPrice: number;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
    masterApprovedPrice?: number;
}

export interface TavernItemOffer {
    id: string;
    name: string;
    price: number;
}

export interface TavernMission {
    id: string;
    title: string;
    description: string;
    rewardAuraCoins: number;
    acceptedByCharacterId?: string;
    completed: boolean;
}

export interface TavernState {
    isActive: boolean;
    activeUntilDay: number | null;
    bankAuraCoins: number;
    infoPrice: number;
    foodPrice: number;
    lodgingPrice: number;
    items: TavernItemOffer[];
    missions: TavernMission[];
}

export interface BestiaryMonster {
    id: string;
    name: string;
    imageUrl?: string;
    averageWeight: string;
    averageHeight: string;
    threatLevel: string;
    weakness: string;
    strongPoint: string;
    isVisibleToPlayers: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface BestiaryPlayerNote {
    id: string;
    monsterId: string;
    characterId: string;
    characterName: string;
    characterColor: string;
    content: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
    reviewedAt?: number;
    masterComment?: string;
}

export interface BestiaryState {
    monsters: BestiaryMonster[];
    notes: BestiaryPlayerNote[];
}

export interface GabrielState {
    escudoDoMestreUsesRemaining: number;
    armedEscudoDoMestre: boolean;
    armedRegrasDaCasa: boolean;
    armedAjustarTokens: boolean;
    pendingEscudoRequest: GabrielEscudoRequest | null;
    pendingHouseRuleRequest: GabrielHouseRuleRequest | null;
    storedHouseRules: GabrielHouseRule[];
    activeHouseRuleId: string | null;
    activeHouseRuleUntilDay: number | null;
    pendingTokenAdjustRequest: GabrielTokenAdjustRequest | null;
    tavern: TavernState;
    dailyInteractionsUsed: number;
}

export interface PendingAttack {
    attackId: string;
    attackerId: string;
    baseDamage: number;
    hitCount?: number;
    weaponName: string;
    weaponId?: number;
    isParadoxWeaponAttack?: boolean;
    hasParadoxBuff?: boolean;
    attackType: string;
    logMessage: string;
}

export interface Character {
    id: string;
    name: string;
    playerId: string;
    imageUrl?: string;
    age: string;
    backstory: string;
    motivations: string;
    inventory: string;
    wealth: number;
    weaponImageUrl?: string;
    attributes: {
        [key in Attribute]: number;
    };
    proficiencies: {
        [key in Proficiency]: number;
    };
    currentAura: number;
    currentHealth: number;
    tempHealth: number;
    barriers: number;
    techniques: Technique[];
    effects: Effect[];
    testRequest: TestRequest | null;
    combatLog: string[];
    unspentAttributePoints: number;
    unspentProficiencyPoints: number;
    paradoxState?: ParadoxState;
    actions: {
        attacks: number;
        totalAttacks: number;
    };
    pendingAttack: PendingAttack | null;
    storedDamage?: number; // For Armadura
    activeShield?: { points: number }; // For Escudo Torre
    maxAuraMasterBonus?: number;
    maxHealthMasterBonus?: number;
    maxAuraPermanentBonus?: number;
    maxHealthPermanentBonus?: number;
    absorbedDamageForConversion?: number;
    tavernDailyInteractionsUsed?: number;
    tavernUsedOptions?: string[];
    tavernLastInteractionRound?: number;
    pendingTavernSellRequest?: TavernSellRequest | null;
    activeTavernMissionId?: string | null;
    ozyState?: OzyState;
    matheusState?: MatheusState;
    gabrielState?: GabrielState;
}
