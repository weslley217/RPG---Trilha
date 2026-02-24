# RPG - Trilha (Dashboard)

Projeto React + TypeScript com persistência em Supabase para usuários, estado da campanha, personagens, técnicas, efeitos e equipamentos.

## Requisitos

- Node.js 20+
- Projeto Supabase ativo

## Configuração do Supabase

1. Abra o SQL Editor do seu projeto Supabase.
2. Execute o script `supabase/schema.sql` (inclui tabelas + bucket `rpg-images` para upload de imagens).
3. Crie um arquivo `.env.local` na raiz do projeto com:

```env
VITE_SUPABASE_URL=https://hmqznjjfzllkxeqqjrzm.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_iqgn7xc6giRLAFEKiDfnHA_rzkErpeH
```

Observação:
- O script já insere os usuários base e cria o registro inicial da campanha.
- Na primeira execução, o app completa automaticamente o estado completo da campanha no `campaign_states`.

## Rodando localmente

1. Instale dependências:
   `npm install`
2. Inicie em modo desenvolvimento:
   `npm run dev`
3. Build de produção:
   `npm run build`
