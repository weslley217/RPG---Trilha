# RPG - Trilha (Dashboard)

Projeto React + TypeScript com persistencia em Supabase para usuarios, estado da campanha, personagens, tecnicas, efeitos e equipamentos.

## Requisitos

- Node.js 20+
- Projeto Supabase ativo

## Configuracao do Supabase

1. Abra o SQL Editor do seu projeto Supabase.
2. Execute o script `supabase/schema.sql` (inclui tabelas + bucket `rpg-images` para upload de imagens).
3. Crie um arquivo `.env.local` na raiz do projeto com:

```env
VITE_SUPABASE_URL=https://hmqznjjfzllkxeqqjrzm.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_iqgn7xc6giRLAFEKiDfnHA_rzkErpeH
```

Observacoes:
- O script ja insere os usuarios base.
- A persistencia da campanha foi segmentada em tabelas separadas (`campaign_meta`, `campaign_characters`, `campaign_equipment`, `campaign_bestiary_monsters`, `campaign_bestiary_notes`) para reduzir payload em tempo real.
- O app mantem fallback para `campaign_states` e migra automaticamente os dados legados para o modelo novo quando as tabelas segmentadas existem.

## Rodando localmente

1. Instale dependencias:
   `npm install`
2. Inicie em modo desenvolvimento:
   `npm run dev`
3. Build de producao:
   `npm run build`
