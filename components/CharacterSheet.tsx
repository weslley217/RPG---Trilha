
import React, { useRef, useState, useEffect } from 'react';
import { Character, Attribute, Proficiency, Effect, Technique, TechniqueLevel, TechniqueType, ParadoxState, Equipment, EffectType } from '../types';
import * as Rules from '../services/rulesEngine';
import {
    ALL_ATTRIBUTES,
    ALL_PROFICIENCIES,
    ALL_TECHNIQUE_LEVELS,
    ATTRIBUTE_LABELS,
    PARADOX_EQUIPMENT,
    PROFICIENCY_LABELS,
    TECHNIQUE_LEVEL_LABELS,
    TECHNIQUE_TYPE_LABELS
} from '../constants';
import { useCharacterContext } from '../context/CharacterContext';
import { uploadCharacterImage } from '../services/imageUpload';

const createEffectForTechnique = (technique: Technique, character: Character): Effect | null => {
    const effectBase = { id: `${technique.name}_${Date.now()}`, name: `${technique.name} Ativo`, type: EffectType.Buff };

    switch (technique.name) {
        case 'Ten':
            return { ...effectBase, target: 'DamageReduction', value: 10, duration: Infinity, turnCost: { resource: 'Aura', value: 80 }};
        case 'Zetsu':
             return { ...effectBase, name: 'Zetsu Ativo', target: 'State', value: 0, duration: Infinity, type: EffectType.State };
        case 'Ren':
            return { ...effectBase, target: 'AllDamage', value: 20, duration: Infinity, turnCost: { resource: 'Aura', value: 100 }};
        case 'Ken':
            return { ...effectBase, target: 'DamageReduction', value: 40, duration: Infinity, turnCost: { resource: 'Aura', value: 150 }};
        case 'Gyo':
            return { ...effectBase, target: 'AuraDamage', value: 80, duration: 2 };
        case 'Ko':
             return { ...effectBase, target: 'AuraDamage', value: 160, duration: 2 };
        case 'Shu':
            return { ...effectBase, target: 'PhysicalDamage', value: 40, duration: 2 };
        case 'Aura Expandir':
            return {
                ...effectBase,
                target: 'State',
                value: 1,
                duration: Infinity,
                turnCost: { resource: 'Aura', value: 100 }
            };
        case 'Aura + Ego':
            return {
                ...effectBase,
                target: 'State',
                value: 1,
                duration: Infinity,
                turnCost: { resource: 'Aura', value: 600 }
            };
        default:
            return null;
    }
};

const createParadoxEffect = (weapon: Equipment, outcome: 'correct' | 'incorrect'): Effect => {
    let duration = 3;
    if (weapon.id === 10) duration = 3;
    if (weapon.id === 7) duration = 3;

    const base = { id: `paradox_${weapon.id}_${Date.now()}`, duration };
    
    if (outcome === 'correct') {
        switch (weapon.id) {
            case 6:
                return { ...base, name: 'Dano Dobrado (Chicote)', type: EffectType.Buff, target: 'DamageMultiplier', value: 2 };
            case 3:
                 return { ...base, name: 'Força Aumentada (Glaive)', type: EffectType.Buff, target: Attribute.Corpo, value: 10 };
            case 2:
                 return { ...base, name: 'Ataque Triplo (Bidente)', type: EffectType.Buff, target: 'TotalAttacks', value: 3 };
            case 10:
                 return { ...base, name: 'Condensado Ativo', type: EffectType.Buff, target: 'AllStats', value: 15 }; // Special handling needed
            case 7:
                return { ...base, name: 'Armadura Ativa', type: EffectType.Buff, target: 'AllStats', value: 10 }; // Special
            default:
                return { ...base, name: `${weapon.name} Buff`, type: EffectType.Buff, target: 'State', value: 1 };
        }
    } else { // incorrect
        switch (weapon.id) {
            case 6:
                return { ...base, name: 'Dreno de Aura (Chicote)', type: EffectType.Debuff, target: 'State', value: 0, turnCost: { resource: 'Aura', value: 50 } };
             case 3:
                return { ...base, name: 'Turno Perdido (Glaive)', type: EffectType.Debuff, target: 'State', value: 0, duration: 2 }; // 1 turn lost = 2 rounds
             case 7:
                return { ...base, name: 'Imobilizado (Armadura)', type: EffectType.Debuff, target: 'State', value: 0, duration: 3 };
            default:
                return { ...base, name: `${weapon.name} Debuff`, type: EffectType.Debuff, target: 'State', value: 1 };
        }
    }
};

const createDefaultParadoxState = (): ParadoxState => ({
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
});

const removeNamedEffectPrefixes = (effects: Effect[], prefixes: string[]): Effect[] => {
    return effects.filter(effect => !prefixes.some(prefix => effect.name.startsWith(prefix)));
};

const buildAuraExpandirTier = (character: Character, affectedTargets: number): { effects: Effect[]; tierLabel: string } => {
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

const buildAuraPlusEgoMaxEffects = (character: Character): Effect[] => {
    const dominioAura = Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura);
    const marcialidade = Rules.getEffectiveProficiency(character, Proficiency.Marcialidade);
    const resistencia = Rules.getEffectiveProficiency(character, Proficiency.Resistencia);
    const espiritoBruto = character.attributes[Attribute.Espirito];
    const espiritoMod = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));
    const damageBonus = 40 + dominioAura + marcialidade + espiritoMod + espiritoBruto;
    const resistanceBonus = 60 + resistencia + dominioAura;

    return [
        {
            id: `aura_plus_ego_allstats_${Date.now()}`,
            name: 'Aura + Ego AllStats',
            type: EffectType.Buff,
            target: 'AllStats',
            value: 10,
            duration: Infinity,
        },
        {
            id: `aura_plus_ego_damage_${Date.now()}`,
            name: 'Aura + Ego Dano Base',
            type: EffectType.Buff,
            target: 'AllDamage',
            value: damageBonus,
            duration: Infinity,
        },
        {
            id: `aura_plus_ego_resist_${Date.now()}`,
            name: 'Aura + Ego Resistência',
            type: EffectType.Buff,
            target: 'DamageReduction',
            value: resistanceBonus,
            duration: Infinity,
        },
    ];
};

const TECHNIQUE_COPY: Record<string, { quick: string; full: string }> = {
    Ten: {
        quick: 'Defesa passiva de aura. Mitiga dano com base em Dominio de Aura e mods de Mente/Espirito. Fica ativa por padrao e sai com Zetsu.',
        full: 'Ten reduz a perda gradual de aura e forma uma camada defensiva constante ao redor do corpo. Essa camada funciona como uma segunda pele contra golpes de aura mais basicos e, com maestria, estabiliza a circulacao de aura por longos periodos.'
    },
    Zetsu: {
        quick: 'Custo 0. Suprime a aura externa, oculta presenca e remove a defesa natural de aura.',
        full: 'Zetsu fecha os nos de aura para interromper a emissao externa. Isso melhora ocultacao e alivio de fadiga, mas deixa o usuario vulneravel contra tecnicas de aura enquanto estiver ativo.'
    },
    Ren: {
        quick: 'Expande aura e fortalece combate. Concede +2 em atributos e bonus ofensivo/defensivo enquanto ativo.',
        full: 'Ren intensifica o fluxo de aura em grande escala para ofensiva e presenca de combate. Na pratica, ele amplia capacidade corporal e pressao de aura, sustentando ataques e defesa em nivel superior enquanto for mantido.'
    },
    Ken: {
        quick: 'Defesa avancada de corpo inteiro. Mitigacao base 40 + Dominio de Aura + mods de Mente/Espirito.',
        full: 'Ken e uma evolucao de Ten para cobertura defensiva total. Ele protege o corpo inteiro de forma mais robusta, sendo ideal para trocas prolongadas, com maior consumo de aura para manutencao.'
    },
    In: {
        quick: 'Oculta aura de objetos/campo por ate 100 turnos. Pode ser detectada por Gyo ou En.',
        full: 'In deriva do principio de ocultacao de Zetsu e serve para esconder completamente a assinatura de aura em areas, objetos e tecnicas, dificultando deteccao comum de usuarios de aura.'
    },
    Gyo: {
        quick: 'Concentra aura em uma parte do corpo para ataque, defesa ou utilidade.',
        full: 'Gyo concentra aura em um ponto especifico (olhos, membros ou orgaos), elevando poder local de forma drastica. E muito usado para reforco ofensivo/defensivo e para leitura de aura escondida por In.'
    },
    Ko: {
        quick: 'Concentra quase toda a aura em um unico ponto para impacto/protecao extremos.',
        full: 'Ko combina foco extremo de aura com supressao de outras areas do corpo. O resultado e um pico de potencia muito alto em um unico ponto, com alto risco por reduzir cobertura defensiva geral.'
    },
    Shu: {
        quick: 'Fortalece objetos com aura, elevando dano e resistencia do item.',
        full: 'Shu aplica aura em armas e objetos, tratando-os como extensoes do usuario. Isso amplia tanto o poder de impacto quanto a durabilidade do objeto durante a cena.'
    },
    En: {
        quick: 'Expande aura em esfera para leitura de presenca, movimento e forma no alcance.',
        full: 'En projeta a aura em area para mapear o entorno em tempo real. Quanto maior o raio, maior o consumo de aura, mas tambem maior a capacidade de detectar usuarios, objetos e alteracoes no campo.'
    },
    'Paradoxo do Conjurador': {
        quick: 'Conjura 1 de 10 armas com pergunta de fisica. Acerto = buff, erro = debuff, sem resposta = arma neutra com dreno e custo dobrado no proximo uso neutro.',
        full: 'Ao ativar, uma arma e sorteada e o usuario responde uma pergunta teorica de fisica. Acertar concede buff da arma sorteada; errar aplica debuff correspondente. Se nao responder, recebe arma no estado neutro (mais forte que arma fisica comum), com dreno continuo de aura e penalidade de custo dobrado no proximo uso em estado neutro.'
    },
    'Equação do Destino': {
        quick: 'Inverte a balanca do Paradoxo 1x: pode negar o proprio buff/debuff e transferir o resultado oposto ao adversario.',
        full: 'A Equacao do Destino permite negar uma vez o resultado proprio do Paradoxo e refletir o efeito oposto no oponente. Se negar buff proprio, o alvo recebe o debuff correspondente e o proximo Paradoxo fica com buff obrigatorio. Se negar debuff proprio, o alvo recebe o buff correspondente e o proximo Paradoxo fica com debuff obrigatorio.'
    },
    'Aura Expandir': {
        quick: 'Conjuracao em 3 fases: detectar area, enfraquecer intimidados e ganhar escalonamento de poder por numero de alvos.',
        full: 'A primeira conjuracao abre uma zona equivalente a Dominio de Aura + Espirito bruto + mod de Espirito, exigindo validacao de intimidação. A segunda aplica enfraquecimento e reducao de resistencia nos alvos intimidados. A terceira concede bonus ofensivos/defensivos ao Ozy conforme a quantidade de alvos afetados.'
    },
    'Aura + Ego': {
        quick: 'Desativa Ego passivo e ativa drenagem massiva por alvo, com conversao por turno em cura, aura ou atributos maximos.',
        full: 'Enquanto ativa, executa Aura Expandir completa, aplica o maior patamar de bonus e drena energia em escala 1d4 por alvo. A cada turno, o jogador escolhe converter a drenagem em vida atual, aura atual, vida maxima permanente ou aura maxima permanente.'
    },
    'Prospecção Intuitiva': {
        quick: 'Permite replicar habilidade, expor pontos fracos ou sugerir/controlar alvos com validacao do Mestre.',
        full: 'A tecnica cria uma requisicao unica ao Mestre. Apos validacao, Matheus pode receber dano adicional narrativo, efeito tatico ou copia de habilidade com custo fixo da propria tecnica.'
    },
    'Escudo do Mestre': {
        quick: '5 usos diarios. Cria regra/efeito narrativo ou mecanico com validacao do Mestre.',
        full: 'Permite propor efeitos sobre dano, resistencia, status, pericias, vida, aura ou narrativa. O Mestre pode aprovar, editar ou rejeitar e definir o resultado aplicado.'
    },
    'Regras da Casa': {
        quick: 'Consome 1-3 usos de Escudo do Mestre para registrar uma regra valida por 1 dia e reutilizavel.',
        full: 'Na primeira validacao, o Mestre define texto final e custo em usos do Escudo do Mestre. A regra fica armazenada e pode ser reutilizada em dias futuros sem nova validacao.'
    },
    'Conjurar Taverna': {
        quick: 'Invoca o Carvalho Ensandecido por 1 dia com banco de moedas de aura, itens e missoes.',
        full: 'A taverna permite compra de informacao, comida, estalagem, itens e acesso a missoes. Valores e catalogo sao geridos pelo Mestre e ficam persistidos no estado da campanha.'
    },
    'Ajustar Tokens da Party': {
        quick: 'Movimenta usuario, aliado ou inimigo com validacao do Mestre.',
        full: 'Permite reposicionamento no campo: auto-movimento imediato, aliado voluntario ou teste de resistencia para alvo nao voluntario, e validacao do Mestre para alvos inimigos.'
    },
    'Equacao do Destino': {
        quick: 'Inverte a balanca do Paradoxo 1x: pode negar o proprio buff/debuff e transferir o resultado oposto ao adversario.',
        full: 'A Equacao do Destino permite negar uma vez o resultado proprio do Paradoxo e refletir o efeito oposto no oponente. Se negar buff proprio, o alvo recebe o debuff correspondente e o proximo Paradoxo fica com buff obrigatorio. Se negar debuff proprio, o alvo recebe o buff correspondente e o proximo Paradoxo fica com debuff obrigatorio.'
    }
};

const TECHNIQUE_COLUMNS = [
    { type: TechniqueType.Basica },
    { type: TechniqueType.Avancada },
    { type: TechniqueType.Unica },
];

const CharacterHeader: React.FC<{ character: Character, isMasterView: boolean, onUpdate: (char: Character) => void }> = ({ character, isMasterView, onUpdate }) => {
    const [details, setDetails] = useState({ age: character.age, backstory: character.backstory, motivations: character.motivations, inventory: character.inventory, wealth: character.wealth });
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [imageUploadError, setImageUploadError] = useState('');
    const imageFileInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => { setDetails({ age: character.age, backstory: character.backstory, motivations: character.motivations, inventory: character.inventory, wealth: character.wealth }); }, [character]);
    
    const handleSave = () => { onUpdate({ ...character, ...details }); };
    const handleChange = (field: keyof typeof details, value: string | number) => { setDetails(prev => ({ ...prev, [field]: value })); };

    const handleUploadCharacterImage = async () => {
        if (!selectedImageFile) {
            setImageUploadError('Selecione um arquivo de imagem antes de enviar.');
            return;
        }

        setIsUploadingImage(true);
        setImageUploadError('');
        try {
            const publicUrl = await uploadCharacterImage(character.id, selectedImageFile);
            onUpdate({
                ...character,
                imageUrl: publicUrl,
            });
            setSelectedImageFile(null);
            if (imageFileInputRef.current) {
                imageFileInputRef.current.value = '';
            }
        } catch (error) {
            setImageUploadError(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
        } finally {
            setIsUploadingImage(false);
        }
    };
    
    return (
        <div className="flex flex-col-reverse md:flex-row gap-6 bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex-1 space-y-3">
                <h2 className="text-2xl font-bold text-green-400 border-b border-gray-700 pb-2">Detalhes do Personagem</h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="font-bold text-green-400 block mb-1">Idade</label>
                        <input type="text" value={details.age} onChange={e => handleChange('age', e.target.value)} disabled={isMasterView} className="w-full p-2 bg-gray-700 rounded-md disabled:bg-gray-800"/>
                    </div>
                     <div>
                        <label className="font-bold text-green-400 block mb-1">Riqueza</label>
                        <input type="number" value={details.wealth} onChange={e => handleChange('wealth', parseInt(e.target.value) || 0)} disabled={!isMasterView} className="w-full p-2 bg-gray-700 rounded-md disabled:bg-gray-800 disabled:text-gray-400"/>
                    </div>
                 </div>
                 <div>
                    <label className="font-bold text-green-400 block mb-1">Motivações</label>
                    <textarea value={details.motivations} onChange={e => handleChange('motivations', e.target.value)} disabled={isMasterView} className="w-full p-2 bg-gray-700 rounded-md disabled:bg-gray-800" rows={3}/>
                 </div>
                 <div>
                    <label className="font-bold text-green-400 block mb-1">Inventário</label>
                    <textarea value={details.inventory} onChange={e => handleChange('inventory', e.target.value)} disabled={isMasterView} className="w-full p-2 bg-gray-700 rounded-md disabled:bg-gray-800" rows={4}/>
                </div>
                {!isMasterView && <button onClick={handleSave} className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition">Salvar Detalhes</button>}
            </div>
             <div className="w-full md:w-1/3 lg:w-1/4">
                <img src={character.imageUrl || 'https://via.placeholder.com/400x600?text=Sem+Imagem'} alt="Imagem do Personagem" className="w-full h-auto object-cover rounded-lg bg-gray-700 aspect-[2/3]"/>
                {isMasterView && onUpdate &&
                    <div className="space-y-2 mt-2">
                        <div className="flex gap-2">
                            <input type="text" value={character.imageUrl || ''} onChange={(e) => onUpdate({...character, imageUrl: e.target.value})} placeholder="URL da Imagem..." className="w-full p-2 bg-gray-700 rounded-md text-sm"/>
                            <button onClick={() => onUpdate(character)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition text-sm">Alterar Imagem</button>
                        </div>
                        <div className="flex gap-2">
                            <input
                                ref={imageFileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => setSelectedImageFile(e.target.files?.[0] || null)}
                                className="w-full p-2 bg-gray-700 rounded-md text-sm"
                            />
                            <button
                                onClick={handleUploadCharacterImage}
                                disabled={!selectedImageFile || isUploadingImage}
                                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 rounded-md text-white font-semibold transition text-sm disabled:bg-gray-700"
                            >
                                {isUploadingImage ? 'Enviando...' : 'Upload Arquivo'}
                            </button>
                        </div>
                        {imageUploadError && <p className="text-xs text-red-400">{imageUploadError}</p>}
                    </div>
                }
             </div>
        </div>
    )
};


const ParadoxModal: React.FC<{ character: Character, onUpdate: (char: Character) => void }> = ({ character, onUpdate }) => {
    const { state: { equipment: equipmentList } } = useCharacterContext();
    const [answer, setAnswer] = useState('');
    const [scrolledItem, setScrolledItem] = useState<Equipment>(equipmentList[0]);
    const [isSelecting, setIsSelecting] = useState(true);
    const [finalWeapon, setFinalWeapon] = useState<Equipment | null>(null);

    useEffect(() => {
        setIsSelecting(true);
        const scrollInterval = setInterval(() => {
            setScrolledItem(equipmentList[Math.floor(Math.random() * equipmentList.length)]);
        }, 150);

        const selectionTimeout = setTimeout(() => {
            clearInterval(scrollInterval);
            const selected = equipmentList[Math.floor(Math.random() * equipmentList.length)];
            setFinalWeapon(selected);
            setIsSelecting(false);

            if (character.paradoxState) {
                const updatedParadox: ParadoxState = { ...character.paradoxState, question: selected.question || 'O Mestre não definiu uma pergunta para esta arma.', selectedEquipment: selected };
                onUpdate({ ...character, paradoxState: updatedParadox });
            }
        }, 5000);

        return () => { clearInterval(scrollInterval); clearTimeout(selectionTimeout); };
    }, []);
    
    const handleClose = (cancel: boolean = false) => {
        if (!character.paradoxState) return;
        const updatedParadox: ParadoxState = { ...character.paradoxState, isActive: false, selectedEquipment: cancel ? null : character.paradoxState.selectedEquipment };
        const logMessage = cancel ? "Paradoxo do Conjurador foi cancelado." : `Arma ${character.paradoxState.selectedEquipment?.name} recebida. Aguardando validação do Mestre.`;
        onUpdate({ ...character, paradoxState: updatedParadox, combatLog: [...character.combatLog, logMessage] });
    };

    const handleSubmit = (playerChoice: 'answer' | 'no_answer') => {
        if (!character.paradoxState || isSelecting || !finalWeapon) return;

        let logMessage = `Paradoxo invocou: ${finalWeapon.name}.`;
        let outcome: ParadoxState['outcome'] = 'pending';
        let newPlayerAnswer: string | null = null;
        let isActive = false;

        if (playerChoice === 'answer') {
            logMessage += ` Jogador respondeu: "${answer}". Aguardando julgamento do Mestre.`;
            newPlayerAnswer = answer;
        } else {
            logMessage += ` Jogador não respondeu. Recebeu a arma em estado neutro.`;
            outcome = 'no_answer';
        }
        const updatedParadox: ParadoxState = { ...character.paradoxState, playerAnswer: newPlayerAnswer, outcome, selectedEquipment: finalWeapon, isActive };
        onUpdate({ ...character, paradoxState: updatedParadox, combatLog: [...character.combatLog, logMessage] });
    };
    
    const displayItem = isSelecting ? scrolledItem : finalWeapon;
    if (!character.paradoxState?.isActive) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 p-8 rounded-lg shadow-2xl border border-yellow-500 text-center w-full max-w-3xl relative">
                 <button onClick={() => handleClose(true)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold">&times;</button>
                <h2 className="text-2xl font-bold text-yellow-400 mb-4">Paradoxo do Conjurador</h2>
                {displayItem && ( <div className="bg-gray-800 p-4 rounded-lg mb-4 text-left"><div className="flex items-center gap-4"><img src={displayItem.imageUrl} alt={displayItem.name} className="h-24 w-24 object-cover rounded-md bg-gray-700"/><div><h3 className="text-2xl font-bold text-white">{displayItem.name}</h3><p className="text-sm text-gray-400">{displayItem.description}</p><p className="text-sm mt-2"><strong className="text-green-400">Buff:</strong> {displayItem.buff}</p><p className="text-sm"><strong className="text-red-400">Debuff:</strong> {displayItem.debuff}</p></div></div></div> )}
                <p className="text-lg mb-2 text-gray-300">Pergunta do Mestre:</p>
                <p className="text-xl italic text-white bg-gray-800 p-3 rounded-md mb-6 min-h-[50px]">{character.paradoxState.question || "..."}</p>
                {isSelecting && <div className="text-yellow-400">Sorteando arma...</div>}
                {!isSelecting && ( <> <input type="text" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Sua resposta..." className="w-full p-3 mb-4 text-gray-200 bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 border border-gray-700"/> <div className="flex gap-4 justify-center"> <button onClick={() => handleSubmit('answer')} className="px-6 py-3 font-bold text-white bg-green-600 rounded-md hover:bg-green-700 transition">Responder</button> <button onClick={() => handleSubmit('no_answer')} className="px-6 py-3 font-bold text-white bg-gray-600 rounded-md hover:bg-gray-700 transition">Não Responder</button> </div> </> )}
            </div>
        </div>
    );
};

const StatBar: React.FC<{ label: string; value: number; max?: number; color: string; isMasterView: boolean; onValueChange: (newValue: number) => void }> = ({ label, value, max = 1, color, isMasterView, onValueChange }) => {
    const safeMax = Math.max(1, max);
    const percentage = Math.max(0, Math.min(100, (value / safeMax) * 100));
    return (
        <div className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700">
            <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white text-lg">{label}</span>
                 <div className="bg-slate-900 rounded-md px-3 py-1 text-sm border border-slate-600 flex items-center justify-center">
                    {isMasterView ? (
                        <>
                            <input type="number" value={value} onChange={(e) => onValueChange(parseInt(e.target.value) || 0)} className="w-16 p-0 bg-transparent text-white font-mono text-center focus:outline-none"/>
                            <span className="text-gray-400 font-mono">/ {safeMax}</span>
                        </>
                    ) : ( <span className="text-white font-mono">{value} / {safeMax}</span> )}
                </div>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-5 p-0.5 border border-slate-600">
                <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${percentage}%`, backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 18px, rgba(0,0,0,0.2) 18px, rgba(0,0,0,0.2) 20px)', transition: 'width 0.5s ease-out' }}></div>
            </div>
        </div>
    );
};

const ActiveWeaponActions: React.FC<{ character: Character, onUpdate: (c: Character) => void }> = ({ character, onUpdate }) => {
    const weapon = character.paradoxState?.selectedEquipment;
    if (!weapon) return null;

    const handleArcoExtraArrows = () => {
        if (character.currentAura < 10 || !character.paradoxState) return;
        const preparedExtraShots = (character.paradoxState.preparedExtraShots || 0) + 3;
        const updatedChar = {
            ...character,
            currentAura: character.currentAura - 10,
            paradoxState: { ...character.paradoxState, preparedExtraShots },
            combatLog: [...character.combatLog, `${character.name} gasta 10 de aura e prepara +3 flechas extras com o Arco (total preparado: ${preparedExtraShots}).`]
        };
        onUpdate(updatedChar);
    };

    const handleTwinBladesTeleport = () => {
        if (character.currentAura < 10) return;
        const updatedChar = {
            ...character,
            currentAura: character.currentAura - 10,
            actions: { ...character.actions, attacks: character.actions.attacks + 1, totalAttacks: character.actions.totalAttacks + 1 },
            combatLog: [...character.combatLog, `${character.name} usa Lamina Gemea para teleporte e ganha 1 ataque extra.`]
        };
        onUpdate(updatedChar);
    };

    const handleEscudoConjure = () => {
        const nextShieldPoints = (character.activeShield?.points || 0) + 100;
        onUpdate({
            ...character,
            activeShield: { points: nextShieldPoints },
            combatLog: [...character.combatLog, `${character.name} conjura/reforca o Escudo Torre (+100), total da barreira: ${nextShieldPoints}.`]
        });
    };

    const handleArmaduraRelease = () => {
        const storedDamage = character.storedDamage || 0;
        if (storedDamage <= 0) {
            onUpdate({ ...character, combatLog: [...character.combatLog, `${character.name} tenta liberar energia da armadura, mas nao ha dano armazenado.`] });
            return;
        }
        onUpdate({
            ...character,
            storedDamage: 0,
            combatLog: [...character.combatLog, `${character.name} libera um feixe da Armadura com ${storedDamage} de dano armazenado.`]
        });
    };

    const handleBidenteExtraDamage = () => {
        const extraDamageEffect: Effect = {
            id: `bidente_extra_${Date.now()}`,
            name: 'Golpe Bem-Sucedido (Bidente)',
            type: EffectType.Buff,
            target: 'AllDamage',
            value: 10,
            duration: 1,
        };
        onUpdate({
            ...character,
            effects: [...character.effects, extraDamageEffect],
            combatLog: [...character.combatLog, `${character.name} prepara o efeito do Bidente (+10 no proximo golpe).`]
        });
    };

    const handleGlaiveExtraDamage = () => {
        const extraDamageEffect: Effect = {
            id: `glaive_extra_${Date.now()}`,
            name: 'Golpe Bem-Sucedido (Glaive)',
            type: EffectType.Buff,
            target: 'AllDamage',
            value: 20,
            duration: 1,
        };
        onUpdate({
            ...character,
            effects: [...character.effects, extraDamageEffect],
            combatLog: [...character.combatLog, `${character.name} prepara o efeito do Glaive (+20 no proximo golpe).`]
        });
    };

    const handleMarteloFragilizar = () => {
        const fragilizeEffect: Effect = {
            id: `martelo_frag_${Date.now()}`,
            name: 'Fragilizacao (Martelo Pistolar)',
            type: EffectType.Buff,
            target: 'DamageMultiplier',
            value: 2,
            duration: 1,
        };
        onUpdate({
            ...character,
            effects: [...character.effects, fragilizeEffect],
            combatLog: [...character.combatLog, `${character.name} prepara a fragilizacao do Martelo Pistolar (proxima instancia de dano dobrada).`]
        });
    };

    const handleFuzilDefensivo = () => {
        onUpdate({
            ...character,
            tempHealth: character.tempHealth + 100,
            combatLog: [...character.combatLog, `${character.name} ativa o modo defensivo do Fuzil: +100 de escudo temporario e invisibilidade narrativa por 1 turno.`]
        });
    };

    const handleChicoteDrainReminder = () => {
        onUpdate({
            ...character,
            combatLog: [...character.combatLog, `${character.name} ativa a postura de dreno do Chicote Eletrico. O dreno sera aplicado no dano validado pelo Mestre.`]
        });
    };

    return (
        <div className="mt-2 space-y-2">
            {weapon.id === 1 && (
                <button onClick={handleArcoExtraArrows} className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-semibold transition" disabled={character.currentAura < 10}>
                    Disparar 3 Flechas Extras (-10 Aura)
                </button>
            )}
            {weapon.id === 4 && (
                <button onClick={handleTwinBladesTeleport} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold transition" disabled={character.currentAura < 10}>
                    Teleporte + Ataque Extra (-10 Aura)
                </button>
            )}
            {weapon.id === 5 && (
                <button onClick={handleEscudoConjure} className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md text-sm font-semibold transition">
                    Conjurar/Reforcar Barreira (+100)
                </button>
            )}
            {weapon.id === 7 && (
                <button onClick={handleArmaduraRelease} className="w-full py-2 bg-orange-600 hover:bg-orange-700 rounded-md text-sm font-semibold transition">
                    Disparar Dano Armazenado
                </button>
            )}
            {weapon.id === 2 && (
                <button onClick={handleBidenteExtraDamage} className="w-full py-2 bg-violet-600 hover:bg-violet-700 rounded-md text-sm font-semibold transition">
                    Preparar +10 de Dano
                </button>
            )}
            {weapon.id === 3 && (
                <button onClick={handleGlaiveExtraDamage} className="w-full py-2 bg-fuchsia-600 hover:bg-fuchsia-700 rounded-md text-sm font-semibold transition">
                    Preparar +20 de Dano
                </button>
            )}
            {weapon.id === 8 && (
                <button onClick={handleMarteloFragilizar} className="w-full py-2 bg-rose-600 hover:bg-rose-700 rounded-md text-sm font-semibold transition">
                    Ativar Fragilizacao
                </button>
            )}
            {weapon.id === 9 && (
                <button onClick={handleFuzilDefensivo} className="w-full py-2 bg-sky-600 hover:bg-sky-700 rounded-md text-sm font-semibold transition">
                    Ativar Escudo e Invisibilidade
                </button>
            )}
            {weapon.id === 6 && (
                <button onClick={handleChicoteDrainReminder} className="w-full py-2 bg-teal-600 hover:bg-teal-700 rounded-md text-sm font-semibold transition">
                    Confirmar Postura de Dreno
                </button>
            )}
        </div>
    );
};


const BoseWeaponSelectionModal: React.FC<{ equipmentList: Equipment[]; onSelect: (weapon: Equipment) => void; onClose: () => void }> = ({ equipmentList, onSelect, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 p-6 rounded-lg shadow-2xl border border-cyan-500 w-full max-w-4xl">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">Efeito Bose-Einstein: Escolha uma Arma</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-h-[60vh] overflow-y-auto">
                    {equipmentList.map(weapon => (
                        <div key={weapon.id} onClick={() => onSelect(weapon)} className="bg-gray-800 p-2 rounded-md hover:bg-gray-700 cursor-pointer transition text-center">
                            <img src={weapon.imageUrl} alt={weapon.name} className="w-20 h-20 mx-auto rounded-md object-cover bg-gray-700" />
                            <p className="mt-2 font-bold text-sm">{weapon.name}</p>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} className="mt-6 w-full py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white font-semibold transition">Cancelar</button>
            </div>
        </div>
    );
};

const ActiveParadoxWeapon: React.FC<{ weapon: Equipment, character: Character, onUpdate: (c: Character) => void }> = ({ weapon, character, onUpdate }) => {
    const handleRemoveWeapon = () => {
        if (!character.paradoxState) return;

        const cleanedEffects = character.effects.filter(effect => {
            if (effect.id.startsWith('paradox_drain_')) return false;
            if (effect.name === `${weapon.name} Buff`) return false;
            if (effect.name === `${weapon.name} Debuff`) return false;
            if (effect.name === `${weapon.name} (Neutro)`) return false;
            if (weapon.id === 2 && effect.name === 'Ataque Triplo (Bidente)') return false;
            if (weapon.id === 3 && ['Força Aumentada (Glaive)', 'Turno Perdido (Glaive)'].includes(effect.name)) return false;
            if (weapon.id === 6 && ['Dano Dobrado (Chicote)', 'Dreno de Aura (Chicote)'].includes(effect.name)) return false;
            if (weapon.id === 7 && ['Armadura Ativa', 'Imobilizado (Armadura)'].includes(effect.name)) return false;
            if (weapon.id === 10 && effect.name === 'Condensado Ativo') return false;
            return true;
        });

        onUpdate({
            ...character,
            effects: cleanedEffects,
            paradoxState: {
                ...character.paradoxState,
                selectedEquipment: null,
                activeNeutralWeapon: false,
                preparedExtraShots: 0,
                chosenBoseWeaponId: character.paradoxState.chosenBoseWeaponId === weapon.id
                    ? undefined
                    : character.paradoxState.chosenBoseWeaponId,
            },
            combatLog: [...character.combatLog, `${character.name} removeu a arma ativa do Paradoxo (${weapon.name}).`]
        });
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-yellow-500">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-bold text-yellow-400">Arma do Paradoxo Ativa</h3>
                <button
                    onClick={handleRemoveWeapon}
                    className="h-8 w-8 rounded-md bg-red-700 hover:bg-red-800 text-white font-bold"
                    title="Remover arma ativa"
                >
                    ×
                </button>
            </div>
            <div className="flex flex-col sm:flex-row items-start gap-4">
                <img src={weapon.imageUrl} alt={weapon.name} className="h-24 w-24 object-cover rounded-md bg-gray-700"/>
                <div className="flex-1">
                    <h4 className="text-lg font-bold text-white">{weapon.name}</h4>
                    <p className="text-sm text-gray-400 mt-1">{weapon.description}</p>
                    <p className="text-sm mt-2"><strong className="text-green-400">Buff:</strong> {weapon.buff}</p>
                    <p className="text-sm mt-1"><strong className="text-red-400">Debuff:</strong> {weapon.debuff}</p>
                     <ActiveWeaponActions character={character} onUpdate={onUpdate} />
                </div>
            </div>
        </div>
    );
};


const CharacterSheet: React.FC<{ character: Character; isMasterView: boolean; onUpdate?: (character: Character) => void; actionsPanel?: React.ReactNode }> = ({ character, isMasterView, onUpdate, actionsPanel }) => {
    const { state, dispatch } = useCharacterContext();
    const { characters: allCharacters, currentDay, turnCount } = state;
    const paradoxEquipmentList = state.equipment?.length ? state.equipment : PARADOX_EQUIPMENT;
    const [isBoseModalOpen, setIsBoseModalOpen] = useState(false);
    const [expandedTechniques, setExpandedTechniques] = useState<Record<string, boolean>>({});
    const [isParadoxGrimoireOpen, setIsParadoxGrimoireOpen] = useState(false);
    const [expandedGrimoireWeapons, setExpandedGrimoireWeapons] = useState<Record<number, boolean>>({});
    const [matheusAction, setMatheusAction] = useState<'replicar' | 'expor' | 'sugerir_controlar'>('replicar');
    const [matheusTarget, setMatheusTarget] = useState('inimigo');
    const [matheusCopiedTechnique, setMatheusCopiedTechnique] = useState('');
    const [matheusConjurationUses, setMatheusConjurationUses] = useState(1);
    const [matheusDetails, setMatheusDetails] = useState('');
    const [gabrielEscudoKind, setGabrielEscudoKind] = useState<'narrativo' | 'dano_extra' | 'resistencia' | 'atributo' | 'pericia' | 'vida' | 'aura' | 'cura'>('narrativo');
    const [gabrielEscudoTarget, setGabrielEscudoTarget] = useState('si');
    const [gabrielEscudoText, setGabrielEscudoText] = useState('');
    const [gabrielHouseRuleMode, setGabrielHouseRuleMode] = useState<'new' | 'reuse'>('new');
    const [gabrielHouseRuleName, setGabrielHouseRuleName] = useState('');
    const [gabrielHouseRuleText, setGabrielHouseRuleText] = useState('');
    const [gabrielHouseRuleUses, setGabrielHouseRuleUses] = useState(1);
    const [gabrielReuseRuleId, setGabrielReuseRuleId] = useState('');
    const [gabrielTokenMoveType, setGabrielTokenMoveType] = useState<'self' | 'ally' | 'enemy'>('self');
    const [gabrielTokenTarget, setGabrielTokenTarget] = useState('si');
    const [gabrielTokenVoluntary, setGabrielTokenVoluntary] = useState(true);
    const [selectedTavernItemId, setSelectedTavernItemId] = useState('');
    const [selectedMissionId, setSelectedMissionId] = useState('');
    const [sellItemName, setSellItemName] = useState('');
    const [sellRequestedPrice, setSellRequestedPrice] = useState(0);

    const hasParadoxGrimoire = character.techniques.some(
        technique => technique.name.toLowerCase().includes('paradoxo')
    );

    const isOzy = Boolean(character.ozyState);
    const isMatheus = Boolean(character.matheusState);
    const isGabriel = Boolean(character.gabrielState);
    const showUniquePanels = !isMasterView && (isOzy || isMatheus || isGabriel);
    const selectedMatheusTargetCharacter = allCharacters.find(other => other.id === matheusTarget && other.id !== character.id) || null;
    const matheusTechnique = character.techniques.find(tech => tech.name === 'Prospecção Intuitiva');
    const matheusCostPerUse = matheusTechnique ? Rules.calculateTechniqueCost(character, matheusTechnique) : 500;
    const activeTavernOwner = allCharacters.find(other => other.gabrielState?.tavern.isActive) || null;
    const activeTavern = activeTavernOwner?.gabrielState?.tavern || null;
    const tavernInteractionsUsed = character.tavernDailyInteractionsUsed || 0;
    const tavernUsedOptions = character.tavernUsedOptions || [];
    const hasUsedTavernThisRound = character.tavernLastInteractionRound === turnCount;
    
    const handleUpdate = <T extends keyof Character>(field: T, value: Character[T]) => onUpdate && onUpdate({ ...character, [field]: value });

    const getTechniqueCopy = (tech: Technique) => {
        const copy = TECHNIQUE_COPY[tech.name];
        if (copy) {
            return copy;
        }
        return {
            quick: tech.description,
            full: tech.description,
        };
    };

    const toggleTechniqueExpanded = (techniqueName: string) => {
        setExpandedTechniques(prev => ({ ...prev, [techniqueName]: !prev[techniqueName] }));
    };

    const toggleGrimoireWeapon = (weaponId: number) => {
        setExpandedGrimoireWeapons(prev => ({ ...prev, [weaponId]: !prev[weaponId] }));
    };
    
    const handleSpendPoint = (type: 'attribute' | 'proficiency', key: Attribute | Proficiency) => {
        if (!onUpdate) return;
        if (type === 'attribute' && character.unspentAttributePoints > 0) {
            const updatedAttributes = { ...character.attributes, [key as Attribute]: character.attributes[key as Attribute] + 1 };
            onUpdate({ ...character, attributes: updatedAttributes, unspentAttributePoints: character.unspentAttributePoints - 1 });
        }
        if (type === 'proficiency' && character.unspentProficiencyPoints > 0) {
            const updatedProficiencies = { ...character.proficiencies, [key as Proficiency]: character.proficiencies[key as Proficiency] + 1 };
            onUpdate({ ...character, proficiencies: updatedProficiencies, unspentProficiencyPoints: character.unspentProficiencyPoints - 1 });
        }
    };

    const resolveTargetCharacter = (rawTarget: string): Character | null => {
        if (!rawTarget || rawTarget === 'si') {
            return character;
        }
        return allCharacters.find(other => other.id === rawTarget || other.name === rawTarget) || null;
    };

    const consumeTavernInteraction = (optionId: string): Character | null => {
        if (tavernInteractionsUsed >= 3) {
            onUpdate && onUpdate({
                ...character,
                combatLog: [...character.combatLog, 'Limite diário de 3 interações no Carvalho Ensandecido já foi atingido.']
            });
            return null;
        }
        if (tavernUsedOptions.includes(optionId)) {
            onUpdate && onUpdate({
                ...character,
                combatLog: [...character.combatLog, `A interação "${optionId}" já foi usada hoje no Carvalho Ensandecido.`]
            });
            return null;
        }
        if (hasUsedTavernThisRound) {
            onUpdate && onUpdate({
                ...character,
                combatLog: [...character.combatLog, 'Você já interagiu com o Carvalho Ensandecido nesta rodada.']
            });
            return null;
        }
        return {
            ...character,
            tavernDailyInteractionsUsed: tavernInteractionsUsed + 1,
            tavernUsedOptions: [...tavernUsedOptions, optionId],
            tavernLastInteractionRound: turnCount,
        };
    };

    const applyTavernAuraCoinTransaction = (optionId: string, amount: number, logMessage: string): boolean => {
        if (!activeTavern || !activeTavernOwner) return false;
        const currentMaxAura = Rules.calculateMaxAura(character);
        if (currentMaxAura - amount < 1) {
            onUpdate && onUpdate({
                ...character,
                combatLog: [...character.combatLog, `Interação com Carvalho Ensandecido falhou: aura máxima insuficiente para custo de ${amount}.`]
            });
            return false;
        }

        const interactedCharacter = consumeTavernInteraction(optionId);
        if (!interactedCharacter) return false;

        const nextCharacter: Character = {
            ...interactedCharacter,
            maxAuraPermanentBonus: (interactedCharacter.maxAuraPermanentBonus || 0) - amount,
            combatLog: [...interactedCharacter.combatLog, logMessage],
        };
        const adjustedMaxAura = Rules.calculateMaxAura(nextCharacter);
        if (nextCharacter.currentAura > adjustedMaxAura) {
            nextCharacter.currentAura = adjustedMaxAura;
        }

        const updatedCharacters = allCharacters.map(other => {
            if (other.id === nextCharacter.id) return nextCharacter;
            if (other.id === activeTavernOwner.id && other.gabrielState) {
                return {
                    ...other,
                    gabrielState: {
                        ...other.gabrielState,
                        tavern: {
                            ...other.gabrielState.tavern,
                            bankAuraCoins: other.gabrielState.tavern.bankAuraCoins + amount,
                        },
                    },
                    combatLog: [...other.combatLog, `${nextCharacter.name} realizou transação de ${amount} moedas de aura no Carvalho Ensandecido.`],
                };
            }
            return other;
        });

        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
        return true;
    };

    const handleTavernBuyInfo = () => {
        if (!activeTavern) return;
        applyTavernAuraCoinTransaction('buy_info', activeTavern.infoPrice, `${character.name} comprou informação no Carvalho Ensandecido por ${activeTavern.infoPrice} moedas de aura.`);
    };

    const handleTavernBuyFood = () => {
        if (!activeTavern) return;
        applyTavernAuraCoinTransaction('buy_food', activeTavern.foodPrice, `${character.name} comprou comida no Carvalho Ensandecido por ${activeTavern.foodPrice} moedas de aura.`);
    };

    const handleTavernRentLodging = () => {
        if (!activeTavern) return;
        applyTavernAuraCoinTransaction('rent_lodging', activeTavern.lodgingPrice, `${character.name} alugou estalagem no Carvalho Ensandecido por ${activeTavern.lodgingPrice} moedas de aura.`);
    };

    const handleTavernBuyItem = () => {
        if (!activeTavern || !activeTavernOwner || !selectedTavernItemId) return;
        const item = activeTavern.items.find(currentItem => currentItem.id === selectedTavernItemId);
        if (!item) return;
        const currentMaxAura = Rules.calculateMaxAura(character);
        if (currentMaxAura - item.price < 1) {
            onUpdate && onUpdate({
                ...character,
                combatLog: [...character.combatLog, `Compra de item falhou: aura máxima insuficiente para custo de ${item.price}.`]
            });
            return;
        }
        const interactedCharacter = consumeTavernInteraction('buy_item');
        if (!interactedCharacter) return;

        const inventoryPrefix = interactedCharacter.inventory ? `${interactedCharacter.inventory}\n` : '';
        const nextCharacter: Character = {
            ...interactedCharacter,
            inventory: `${inventoryPrefix}- ${item.name} (Carvalho Ensandecido)`,
            maxAuraPermanentBonus: (interactedCharacter.maxAuraPermanentBonus || 0) - item.price,
            combatLog: [...interactedCharacter.combatLog, `${character.name} comprou o item "${item.name}" por ${item.price} moedas de aura.`],
        };
        const newMaxAura = Rules.calculateMaxAura(nextCharacter);
        if (nextCharacter.currentAura > newMaxAura) {
            nextCharacter.currentAura = newMaxAura;
        }

        dispatch({
            type: 'SET_CHARACTERS',
            payload: allCharacters.map(other => {
                if (other.id === nextCharacter.id) return nextCharacter;
                if (other.id === activeTavernOwner.id && other.gabrielState) {
                    return {
                        ...other,
                        gabrielState: {
                            ...other.gabrielState,
                            tavern: {
                                ...other.gabrielState.tavern,
                                bankAuraCoins: other.gabrielState.tavern.bankAuraCoins + item.price,
                            }
                        },
                        combatLog: [...other.combatLog, `${character.name} comprou ${item.name} no Carvalho Ensandecido.`]
                    };
                }
                return other;
            })
        });
    };

    const handleTavernAcceptMission = () => {
        if (!activeTavern || !activeTavernOwner || !selectedMissionId) return;
        const interactionChar = consumeTavernInteraction('accept_mission');
        if (!interactionChar) return;
        const updatedCharacters = allCharacters.map(other => {
            if (other.id === activeTavernOwner.id && other.gabrielState) {
                return {
                    ...other,
                    gabrielState: {
                        ...other.gabrielState,
                        tavern: {
                            ...other.gabrielState.tavern,
                            missions: other.gabrielState.tavern.missions.map(mission => {
                                if (mission.id !== selectedMissionId) return mission;
                                if (mission.acceptedByCharacterId || mission.completed) return mission;
                                return { ...mission, acceptedByCharacterId: character.id };
                            }),
                        },
                    },
                    combatLog: [...other.combatLog, `${character.name} aceitou uma missão no Carvalho Ensandecido.`],
                };
            }
            if (other.id === character.id) {
                return {
                    ...interactionChar,
                    activeTavernMissionId: selectedMissionId,
                    combatLog: [...interactionChar.combatLog, `${character.name} aceitou missão no Carvalho Ensandecido.`],
                };
            }
            return other;
        });
        dispatch({ type: 'SET_CHARACTERS', payload: updatedCharacters });
    };

    const handleTavernSellItemRequest = () => {
        if (!activeTavernOwner || !sellItemName.trim()) return;
        const interactionChar = consumeTavernInteraction('sell_item');
        if (!interactionChar) return;
        const request = {
            id: `sell_${Date.now()}`,
            tavernOwnerCharacterId: activeTavernOwner.id,
            itemName: sellItemName.trim(),
            requestedPrice: Math.max(0, sellRequestedPrice),
            status: 'pending' as const,
            createdAt: Date.now(),
        };

        dispatch({
            type: 'SET_CHARACTERS',
            payload: allCharacters.map(other => {
                if (other.id !== character.id) return other;
                return {
                    ...interactionChar,
                    pendingTavernSellRequest: request,
                    combatLog: [...interactionChar.combatLog, `${character.name} solicitou venda de "${request.itemName}" por ${request.requestedPrice} no Carvalho Ensandecido.`],
                };
            })
        });
        setSellItemName('');
        setSellRequestedPrice(0);
    };

    const handleMatheusProspectionSubmit = () => {
        if (!onUpdate || !character.matheusState) return;
        const uses = Math.max(1, matheusConjurationUses || 1);
        const extraAuraCost = Math.max(0, (uses - 1) * matheusCostPerUse);
        const targetCharacter = allCharacters.find(other => other.id === matheusTarget && other.id !== character.id) || null;
        const targetType: 'player' | 'enemy' = targetCharacter ? 'player' : 'enemy';
        const targetLabel = targetCharacter ? targetCharacter.name : 'inimigo';

        if (matheusAction === 'replicar' && targetType === 'player' && !matheusCopiedTechnique) {
            onUpdate({
                ...character,
                combatLog: [...character.combatLog, `${character.name} precisa escolher qual técnica será replicada antes de enviar a Prospecção.`]
            });
            return;
        }

        if (character.currentAura < extraAuraCost) {
            onUpdate({
                ...character,
                combatLog: [...character.combatLog, `${character.name} não possui aura suficiente para pagar os usos adicionais da Prospecção Intuitiva (+${extraAuraCost}).`]
            });
            return;
        }

        const spiritRoll = Math.floor(Math.random() * 20) + 1;
        const spiritModifier = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));
        const spiritTotal = spiritRoll + spiritModifier;

        const request = {
            id: `prospection_${Date.now()}`,
            action: matheusAction,
            target: targetLabel,
            targetType,
            targetCharacterId: targetCharacter?.id,
            copiedTechniqueName: matheusAction === 'replicar'
                ? (targetType === 'enemy' ? 'Habilidade inimiga (narrativa)' : matheusCopiedTechnique)
                : undefined,
            requestedUses: uses,
            costPerUse: matheusCostPerUse,
            totalCost: matheusCostPerUse * uses,
            spiritRoll,
            spiritModifier,
            spiritTotal,
            details: matheusDetails.trim(),
            status: 'pending' as const,
            createdAt: Date.now(),
        };

        onUpdate({
            ...character,
            currentAura: character.currentAura - extraAuraCost,
            matheusState: {
                ...character.matheusState,
                isChoosingProspectionAction: false,
                pendingRequest: request,
            },
            combatLog: [
                ...character.combatLog,
                `${character.name} abre Prospecção Intuitiva (${request.action}) em ${request.target} (usos: ${uses}, custo total: ${request.totalCost}, teste de espírito: ${spiritRoll} ${spiritModifier >= 0 ? '+' : ''}${spiritModifier} = ${spiritTotal}). Aguardando validação do Mestre.`
            ]
        });
        setMatheusDetails('');
        setMatheusCopiedTechnique('');
        setMatheusConjurationUses(1);
    };

    const handleGabrielEscudoSubmit = () => {
        if (!onUpdate || !character.gabrielState) return;
        if (!character.gabrielState.armedEscudoDoMestre) {
            onUpdate({
                ...character,
                combatLog: [...character.combatLog, 'Ative primeiro a técnica Escudo do Mestre para enviar uma regra.']
            });
            return;
        }
        const targetCharacter = resolveTargetCharacter(gabrielEscudoTarget);
        const request = {
            id: `gabriel_escudo_${Date.now()}`,
            sourceTechnique: 'Escudo do Mestre' as const,
            kind: gabrielEscudoKind,
            target: targetCharacter ? targetCharacter.name : (gabrielEscudoTarget || 'si'),
            targetCharacterId: targetCharacter?.id,
            text: gabrielEscudoText.trim(),
            status: 'pending' as const,
            createdAt: Date.now(),
        };

        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                armedEscudoDoMestre: false,
                pendingEscudoRequest: request,
            },
            combatLog: [
                ...character.combatLog,
                `${character.name} propôs um efeito de Escudo do Mestre (${request.kind}) para ${request.target}.`
            ]
        });
        setGabrielEscudoText('');
    };

    const handleGabrielHouseRuleSubmit = () => {
        if (!onUpdate || !character.gabrielState) return;
        if (!character.gabrielState.armedRegrasDaCasa) {
            onUpdate({
                ...character,
                combatLog: [...character.combatLog, 'Ative primeiro Regras da Casa para criar ou reutilizar uma regra.']
            });
            return;
        }

        if (gabrielHouseRuleMode === 'reuse') {
            const selectedRule = character.gabrielState.storedHouseRules.find(rule => rule.id === gabrielReuseRuleId);
            if (!selectedRule) {
                onUpdate({
                    ...character,
                    combatLog: [...character.combatLog, 'Selecione uma regra salva para reutilizar.']
                });
                return;
            }
            if (character.gabrielState.escudoDoMestreUsesRemaining < selectedRule.shieldUsesCost) {
                onUpdate({
                    ...character,
                    gabrielState: { ...character.gabrielState, armedRegrasDaCasa: false },
                    combatLog: [...character.combatLog, `Escudos insuficientes para reutilizar "${selectedRule.name}" (necessário: ${selectedRule.shieldUsesCost}).`]
                });
                return;
            }
            onUpdate({
                ...character,
                gabrielState: {
                    ...character.gabrielState,
                    armedRegrasDaCasa: false,
                    escudoDoMestreUsesRemaining: character.gabrielState.escudoDoMestreUsesRemaining - selectedRule.shieldUsesCost,
                    activeHouseRuleId: selectedRule.id,
                    activeHouseRuleUntilDay: currentDay,
                    pendingHouseRuleRequest: null,
                },
                combatLog: [...character.combatLog, `Regra "${selectedRule.name}" reutilizada sem validação adicional do Mestre (consumo: ${selectedRule.shieldUsesCost}).`]
            });
            return;
        }

        const request = {
            id: `gabriel_rule_${Date.now()}`,
            sourceTechnique: 'Regras da Casa' as const,
            mode: gabrielHouseRuleMode,
            proposedName: gabrielHouseRuleMode === 'new' ? (gabrielHouseRuleName.trim() || 'Regra sem nome') : 'Reuso de Regra',
            proposedText: gabrielHouseRuleMode === 'new'
                ? gabrielHouseRuleText.trim()
                : (character.gabrielState.storedHouseRules.find(rule => rule.id === gabrielReuseRuleId)?.text || ''),
            proposedShieldUsesCost: Math.max(1, Math.min(3, gabrielHouseRuleUses)),
            ruleIdToReuse: gabrielHouseRuleMode === 'reuse' ? gabrielReuseRuleId : undefined,
            status: 'pending' as const,
            createdAt: Date.now(),
        };

        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                armedRegrasDaCasa: false,
                pendingHouseRuleRequest: request,
            },
            combatLog: [
                ...character.combatLog,
                `${character.name} solicitou validação de Regras da Casa (${request.mode === 'new' ? 'nova regra' : 'reuso'}).`
            ]
        });
        setGabrielHouseRuleName('');
        setGabrielHouseRuleText('');
        setGabrielHouseRuleUses(1);
    };

    const handleGabrielTokenAdjustSubmit = () => {
        if (!onUpdate || !character.gabrielState) return;
        if (!character.gabrielState.armedAjustarTokens) {
            onUpdate({
                ...character,
                combatLog: [...character.combatLog, 'Ative primeiro Ajustar Tokens da Party para enviar a movimentação.']
            });
            return;
        }
        const targetCharacter = resolveTargetCharacter(gabrielTokenTarget);
        const request = {
            id: `gabriel_token_${Date.now()}`,
            sourceTechnique: 'Ajustar Tokens da Party' as const,
            moveType: gabrielTokenMoveType,
            target: targetCharacter ? targetCharacter.name : (gabrielTokenTarget || 'si'),
            targetCharacterId: targetCharacter?.id,
            allyIsVoluntary: gabrielTokenMoveType === 'ally' ? gabrielTokenVoluntary : undefined,
            status: 'pending' as const,
            createdAt: Date.now(),
        };

        onUpdate({
            ...character,
            gabrielState: {
                ...character.gabrielState,
                armedAjustarTokens: false,
                pendingTokenAdjustRequest: request,
            },
            combatLog: [
                ...character.combatLog,
                `${character.name} solicitou Ajustar Tokens (${request.moveType}) para ${request.target}.`
            ]
        });
    };
    
    const handleTechniqueActivation = (technique: Technique) => {
        if (!onUpdate) return;

        if (technique.name === 'Ten') {
            const hasZetsu = character.effects.some(effect => effect.name === 'Zetsu Ativo');
            const logMessage = hasZetsu
                ? `${character.name} nao pode reativar Ten enquanto Zetsu estiver ativo.`
                : `${character.name}: Ten e uma tecnica passiva e permanece ativa.`;
            onUpdate({ ...character, combatLog: [...character.combatLog, logMessage] });
            return;
        }

        const activeEffect = character.effects.find(e => e.name === `${technique.name} Ativo`);
        let updatedCharacter = { ...character };
        const copiedTechniqueEntry = character.matheusState?.copiedTechniques?.find(
            copied => copied.techniqueName === technique.name
        );

        if (activeEffect) {
            if (technique.name === 'Ren') {
                updatedCharacter.effects = character.effects.filter(e => !['Ren Ativo', 'Ren Atributos', 'Ren Defesa'].includes(e.name));
            } else if (technique.name === 'Aura Expandir' && character.ozyState) {
                updatedCharacter.effects = removeNamedEffectPrefixes(character.effects, ['Aura Expandir ', 'Aura + Ego Dano Extra']).filter(e => e.id !== activeEffect.id);
                updatedCharacter.ozyState = {
                    ...character.ozyState,
                    auraExpandir: {
                        ...character.ozyState.auraExpandir,
                        conjurationPhase: 0,
                        isActive: false,
                        intimidatedTargets: 0,
                        affectedCharacterIds: [],
                    },
                };
            } else if (technique.name === 'Aura + Ego' && character.ozyState) {
                updatedCharacter.effects = removeNamedEffectPrefixes(character.effects, ['Aura + Ego ', 'Aura Expandir ']).filter(e => e.id !== activeEffect.id);
                updatedCharacter.ozyState = {
                    ...character.ozyState,
                    passiveEgoEnabled: true,
                    auraPlusEgoActive: false,
                    auraExpandir: {
                        ...character.ozyState.auraExpandir,
                        conjurationPhase: 0,
                        isActive: false,
                        intimidatedTargets: 0,
                        affectedCharacterIds: [],
                    },
                };
            } else {
                updatedCharacter.effects = character.effects.filter(e => e.id !== activeEffect.id);
            }
            updatedCharacter.combatLog = [...character.combatLog, `${character.name} desativou ${technique.name}.`];
        } else {
            const cost = Rules.calculateTechniqueCost(character, technique);
            if (character.currentAura < cost) {
                updatedCharacter.combatLog = [...character.combatLog, `Falha ao usar ${technique.name}: Aura insuficiente.`];
                onUpdate(updatedCharacter);
                return;
            }

            updatedCharacter.currentAura = character.currentAura - cost;
            updatedCharacter.combatLog = [...character.combatLog, `${character.name} usou ${technique.name} por ${cost} de aura.`];

            if (technique.name === 'Aura Expandir' && character.ozyState) {
                const currentPhase = character.ozyState.auraExpandir.conjurationPhase;
                const nextPhase = (Math.min(3, currentPhase + 1) as 0 | 1 | 2 | 3);
                const areaMeters = Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura)
                    + character.attributes[Attribute.Espirito]
                    + Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));
                const resistancePenalty = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito))
                    + Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura);

                let refreshedEffects = removeNamedEffectPrefixes(updatedCharacter.effects, ['Aura Expandir ']);
                let phaseLog = `${character.name} concluiu a ${nextPhase}ª conjuração de Aura Expandir.`;
                let intimidationThreshold = character.ozyState.auraExpandir.intimidationThreshold;

                if (nextPhase === 1) {
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const intimidationValue = Rules.getEffectiveProficiency(character, Proficiency.Intimidacao);
                    const { modifier, attribute } = Rules.calculateTestModifier(character, Proficiency.Intimidacao, 'Mental');
                    intimidationThreshold = roll + intimidationValue + modifier;
                    phaseLog += ` Teste de Intimidação: d20 ${roll} + Intimidação ${intimidationValue} + mod ${ATTRIBUTE_LABELS[attribute]} (${modifier >= 0 ? '+' : ''}${modifier}) = ${intimidationThreshold}.`;
                    phaseLog += ' Este valor é o corte mínimo para testes de Resistência (Espírito) dos alvos.';
                }

                if (nextPhase === 2) {
                    phaseLog += ` Alvos intimidados ficam com -2 Espírito e -${Math.max(0, resistancePenalty)} de resistência enquanto Aura Expandir estiver ativa (validação do Mestre nos alvos).`;
                }

                if (nextPhase >= 3) {
                    const affectedTargets = character.ozyState.auraExpandir.intimidatedTargets || character.ozyState.auraExpandir.enemiesInArea || 0;
                    const tierData = buildAuraExpandirTier(character, affectedTargets);
                    refreshedEffects = [...refreshedEffects, ...tierData.effects];
                    const auraExpandirUpkeep = createEffectForTechnique(technique, character);
                    if (auraExpandirUpkeep) {
                        refreshedEffects.push(auraExpandirUpkeep);
                    }
                    phaseLog += ` Bônus aplicado: ${tierData.tierLabel}.`;
                    phaseLog += ' A partir de agora, Aura Expandir drena aura por turno até ser desativada.';
                }

                updatedCharacter.effects = refreshedEffects;
                updatedCharacter.ozyState = {
                    ...character.ozyState,
                    auraExpandir: {
                        ...character.ozyState.auraExpandir,
                        conjurationPhase: nextPhase,
                        areaMeters: Math.max(0, areaMeters),
                        intimidationThreshold,
                        resistancePenaltyApplied: resistancePenalty,
                        isActive: nextPhase > 0,
                    },
                };
                updatedCharacter.combatLog.push(phaseLog);
            } else if (technique.name === 'Aura + Ego' && character.ozyState) {
                const newEffect = createEffectForTechnique(technique, character);
                if (newEffect) {
                    const cleanedEffects = removeNamedEffectPrefixes(updatedCharacter.effects, ['Aura Expandir ', 'Aura + Ego ']);
                    const auraPlusEffects = buildAuraPlusEgoMaxEffects(character);
                    const auraExpandirUpkeep: Effect = {
                        id: `aura_expandir_upkeep_${Date.now()}`,
                        name: 'Aura Expandir Ativo',
                        type: EffectType.Buff,
                        target: 'State',
                        value: 1,
                        duration: Infinity,
                        turnCost: { resource: 'Aura', value: 100 },
                    };
                    updatedCharacter.effects = [...cleanedEffects, newEffect, auraExpandirUpkeep, ...auraPlusEffects];
                }
                const areaMeters = Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura)
                    + character.attributes[Attribute.Espirito]
                    + Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito));
                const resistancePenalty = Rules.calculateModifier(Rules.getEffectiveAttribute(character, Attribute.Espirito))
                    + Rules.getEffectiveProficiency(character, Proficiency.DominioDeAura);
                updatedCharacter.ozyState = {
                    ...character.ozyState,
                    passiveEgoEnabled: false,
                    auraPlusEgoActive: true,
                    auraExpandir: {
                        ...character.ozyState.auraExpandir,
                        conjurationPhase: 3,
                        areaMeters: Math.max(0, areaMeters),
                        resistancePenaltyApplied: resistancePenalty,
                        isActive: true,
                    },
                };
                updatedCharacter.combatLog.push(`${character.name} ativa Aura + Ego e recebe o patamar máximo de Aura Expandir.`);
            } else if (technique.name === 'Prospecção Intuitiva' && character.matheusState) {
                if (character.matheusState.pendingRequest) {
                    updatedCharacter.currentAura = character.currentAura;
                    updatedCharacter.combatLog.push('Já existe uma Prospecção Intuitiva pendente de validação do Mestre.');
                    onUpdate(updatedCharacter);
                    return;
                }
                updatedCharacter.matheusState = {
                    ...character.matheusState,
                    isChoosingProspectionAction: true,
                };
                updatedCharacter.combatLog.push(`${character.name} ativou Prospecção Intuitiva e deve escolher uma ação.`);
            } else if (technique.name === 'Escudo do Mestre' && character.gabrielState) {
                if (character.gabrielState.escudoDoMestreUsesRemaining <= 0) {
                    updatedCharacter.currentAura = character.currentAura;
                    updatedCharacter.combatLog.push('Escudo do Mestre sem usos disponíveis no dia atual.');
                    onUpdate(updatedCharacter);
                    return;
                }
                updatedCharacter.gabrielState = {
                    ...character.gabrielState,
                    armedEscudoDoMestre: true,
                };
                updatedCharacter.combatLog.push(`${character.name} ativou Escudo do Mestre. Defina o pedido para validação do Mestre.`);
            } else if (technique.name === 'Regras da Casa' && character.gabrielState) {
                updatedCharacter.gabrielState = {
                    ...character.gabrielState,
                    armedRegrasDaCasa: true,
                };
                updatedCharacter.combatLog.push(`${character.name} ativou Regras da Casa. Defina nova regra ou reuso para validação.`);
            } else if (technique.name === 'Conjurar Taverna' && character.gabrielState) {
                updatedCharacter.gabrielState = {
                    ...character.gabrielState,
                    tavern: {
                        ...character.gabrielState.tavern,
                        isActive: true,
                        activeUntilDay: currentDay + 1,
                    },
                };
                updatedCharacter.combatLog.push(`${character.name} conjurou o Carvalho Ensandecido até o fim do dia ${currentDay + 1}.`);
            } else if (technique.name === 'Ajustar Tokens da Party' && character.gabrielState) {
                updatedCharacter.gabrielState = {
                    ...character.gabrielState,
                    armedAjustarTokens: true,
                };
                updatedCharacter.combatLog.push(`${character.name} ativou Ajustar Tokens da Party e deve enviar a solicitação.`);
            } else if (technique.name === 'Paradoxo do Conjurador') {
                const baseParadoxState = character.paradoxState || createDefaultParadoxState();
                updatedCharacter.effects = character.effects.filter(effect => !effect.id.startsWith('paradox_drain_'));
                updatedCharacter.paradoxState = {
                    ...baseParadoxState,
                    isActive: true,
                    question: '',
                    playerAnswer: null,
                    outcome: undefined,
                    selectedEquipment: null,
                    activeNeutralWeapon: false,
                    nextUseCostDoubled: false,
                    preparedExtraShots: 0,
                };
            } else if (technique.name.includes('Destino') && technique.name.toLowerCase().includes('equa')) {
                const baseParadoxState = character.paradoxState || createDefaultParadoxState();
                updatedCharacter.paradoxState = { ...baseParadoxState, isEquationOfDestinyActive: true };
                updatedCharacter.combatLog.push(`${character.name} prepara a Equação do Destino!`);
            } else if (technique.name === 'Zetsu') {
                const zetsuEffect = createEffectForTechnique(technique, character);
                if (zetsuEffect) {
                    updatedCharacter.effects = [...character.effects.filter(effect => effect.name !== 'Ten Ativo'), zetsuEffect];
                    updatedCharacter.combatLog.push('Ten foi suprimido devido ao Zetsu.');
                }
            } else if (technique.name === 'Ren') {
                const renMainEffect = createEffectForTechnique(technique, character);
                if (renMainEffect) {
                    const renAttributeEffect: Effect = { id: `ren_attr_${Date.now()}`, name: 'Ren Atributos', type: EffectType.Buff, target: 'AllStats', value: 2, duration: Infinity };
                    const renDefenseEffect: Effect = { id: `ren_def_${Date.now()}`, name: 'Ren Defesa', type: EffectType.Buff, target: 'DamageReduction', value: 20, duration: Infinity };
                    updatedCharacter.effects = [...character.effects, renMainEffect, renAttributeEffect, renDefenseEffect];
                }
            } else {
                const newEffect = createEffectForTechnique(technique, character);
                if (newEffect) {
                    updatedCharacter.effects = [...updatedCharacter.effects, newEffect];
                }
            }
        }

        if (!activeEffect && copiedTechniqueEntry && updatedCharacter.matheusState) {
            const nextUses = Math.max(0, copiedTechniqueEntry.usesRemaining - 1);
            const nextCopiedTechniques = updatedCharacter.matheusState.copiedTechniques
                .map(copied => {
                    if (copied.id !== copiedTechniqueEntry.id) return copied;
                    return {
                        ...copied,
                        usesRemaining: nextUses,
                        grantedAt: Date.now(),
                    };
                })
                .filter(copied => copied.usesRemaining > 0);

            updatedCharacter.matheusState = {
                ...updatedCharacter.matheusState,
                copiedTechniques: nextCopiedTechniques,
            };

            if (nextUses <= 0 && copiedTechniqueEntry.addedByCopy) {
                updatedCharacter.techniques = updatedCharacter.techniques.filter(tech => tech.name !== technique.name);
                updatedCharacter.combatLog.push(`Cópia de ${technique.name} esgotada e removida da lista de técnicas.`);
            } else {
                updatedCharacter.combatLog.push(`Cópia de ${technique.name}: ${nextUses} uso(s) restante(s).`);
            }
        }

        onUpdate(updatedCharacter);
    };

    useEffect(() => {
        if (!onUpdate) return;

        const hasTenTechnique = character.techniques.some(technique => technique.name === 'Ten');
        if (!hasTenTechnique) return;

        const hasZetsu = character.effects.some(effect => effect.name === 'Zetsu Ativo');
        const hasTenActive = character.effects.some(effect => effect.name === 'Ten Ativo');

        if (hasZetsu && hasTenActive) {
            onUpdate({
                ...character,
                effects: character.effects.filter(effect => effect.name !== 'Ten Ativo'),
                combatLog: [...character.combatLog, 'Ten foi desativado por Zetsu.']
            });
            return;
        }

        if (!hasZetsu && !hasTenActive) {
            const tenTechnique = character.techniques.find(technique => technique.name === 'Ten');
            if (!tenTechnique) return;
            const tenEffect = createEffectForTechnique(tenTechnique, character);
            if (!tenEffect) return;
            onUpdate({
                ...character,
                effects: [...character.effects, tenEffect],
                combatLog: [...character.combatLog, 'Ten ativo automaticamente.']
            });
        }
    }, [character.effects, character.techniques, onUpdate]);

    useEffect(() => {
        if (!onUpdate) return;
        const boseBuff = character.effects.find(e => e.name === 'Condensado Ativo');
        if (boseBuff && character.paradoxState && !character.paradoxState.chosenBoseWeaponId) {
            setIsBoseModalOpen(true);
        }
    }, [character.effects]);

    const handleBoseWeaponSelect = (weapon: Equipment) => {
        if (!onUpdate || !character.paradoxState) return;
        
        const newEffect = createParadoxEffect(weapon, 'correct');
        const updatedParadoxState: ParadoxState = {
            ...character.paradoxState,
            chosenBoseWeaponId: weapon.id,
            selectedEquipment: weapon, // Temporarily set for display
        };
        const updatedChar = {
            ...character,
            effects: [...character.effects, newEffect],
            paradoxState: updatedParadoxState,
            combatLog: [...character.combatLog, `${character.name} manifesta ${weapon.name} com o poder de Bose-Einstein!`],
            actions: { ...character.actions, attacks: character.actions.attacks + 1 }
        };
        onUpdate(updatedChar);
        setIsBoseModalOpen(false);
    };

    useEffect(() => {
        if (!onUpdate || !character.paradoxState || !character.paradoxState.outcome || character.paradoxState.outcome === 'pending') return;
        
        const { outcome, selectedEquipment, isEquationOfDestinyActive, forceNextBuff, forceNextDebuff } = character.paradoxState;
        if (!selectedEquipment) return;

        let charToUpdate = { ...character };
        let resolvedOutcome = outcome;
        const logParts: string[] = [];
        let newEffects = [...charToUpdate.effects];
        let newForceNextBuff = false;
        let newForceNextDebuff = false;

        const hasForcedOutcome = forceNextBuff || forceNextDebuff;

        if (forceNextBuff) {
            resolvedOutcome = 'correct';
            logParts.push('O destino foi forcado: BUFF obrigatorio.');
        } else if (forceNextDebuff) {
            resolvedOutcome = 'incorrect';
            logParts.push('O destino foi forcado: DEBUFF obrigatorio.');
        }

        logParts.push(`Resultado base do Paradoxo (${selectedEquipment.name}): ${outcome}.`);

        const canUseEquationNegation = isEquationOfDestinyActive && !hasForcedOutcome && (resolvedOutcome === 'correct' || resolvedOutcome === 'incorrect');

        if (canUseEquationNegation) {
            const mirroredOutcome = resolvedOutcome === 'correct' ? 'incorrect' : 'correct';
            const mirroredEffect = createParadoxEffect(selectedEquipment, mirroredOutcome);
            const negatedType = resolvedOutcome === 'correct' ? 'BUFF' : 'DEBUFF';

            logParts.push(`Equacao do Destino negou o ${negatedType} proprio (uso unico desta ativacao).`);
            logParts.push(`Efeito transferido ao adversario (aplicacao manual do Mestre): ${mirroredEffect.name}.`);

            newForceNextBuff = resolvedOutcome === 'correct';
            newForceNextDebuff = resolvedOutcome === 'incorrect';

            if (newForceNextBuff) {
                logParts.push('Proximo Paradoxo tera BUFF obrigatorio.');
            }
            if (newForceNextDebuff) {
                logParts.push('Proximo Paradoxo tera DEBUFF obrigatorio.');
            }
        } else {
            if (isEquationOfDestinyActive && hasForcedOutcome) {
                logParts.push('Equacao do Destino nao pode sobrescrever um resultado obrigatorio.');
            }

            if (resolvedOutcome === 'correct' || resolvedOutcome === 'incorrect') {
                const paradoxEffect = createParadoxEffect(selectedEquipment, resolvedOutcome);
                newEffects.push(paradoxEffect);
                logParts.push(`Efeito aplicado: ${paradoxEffect.name}.`);
            } else if (resolvedOutcome === 'no_answer') {
                const drainEffect: Effect = { id: `paradox_drain_${Date.now()}`, name: `${selectedEquipment.name} (Neutro)`, type: EffectType.State, target: 'State', value: 0, duration: Infinity, turnCost: { resource: 'Aura', value: 50 } };
                newEffects.push(drainEffect);
                logParts.push('A arma esta em estado neutro, drenando 50 de aura por turno.');
            }
        }
        
        const totalAttacksBuff = newEffects.find(e => e.target === 'TotalAttacks' && e.type === EffectType.Buff);
        const newTotalAttacks = totalAttacksBuff ? totalAttacksBuff.value : 1;
        const newActions = { attacks: newTotalAttacks, totalAttacks: newTotalAttacks };

        const updatedParadox: ParadoxState = { 
            ...charToUpdate.paradoxState, 
            isEquationOfDestinyActive: false, 
            activeNeutralWeapon: resolvedOutcome === 'no_answer', 
            nextUseCostDoubled: resolvedOutcome === 'no_answer',
            forceNextBuff: newForceNextBuff, 
            forceNextDebuff: newForceNextDebuff, 
            preparedExtraShots: 0,
            playerAnswer: null, 
            outcome: undefined, 
        };

        const logMessage = logParts.join(' ');
        onUpdate({ ...charToUpdate, effects: newEffects, paradoxState: updatedParadox, actions: newActions, combatLog: [...charToUpdate.combatLog, logMessage] });

    }, [character.paradoxState?.outcome]);

    const maxAura = Rules.calculateMaxAura(character);
    const maxHealth = Rules.calculateMaxHealth(character);

    return (
        <div className="space-y-6">
            {isBoseModalOpen && <BoseWeaponSelectionModal equipmentList={paradoxEquipmentList} onSelect={handleBoseWeaponSelect} onClose={() => setIsBoseModalOpen(false)} />}
            {character.paradoxState?.isActive && onUpdate && <ParadoxModal character={character} onUpdate={onUpdate} />}
            
            {onUpdate && <CharacterHeader character={character} isMasterView={isMasterView} onUpdate={onUpdate}/>}

            {!isMasterView && character.paradoxState?.selectedEquipment && !character.paradoxState.isActive && onUpdate && (
                <ActiveParadoxWeapon weapon={character.paradoxState.selectedEquipment} character={character} onUpdate={onUpdate} />
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatBar label="Vida" value={character.currentHealth} max={maxHealth} color="text-red-500" isMasterView={isMasterView} onValueChange={(v) => handleUpdate('currentHealth', v)} />
                <StatBar label="Aura" value={character.currentAura} max={maxAura} color="text-yellow-400" isMasterView={isMasterView} onValueChange={(v) => handleUpdate('currentAura', v)} />
            </div>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3"><h3 className="text-xl font-bold text-green-400">Atributos</h3>{!isMasterView && character.unspentAttributePoints > 0 && <span className="text-yellow-400 font-bold">{character.unspentAttributePoints} pontos</span>}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{ALL_ATTRIBUTES.map(attr => { const effectiveValue = Rules.getEffectiveAttribute(character, attr); const modifier = Rules.calculateModifier(effectiveValue); return (<div key={attr} className="bg-gray-900 p-4 rounded-lg text-center"><label className="block text-lg font-bold text-green-400">{ATTRIBUTE_LABELS[attr]}</label><div className="flex items-center justify-center gap-2">{isMasterView ? <input type="number" value={character.attributes[attr]} onChange={e => onUpdate && onUpdate({...character, attributes: {...character.attributes, [attr]: parseInt(e.target.value) || 0}})} className="w-20 p-1 mt-1 bg-gray-700 rounded-md text-center text-2xl font-bold"/> : <p className="text-3xl font-bold">{effectiveValue}</p>}{!isMasterView && character.unspentAttributePoints > 0 && <button onClick={() => handleSpendPoint('attribute', attr)} className="text-2xl bg-green-600 hover:bg-green-700 rounded-full w-8 h-8">+</button>}</div><p className="text-lg text-gray-400">Mod: {modifier > 0 ? `+${modifier}` : modifier}</p></div>); })}</div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3"><h3 className="text-xl font-bold text-green-400">Proficiências</h3>{!isMasterView && character.unspentProficiencyPoints > 0 && <span className="text-yellow-400 font-bold">{character.unspentProficiencyPoints} pontos</span>}</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">{ALL_PROFICIENCIES.map(prof => (<div key={prof} className="flex items-center justify-between"><label className="text-gray-300">{PROFICIENCY_LABELS[prof]}</label><div className="flex items-center gap-2">{isMasterView ? <input type="number" value={character.proficiencies[prof]} onChange={e => onUpdate && onUpdate({...character, proficiencies: {...character.proficiencies, [prof]: parseInt(e.target.value) || 0}})} className="w-16 p-1 bg-gray-700 rounded-md text-right font-bold"/> : <span className="font-bold text-white">{Rules.getEffectiveProficiency(character, prof)}</span>}{!isMasterView && character.unspentProficiencyPoints > 0 && <button onClick={() => handleSpendPoint('proficiency', prof)} className="bg-green-600 hover:bg-green-700 rounded-full w-6 h-6 text-sm">+</button>}</div></div>))}</div>
            </div>

            <div className={`grid grid-cols-1 gap-6 ${actionsPanel && !isMasterView ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <h3 className="text-xl font-bold text-green-400 mb-3">Efeitos Ativos</h3>
                    <ul className="space-y-1 max-h-48 overflow-y-auto pr-2">{character.effects.length > 0 ? character.effects.map(effect => (<li key={effect.id} className={`flex justify-between p-2 rounded-md text-white ${effect.type === 'Buff' ? 'bg-emerald-900' : effect.type === 'Debuff' ? 'bg-red-900' : 'bg-slate-700'}`}><div><span className="font-semibold">{effect.name}</span> <span className="text-xs text-gray-400">{effect.target} ({effect.value > 0 ? `+${effect.value}` : effect.value})</span></div><span className="font-mono text-sm">{effect.duration !== Infinity ? `${effect.duration}t` : 'âˆž'}</span>{isMasterView && <button onClick={() => onUpdate && onUpdate({...character, effects: character.effects.filter(e => e.id !== effect.id)})} className="text-red-500 hover:text-red-400 font-bold ml-2">X</button>}</li>)) : <li className="text-gray-400">Nenhum efeito ativo.</li>}</ul>
                </div>
                {actionsPanel && !isMasterView && (
                    <div>
                        {actionsPanel}
                    </div>
                )}
                 <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <h3 className="text-xl font-bold text-green-400 mb-3">Log de Combate</h3>
                    <div className="h-48 bg-gray-900 rounded-md p-2 overflow-y-auto text-sm font-mono">{character.combatLog.slice().reverse().map((log, index) => (<p key={index} className="whitespace-pre-wrap border-b border-gray-700 pb-1 mb-1 last:border-b-0">{log}</p>))}</div>
                </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="text-xl font-bold text-green-400 mb-2">Técnicas</h3>
                <p className="text-xs text-gray-400 mb-4">
                    Cada técnica mostra um resumo rápido e uma versão estendida em "Ler mais".
                </p>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {TECHNIQUE_COLUMNS.map(column => {
                        const techniquesByType = character.techniques.filter(tech => tech.type === column.type);

                        return (
                            <div key={column.type} className="bg-gray-900 p-3 rounded-md border border-gray-700">
                                <h4 className="text-lg font-semibold text-cyan-300 border-b border-gray-700 pb-2 mb-3">{TECHNIQUE_TYPE_LABELS[column.type]}</h4>
                                <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                                    {techniquesByType.length === 0 && (
                                        <p className="text-sm text-gray-400">Nenhuma tecnica nesta categoria.</p>
                                    )}
                                    {techniquesByType.map(tech => {
                                        const finalCost = Rules.calculateTechniqueCost(character, tech);
                                        const isActive = character.effects.some(effect => effect.name === `${tech.name} Ativo`);
                                        const isTen = tech.name === 'Ten';
                                        const isToggle = ['Zetsu', 'Ren', 'Ken', 'Aura Expandir', 'Aura + Ego'].includes(tech.name) || isTen;
                                        const isEscudoSemUso = tech.name === 'Escudo do Mestre'
                                            && !!character.gabrielState
                                            && character.gabrielState.escudoDoMestreUsesRemaining <= 0;
                                        const isAuraExpandirLockedByAuraPlusEgo = tech.name === 'Aura Expandir' && !!character.ozyState?.auraPlusEgoActive;
                                        const isDisabled = (!isActive && character.currentAura < finalCost) || isTen || isEscudoSemUso || isAuraExpandirLockedByAuraPlusEgo;
                                        const actionLabel = isTen ? 'Passiva' : (isToggle ? (isActive ? 'Desativar' : 'Ativar') : 'Usar');
                                        const isExpanded = Boolean(expandedTechniques[tech.name]);
                                        const copy = getTechniqueCopy(tech);

                                        return (
                                            <div key={tech.name} className="p-3 bg-slate-950 rounded-md border border-slate-800">
                                                <div className="flex justify-between items-center gap-3">
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <h5 className="font-bold text-lg">{tech.name}</h5>
                                                        {!isMasterView && (
                                                            <button
                                                                onClick={() => handleTechniqueActivation(tech)}
                                                                className={`px-3 py-1 text-xs font-bold text-white rounded-md transition ${isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:bg-gray-600`}
                                                                disabled={isDisabled}
                                                            >
                                                                {actionLabel}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <span className="font-mono text-yellow-300 whitespace-nowrap">Custo: {finalCost}</span>
                                                </div>
                                                <p className="text-sm text-gray-300 mt-2">{copy.quick}</p>
                                                <button
                                                    onClick={() => toggleTechniqueExpanded(tech.name)}
                                                    className="mt-2 text-xs text-cyan-300 hover:text-cyan-200 font-semibold"
                                                >
                                                    {isExpanded ? 'Ler menos' : 'Ler mais'}
                                                </button>
                                                {isExpanded && (
                                                    <p className="text-sm text-gray-400 mt-2 whitespace-pre-line">{copy.full}</p>
                                                )}
                                                {isMasterView && (
                                                    <div className="mt-3">
                                                        <label className="text-sm mr-2">Nível:</label>
                                                        <select
                                                            value={tech.level}
                                                            onChange={e => {
                                                                const updatedTechs = character.techniques.map(t => t.name === tech.name ? { ...t, level: e.target.value as TechniqueLevel } : t);
                                                                handleUpdate('techniques', updatedTechs);
                                                            }}
                                                            className="bg-gray-700 p-1 rounded-md"
                                                        >
                                                            {ALL_TECHNIQUE_LEVELS.map(level => <option key={level} value={level}>{TECHNIQUE_LEVEL_LABELS[level]}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showUniquePanels && (
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
                    <h3 className="text-xl font-bold text-cyan-300">Painel de Habilidades Únicas</h3>

                    {isOzy && character.ozyState && (
                        <div className="bg-gray-900 p-3 rounded-md border border-cyan-800 space-y-3">
                            <h4 className="font-bold text-cyan-300">Ozymandias: Aura Expandir / Ego</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                                <p><span className="text-gray-400">Fase:</span> <span className="font-semibold">{character.ozyState.auraExpandir.conjurationPhase}/3</span></p>
                                <p><span className="text-gray-400">Área:</span> <span className="font-semibold">{character.ozyState.auraExpandir.areaMeters}m</span></p>
                                <p><span className="text-gray-400">Aliados:</span> <span className="font-semibold">{character.ozyState.auraExpandir.alliesInArea}</span></p>
                                <p><span className="text-gray-400">Inimigos:</span> <span className="font-semibold">{character.ozyState.auraExpandir.enemiesInArea}</span></p>
                                <p><span className="text-gray-400">Intimidação mínima:</span> <span className="font-semibold">{character.ozyState.auraExpandir.intimidationThreshold}</span></p>
                                <p><span className="text-gray-400">Alvos afetados:</span> <span className="font-semibold">{character.ozyState.auraExpandir.intimidatedTargets}</span></p>
                                <p><span className="text-gray-400">Penalidade de resistência:</span> <span className="font-semibold">{character.ozyState.auraExpandir.resistancePenaltyApplied}</span></p>
                                <p><span className="text-gray-400">Alvos para Ego:</span> <span className="font-semibold">{character.ozyState.egoTargetsInRange}</span></p>
                                <p><span className="text-gray-400">Alvos rastreados:</span> <span className="font-semibold">{character.ozyState.auraExpandir.affectedCharacterIds.length}</span></p>
                            </div>
                            {character.ozyState.auraExpandir.affectedCharacterIds.length > 0 && (
                                <p className="text-xs text-gray-400">
                                    Alvos com efeitos da Aura Expandir: {character.ozyState.auraExpandir.affectedCharacterIds
                                        .map(id => allCharacters.find(other => other.id === id)?.name || id)
                                        .join(', ')}
                                </p>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <label className="text-sm text-gray-300">Conversão Aura + Ego:</label>
                                <select
                                    value={character.ozyState.auraPlusEgoConversion}
                                    onChange={event => onUpdate && onUpdate({
                                        ...character,
                                        ozyState: { ...character.ozyState!, auraPlusEgoConversion: event.target.value as any }
                                    })}
                                    className="p-2 bg-gray-700 rounded-md text-sm"
                                >
                                    <option value="heal_aura">Restaurar Aura Atual</option>
                                    <option value="heal_health">Restaurar Vida Atual</option>
                                    <option value="max_aura">Converter em Aura Máxima</option>
                                    <option value="max_health">Converter em Vida Máxima</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <button
                                    onClick={() => onUpdate && onUpdate({
                                        ...character,
                                        ozyState: { ...character.ozyState!, auraPlusEgoConversion: 'heal_aura' }
                                    })}
                                    className={`py-2 rounded-md text-xs font-semibold ${character.ozyState.auraPlusEgoConversion === 'heal_aura' ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                >
                                    Converter em Aura
                                </button>
                                <button
                                    onClick={() => onUpdate && onUpdate({
                                        ...character,
                                        ozyState: { ...character.ozyState!, auraPlusEgoConversion: 'heal_health' }
                                    })}
                                    className={`py-2 rounded-md text-xs font-semibold ${character.ozyState.auraPlusEgoConversion === 'heal_health' ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                >
                                    Converter em Vida
                                </button>
                                <button
                                    onClick={() => onUpdate && onUpdate({
                                        ...character,
                                        ozyState: { ...character.ozyState!, auraPlusEgoConversion: 'max_aura' }
                                    })}
                                    className={`py-2 rounded-md text-xs font-semibold ${character.ozyState.auraPlusEgoConversion === 'max_aura' ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                >
                                    Aura Máxima
                                </button>
                                <button
                                    onClick={() => onUpdate && onUpdate({
                                        ...character,
                                        ozyState: { ...character.ozyState!, auraPlusEgoConversion: 'max_health' }
                                    })}
                                    className={`py-2 rounded-md text-xs font-semibold ${character.ozyState.auraPlusEgoConversion === 'max_health' ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                >
                                    Vida Máxima
                                </button>
                            </div>
                            <p className="text-xs text-gray-400">
                                A contagem de alvos e validações de intimidação é definida no painel do Mestre.
                            </p>
                        </div>
                    )}

                    {isMatheus && character.matheusState && (
                        <div className="bg-gray-900 p-3 rounded-md border border-emerald-800 space-y-3">
                            <h4 className="font-bold text-emerald-300">Matheus: Prospecção Intuitiva</h4>
                            {character.matheusState.isChoosingProspectionAction && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <select value={matheusAction} onChange={event => setMatheusAction(event.target.value as any)} className="p-2 bg-gray-700 rounded-md text-sm">
                                        <option value="replicar">Replicar Habilidade</option>
                                        <option value="expor">Descobrir e Expor Pontos Fracos</option>
                                        <option value="sugerir_controlar">Sugerir/Controlar Alvos</option>
                                    </select>
                                    <select
                                        value={matheusTarget}
                                        onChange={event => {
                                            setMatheusTarget(event.target.value);
                                            setMatheusCopiedTechnique('');
                                        }}
                                        className="p-2 bg-gray-700 rounded-md text-sm"
                                    >
                                        <option value="inimigo">Inimigo</option>
                                        {allCharacters.filter(c => c.id !== character.id).map(other => (
                                            <option key={other.id} value={other.id}>{other.name}</option>
                                        ))}
                                    </select>
                                    {matheusAction === 'replicar' && selectedMatheusTargetCharacter && (
                                        <select
                                            value={matheusCopiedTechnique}
                                            onChange={event => setMatheusCopiedTechnique(event.target.value)}
                                            className="md:col-span-2 p-2 bg-gray-700 rounded-md text-sm"
                                        >
                                            <option value="">Selecione a técnica para copiar</option>
                                            {selectedMatheusTargetCharacter.techniques.map(technique => (
                                                <option key={technique.name} value={technique.name}>{technique.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    {matheusAction === 'replicar' && (
                                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                max={10}
                                                value={matheusConjurationUses}
                                                onChange={event => setMatheusConjurationUses(parseInt(event.target.value, 10) || 1)}
                                                className="p-2 bg-gray-700 rounded-md text-sm"
                                                placeholder="Usos/Fases da habilidade copiada"
                                            />
                                            <div className="p-2 bg-gray-700 rounded-md text-xs text-gray-200">
                                                Custo por uso: {matheusCostPerUse}. Custo adicional agora: {Math.max(0, (Math.max(1, matheusConjurationUses || 1) - 1) * matheusCostPerUse)}.
                                            </div>
                                        </div>
                                    )}
                                    <textarea
                                        value={matheusDetails}
                                        onChange={event => setMatheusDetails(event.target.value)}
                                        rows={2}
                                        placeholder="Detalhes narrativos da ação (opcional)"
                                        className="md:col-span-2 p-2 bg-gray-700 rounded-md text-sm"
                                    />
                                    <button onClick={handleMatheusProspectionSubmit} className="md:col-span-2 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md font-semibold">
                                        Enviar Solicitação ao Mestre
                                    </button>
                                </div>
                            )}
                            {character.matheusState.pendingRequest && (
                                <p className="text-sm text-yellow-300">
                                    Solicitação pendente: {character.matheusState.pendingRequest.action} em {character.matheusState.pendingRequest.target}
                                    {character.matheusState.pendingRequest.copiedTechniqueName ? ` (cópia: ${character.matheusState.pendingRequest.copiedTechniqueName})` : ''}.
                                </p>
                            )}
                            {character.matheusState.lastResolvedRequest && (
                                <p className="text-xs text-gray-400">
                                    Último retorno do Mestre: {character.matheusState.lastResolvedRequest.masterResult || 'Sem descrição adicional.'}
                                    {character.matheusState.lastResolvedRequest.testOutcome ? ` | Teste: ${character.matheusState.lastResolvedRequest.testOutcome === 'success' ? 'sucesso' : 'falha'}` : ''}
                                    {character.matheusState.lastResolvedRequest.additionalDamage ? ` | Dano extra: +${character.matheusState.lastResolvedRequest.additionalDamage}` : ''}
                                </p>
                            )}
                        </div>
                    )}

                    {isGabriel && character.gabrielState && (
                        <div className="bg-gray-900 p-3 rounded-md border border-violet-800 space-y-4">
                            <h4 className="font-bold text-violet-300">Gabriel: Regras, Taverna e Tokens</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                                <p><span className="text-gray-400">Dia atual:</span> <span className="font-semibold">{currentDay}</span></p>
                                <p><span className="text-gray-400">Escudos restantes:</span> <span className="font-semibold">{character.gabrielState.escudoDoMestreUsesRemaining}/5</span></p>
                                <p><span className="text-gray-400">Taverna:</span> <span className="font-semibold">{character.gabrielState.tavern.isActive ? `Ativa até dia ${character.gabrielState.tavern.activeUntilDay}` : 'Inativa'}</span></p>
                                <p><span className="text-gray-400">Escudo armado:</span> <span className="font-semibold">{character.gabrielState.armedEscudoDoMestre ? 'Sim' : 'Não'}</span></p>
                                <p><span className="text-gray-400">Regra armada:</span> <span className="font-semibold">{character.gabrielState.armedRegrasDaCasa ? 'Sim' : 'Não'}</span></p>
                                <p><span className="text-gray-400">Tokens armado:</span> <span className="font-semibold">{character.gabrielState.armedAjustarTokens ? 'Sim' : 'Não'}</span></p>
                            </div>
                            <p className="text-xs text-gray-400">
                                Regra ativa do dia: {character.gabrielState.activeHouseRuleId
                                    ? (character.gabrielState.storedHouseRules.find(rule => rule.id === character.gabrielState!.activeHouseRuleId)?.name || character.gabrielState.activeHouseRuleId)
                                    : 'nenhuma'}
                            </p>

                            <div className="space-y-2">
                                <h5 className="font-semibold text-violet-200 text-sm">Escudo do Mestre</h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <select value={gabrielEscudoKind} onChange={event => setGabrielEscudoKind(event.target.value as any)} className="p-2 bg-gray-700 rounded-md text-sm">
                                        <option value="narrativo">Narrativo</option>
                                        <option value="dano_extra">Dano Extra</option>
                                        <option value="resistencia">Resistência</option>
                                        <option value="atributo">Atributo</option>
                                        <option value="pericia">Perícia</option>
                                        <option value="vida">Vida</option>
                                        <option value="aura">Aura</option>
                                        <option value="cura">Cura</option>
                                    </select>
                                    <select value={gabrielEscudoTarget} onChange={event => setGabrielEscudoTarget(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm">
                                        <option value="si">Si mesmo</option>
                                        {allCharacters.map(other => (
                                            <option key={other.id} value={other.id}>{other.name}</option>
                                        ))}
                                    </select>
                                    <button onClick={handleGabrielEscudoSubmit} disabled={!character.gabrielState.armedEscudoDoMestre} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm disabled:bg-gray-700">Enviar ao Mestre</button>
                                    <textarea value={gabrielEscudoText} onChange={event => setGabrielEscudoText(event.target.value)} className="md:col-span-3 p-2 bg-gray-700 rounded-md text-sm" rows={2} placeholder="Descrição da regra/efeito" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h5 className="font-semibold text-violet-200 text-sm">Regras da Casa</h5>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                    <select value={gabrielHouseRuleMode} onChange={event => setGabrielHouseRuleMode(event.target.value as any)} className="p-2 bg-gray-700 rounded-md text-sm">
                                        <option value="new">Nova Regra</option>
                                        <option value="reuse">Reutilizar Regra</option>
                                    </select>
                                    {gabrielHouseRuleMode === 'new' ? (
                                        <>
                                            <input value={gabrielHouseRuleName} onChange={event => setGabrielHouseRuleName(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Nome da Regra" />
                                            <input type="number" min={1} max={3} value={gabrielHouseRuleUses} onChange={event => setGabrielHouseRuleUses(parseInt(event.target.value, 10) || 1)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Usos (1-3)" />
                                            <button onClick={handleGabrielHouseRuleSubmit} disabled={!character.gabrielState.armedRegrasDaCasa} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm disabled:bg-gray-700">Solicitar Validação</button>
                                            <textarea value={gabrielHouseRuleText} onChange={event => setGabrielHouseRuleText(event.target.value)} className="md:col-span-4 p-2 bg-gray-700 rounded-md text-sm" rows={2} placeholder="Texto da regra" />
                                        </>
                                    ) : (
                                        <>
                                            <select value={gabrielReuseRuleId} onChange={event => setGabrielReuseRuleId(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm md:col-span-2">
                                                <option value="">Selecione uma regra salva</option>
                                                {character.gabrielState.storedHouseRules.map(rule => (
                                                    <option key={rule.id} value={rule.id}>{rule.name}</option>
                                                ))}
                                            </select>
                                            <input type="number" min={1} max={3} value={gabrielHouseRuleUses} onChange={event => setGabrielHouseRuleUses(parseInt(event.target.value, 10) || 1)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Usos (1-3)" />
                                            <button onClick={handleGabrielHouseRuleSubmit} disabled={!character.gabrielState.armedRegrasDaCasa} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm disabled:bg-gray-700">Reutilizar (sem validação)</button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h5 className="font-semibold text-violet-200 text-sm">Ajustar Tokens da Party</h5>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                    <select value={gabrielTokenMoveType} onChange={event => setGabrielTokenMoveType(event.target.value as any)} className="p-2 bg-gray-700 rounded-md text-sm">
                                        <option value="self">Mover a si mesmo</option>
                                        <option value="ally">Mover aliado</option>
                                        <option value="enemy">Mover inimigo</option>
                                    </select>
                                    <select value={gabrielTokenTarget} onChange={event => setGabrielTokenTarget(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm">
                                        <option value="si">Si mesmo</option>
                                        {allCharacters.map(other => (
                                            <option key={other.id} value={other.id}>{other.name}</option>
                                        ))}
                                    </select>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={gabrielTokenVoluntary} onChange={event => setGabrielTokenVoluntary(event.target.checked)} />
                                        Aliado voluntário
                                    </label>
                                    <button onClick={handleGabrielTokenAdjustSubmit} disabled={!character.gabrielState.armedAjustarTokens} className="py-2 bg-violet-600 hover:bg-violet-700 rounded-md font-semibold text-sm disabled:bg-gray-700">Enviar ao Mestre</button>
                                </div>
                            </div>

                            {character.gabrielState.pendingEscudoRequest && (
                                <p className="text-xs text-yellow-300">Escudo do Mestre aguardando validação.</p>
                            )}
                            {character.gabrielState.pendingHouseRuleRequest && (
                                <p className="text-xs text-yellow-300">Regra da casa aguardando validação.</p>
                            )}
                            {character.gabrielState.pendingTokenAdjustRequest && (
                                <p className="text-xs text-yellow-300">Ajuste de tokens aguardando validação.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {!isMasterView && activeTavern && activeTavernOwner && (
                <div className="bg-gray-800 p-4 rounded-lg border border-amber-700 space-y-3">
                    <h3 className="text-xl font-bold text-amber-300">Carvalho Ensandecido</h3>
                    <p className="text-sm text-gray-300">
                        Taverna conjurada por {activeTavernOwner.name}. Interações hoje: {tavernInteractionsUsed}/3. Já interagiu nesta rodada: {hasUsedTavernThisRound ? 'Sim' : 'Não'}.
                    </p>
                    <p className="text-xs text-gray-400">
                        Opções já usadas hoje: {tavernUsedOptions.length > 0 ? tavernUsedOptions.join(', ') : 'nenhuma'}.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <button onClick={handleTavernBuyInfo} className="py-2 bg-amber-600 hover:bg-amber-700 rounded-md font-semibold text-sm disabled:bg-gray-700" disabled={tavernUsedOptions.includes('buy_info') || tavernInteractionsUsed >= 3 || hasUsedTavernThisRound}>
                            Comprar Informação ({activeTavern.infoPrice})
                        </button>
                        <button onClick={handleTavernBuyFood} className="py-2 bg-amber-600 hover:bg-amber-700 rounded-md font-semibold text-sm disabled:bg-gray-700" disabled={tavernUsedOptions.includes('buy_food') || tavernInteractionsUsed >= 3 || hasUsedTavernThisRound}>
                            Comprar Comida ({activeTavern.foodPrice})
                        </button>
                        <button onClick={handleTavernRentLodging} className="py-2 bg-amber-600 hover:bg-amber-700 rounded-md font-semibold text-sm disabled:bg-gray-700" disabled={tavernUsedOptions.includes('rent_lodging') || tavernInteractionsUsed >= 3 || hasUsedTavernThisRound}>
                            Alugar Estalagem ({activeTavern.lodgingPrice})
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select value={selectedTavernItemId} onChange={event => setSelectedTavernItemId(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm">
                            <option value="">Selecione item para comprar</option>
                            {activeTavern.items.map(item => (
                                <option key={item.id} value={item.id}>{item.name} ({item.price})</option>
                            ))}
                        </select>
                        <button onClick={handleTavernBuyItem} className="py-2 bg-amber-600 hover:bg-amber-700 rounded-md font-semibold text-sm disabled:bg-gray-700" disabled={!selectedTavernItemId || tavernUsedOptions.includes('buy_item') || tavernInteractionsUsed >= 3 || hasUsedTavernThisRound}>
                            Comprar Item
                        </button>
                        <div className="text-xs text-gray-400 flex items-center">Banco da taverna: {activeTavern.bankAuraCoins}</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select value={selectedMissionId} onChange={event => setSelectedMissionId(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm">
                            <option value="">Selecione missão</option>
                            {activeTavern.missions.filter(mission => !mission.completed && !mission.acceptedByCharacterId).map(mission => (
                                <option key={mission.id} value={mission.id}>{mission.title} ({mission.rewardAuraCoins})</option>
                            ))}
                        </select>
                        <button onClick={handleTavernAcceptMission} className="py-2 bg-amber-600 hover:bg-amber-700 rounded-md font-semibold text-sm disabled:bg-gray-700" disabled={!selectedMissionId || tavernUsedOptions.includes('accept_mission') || tavernInteractionsUsed >= 3 || hasUsedTavernThisRound}>
                            Ver e Aceitar Missão
                        </button>
                        <div className="text-xs text-gray-400 flex items-center">
                            Missão ativa: {character.activeTavernMissionId ? (activeTavern.missions.find(mission => mission.id === character.activeTavernMissionId)?.title || character.activeTavernMissionId) : 'nenhuma'}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input value={sellItemName} onChange={event => setSellItemName(event.target.value)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Item para vender" />
                        <input type="number" value={sellRequestedPrice} onChange={event => setSellRequestedPrice(parseInt(event.target.value, 10) || 0)} className="p-2 bg-gray-700 rounded-md text-sm" placeholder="Preço pedido" />
                        <button onClick={handleTavernSellItemRequest} className="py-2 bg-amber-600 hover:bg-amber-700 rounded-md font-semibold text-sm disabled:bg-gray-700" disabled={!sellItemName.trim() || tavernUsedOptions.includes('sell_item') || tavernInteractionsUsed >= 3 || hasUsedTavernThisRound}>
                            Solicitar Venda de Item
                        </button>
                        <div className="text-xs text-gray-400 flex items-center">
                            {character.pendingTavernSellRequest
                                ? `Venda pendente: ${character.pendingTavernSellRequest.itemName} (${character.pendingTavernSellRequest.requestedPrice})`
                                : 'Sem venda pendente'}
                        </div>
                    </div>
                </div>
            )}

            {!isMasterView && hasParadoxGrimoire && (
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <button
                        onClick={() => setIsParadoxGrimoireOpen(prev => !prev)}
                        className="w-full flex items-center justify-between text-left"
                    >
                        <span className="text-xl font-bold text-yellow-400">Grimório de Habilidades de Jhuan</span>
                        <span className="text-sm font-semibold text-cyan-300">
                            {isParadoxGrimoireOpen ? 'Ocultar' : 'Mostrar'}
                        </span>
                    </button>
                    {isParadoxGrimoireOpen && (
                        <div className="mt-4 space-y-2">
                            <p className="text-xs text-gray-400">Clique no nome da arma para ver imagem, efeito, buff e debuff. (Perguntas do mestre permanecem ocultas.)</p>
                            {paradoxEquipmentList.map(weapon => {
                                const isExpanded = Boolean(expandedGrimoireWeapons[weapon.id]);
                                return (
                                    <div key={weapon.id} className="bg-gray-900 rounded-md border border-gray-700">
                                        <button
                                            onClick={() => toggleGrimoireWeapon(weapon.id)}
                                            className="w-full p-3 flex items-center justify-between text-left"
                                        >
                                            <span className="font-semibold text-white">{weapon.id}. {weapon.name}</span>
                                            <span className="text-xs text-cyan-300">{isExpanded ? 'Fechar' : 'Abrir'}</span>
                                        </button>
                                        {isExpanded && (
                                            <div className="px-3 pb-3">
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <img
                                                        src={weapon.imageUrl}
                                                        alt={weapon.name}
                                                        className="w-20 h-20 rounded-md object-cover bg-gray-700"
                                                    />
                                                    <div className="text-sm text-gray-300 space-y-1">
                                                        <p><span className="text-cyan-300 font-semibold">Efeito:</span> {weapon.description}</p>
                                                        <p><span className="text-green-300 font-semibold">Buff:</span> {weapon.buff}</p>
                                                        <p><span className="text-red-300 font-semibold">Debuff:</span> {weapon.debuff}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CharacterSheet;



