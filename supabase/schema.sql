-- RPG - Trilha | Estrutura Supabase
-- Execute este script no SQL Editor do projeto Supabase.
-- O script e idempotente e pode ser executado mais de uma vez.

begin;

create table if not exists public.app_users (
    id text primary key,
    username text not null,
    password text not null,
    role text not null check (role in ('MASTER', 'PLAYER')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists app_users_username_unique_idx on public.app_users (lower(username));

-- Legado: estado inteiro da campanha em JSON unico.
create table if not exists public.campaign_states (
    id text primary key,
    state jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Novo modelo: estado dividido por dominios para reduzir payload e conflito em realtime.
create table if not exists public.campaign_meta (
    id text primary key,
    turn_count integer not null default 0,
    current_day integer not null default 1,
    turn_order text[] not null default '{}'::text[],
    active_character_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.campaign_characters (
    campaign_id text not null,
    character_id text not null,
    position integer not null default 0,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (campaign_id, character_id)
);

create index if not exists campaign_characters_campaign_position_idx
    on public.campaign_characters (campaign_id, position);

create table if not exists public.campaign_equipment (
    campaign_id text not null,
    equipment_id integer not null,
    position integer not null default 0,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (campaign_id, equipment_id)
);

create index if not exists campaign_equipment_campaign_position_idx
    on public.campaign_equipment (campaign_id, position);

create table if not exists public.campaign_bestiary_monsters (
    campaign_id text not null,
    monster_id text not null,
    position integer not null default 0,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (campaign_id, monster_id)
);

create index if not exists campaign_bestiary_monsters_campaign_position_idx
    on public.campaign_bestiary_monsters (campaign_id, position);

create table if not exists public.campaign_bestiary_notes (
    campaign_id text not null,
    note_id text not null,
    position integer not null default 0,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (campaign_id, note_id)
);

create index if not exists campaign_bestiary_notes_campaign_position_idx
    on public.campaign_bestiary_notes (campaign_id, position);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_app_users on public.app_users;
create trigger trg_touch_updated_at_app_users
before update on public.app_users
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at_campaign_states on public.campaign_states;
create trigger trg_touch_updated_at_campaign_states
before update on public.campaign_states
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at_campaign_meta on public.campaign_meta;
create trigger trg_touch_updated_at_campaign_meta
before update on public.campaign_meta
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at_campaign_characters on public.campaign_characters;
create trigger trg_touch_updated_at_campaign_characters
before update on public.campaign_characters
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at_campaign_equipment on public.campaign_equipment;
create trigger trg_touch_updated_at_campaign_equipment
before update on public.campaign_equipment
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at_campaign_bestiary_monsters on public.campaign_bestiary_monsters;
create trigger trg_touch_updated_at_campaign_bestiary_monsters
before update on public.campaign_bestiary_monsters
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at_campaign_bestiary_notes on public.campaign_bestiary_notes;
create trigger trg_touch_updated_at_campaign_bestiary_notes
before update on public.campaign_bestiary_notes
for each row
execute function public.touch_updated_at();

-- O app usa chave anonima e autenticacao interna propria.
-- Portanto, as tabelas aceitam acesso via role anon/authenticated.
alter table public.app_users disable row level security;
alter table public.campaign_states disable row level security;
alter table public.campaign_meta disable row level security;
alter table public.campaign_characters disable row level security;
alter table public.campaign_equipment disable row level security;
alter table public.campaign_bestiary_monsters disable row level security;
alter table public.campaign_bestiary_notes disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.app_users to anon, authenticated;
grant select, insert, update, delete on public.campaign_states to anon, authenticated;
grant select, insert, update, delete on public.campaign_meta to anon, authenticated;
grant select, insert, update, delete on public.campaign_characters to anon, authenticated;
grant select, insert, update, delete on public.campaign_equipment to anon, authenticated;
grant select, insert, update, delete on public.campaign_bestiary_monsters to anon, authenticated;
grant select, insert, update, delete on public.campaign_bestiary_notes to anon, authenticated;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table public.campaign_states;
        exception when duplicate_object then null;
        end;

        begin
            alter publication supabase_realtime add table public.campaign_meta;
        exception when duplicate_object then null;
        end;

        begin
            alter publication supabase_realtime add table public.campaign_characters;
        exception when duplicate_object then null;
        end;

        begin
            alter publication supabase_realtime add table public.campaign_equipment;
        exception when duplicate_object then null;
        end;

        begin
            alter publication supabase_realtime add table public.campaign_bestiary_monsters;
        exception when duplicate_object then null;
        end;

        begin
            alter publication supabase_realtime add table public.campaign_bestiary_notes;
        exception when duplicate_object then null;
        end;
    end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'rpg-images',
    'rpg-images',
    true,
    10485760,
    array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rpg_images_public_read on storage.objects;
create policy rpg_images_public_read
on storage.objects
for select
to public
using (bucket_id = 'rpg-images');

drop policy if exists rpg_images_public_insert on storage.objects;
create policy rpg_images_public_insert
on storage.objects
for insert
to public
with check (bucket_id = 'rpg-images');

drop policy if exists rpg_images_public_update on storage.objects;
create policy rpg_images_public_update
on storage.objects
for update
to public
using (bucket_id = 'rpg-images')
with check (bucket_id = 'rpg-images');

drop policy if exists rpg_images_public_delete on storage.objects;
create policy rpg_images_public_delete
on storage.objects
for delete
to public
using (bucket_id = 'rpg-images');

insert into public.app_users (id, username, password, role)
values
    ('master01', 'mestre', 'mestre01', 'MASTER'),
    ('player04', 'Jhuans', 'resplandecido', 'PLAYER'),
    ('player05', 'Ozy', 'kamar', 'PLAYER'),
    ('player06', 'coruja_gay', 'pelorei', 'PLAYER'),
    ('player07', 'gabriel', 'sandman', 'PLAYER')
on conflict (id) do nothing;

insert into public.campaign_states (id, state)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- Migra dados do formato legado (JSON unico) para o modelo segmentado.
insert into public.campaign_meta (id, turn_count, current_day, turn_order, active_character_index)
select
    'main',
    case
        when coalesce(cs.state->>'turnCount', '') ~ '^-?[0-9]+$' then (cs.state->>'turnCount')::integer
        else 0
    end as turn_count,
    case
        when coalesce(cs.state->>'currentDay', '') ~ '^-?[0-9]+$' then (cs.state->>'currentDay')::integer
        else 1
    end as current_day,
    coalesce(
        array(
            select jsonb_array_elements_text(coalesce(cs.state->'turnOrder', '[]'::jsonb))
        ),
        '{}'::text[]
    ) as turn_order,
    case
        when coalesce(cs.state->>'activeCharacterIndex', '') ~ '^-?[0-9]+$' then (cs.state->>'activeCharacterIndex')::integer
        else 0
    end as active_character_index
from public.campaign_states cs
where cs.id = 'main'
  and not exists (
      select 1 from public.campaign_meta meta
      where meta.id = 'main'
  )
on conflict (id) do nothing;

insert into public.campaign_characters (campaign_id, character_id, position, data)
select
    'main' as campaign_id,
    coalesce(nullif(item.value->>'id', ''), 'legacy_character_' || item.ordinality::text) as character_id,
    (item.ordinality - 1)::integer as position,
    item.value as data
from public.campaign_states cs
cross join lateral jsonb_array_elements(coalesce(cs.state->'characters', '[]'::jsonb))
with ordinality as item(value, ordinality)
where cs.id = 'main'
  and not exists (
      select 1 from public.campaign_characters existing
      where existing.campaign_id = 'main'
  )
on conflict (campaign_id, character_id) do nothing;

insert into public.campaign_equipment (campaign_id, equipment_id, position, data)
select
    'main' as campaign_id,
    case
        when coalesce(item.value->>'id', '') ~ '^-?[0-9]+$' then (item.value->>'id')::integer
        else item.ordinality::integer
    end as equipment_id,
    (item.ordinality - 1)::integer as position,
    item.value as data
from public.campaign_states cs
cross join lateral jsonb_array_elements(coalesce(cs.state->'equipment', '[]'::jsonb))
with ordinality as item(value, ordinality)
where cs.id = 'main'
  and not exists (
      select 1 from public.campaign_equipment existing
      where existing.campaign_id = 'main'
  )
on conflict (campaign_id, equipment_id) do nothing;

insert into public.campaign_bestiary_monsters (campaign_id, monster_id, position, data)
select
    'main' as campaign_id,
    coalesce(nullif(item.value->>'id', ''), 'legacy_monster_' || item.ordinality::text) as monster_id,
    (item.ordinality - 1)::integer as position,
    item.value as data
from public.campaign_states cs
cross join lateral jsonb_array_elements(coalesce(cs.state->'bestiary'->'monsters', '[]'::jsonb))
with ordinality as item(value, ordinality)
where cs.id = 'main'
  and not exists (
      select 1 from public.campaign_bestiary_monsters existing
      where existing.campaign_id = 'main'
  )
on conflict (campaign_id, monster_id) do nothing;

insert into public.campaign_bestiary_notes (campaign_id, note_id, position, data)
select
    'main' as campaign_id,
    coalesce(nullif(item.value->>'id', ''), 'legacy_note_' || item.ordinality::text) as note_id,
    (item.ordinality - 1)::integer as position,
    item.value as data
from public.campaign_states cs
cross join lateral jsonb_array_elements(coalesce(cs.state->'bestiary'->'notes', '[]'::jsonb))
with ordinality as item(value, ordinality)
where cs.id = 'main'
  and not exists (
      select 1 from public.campaign_bestiary_notes existing
      where existing.campaign_id = 'main'
  )
on conflict (campaign_id, note_id) do nothing;

commit;
