-- RPG - Trilha | Estrutura Supabase
-- Execute este script no SQL Editor do projeto Supabase.

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

create table if not exists public.campaign_states (
    id text primary key,
    state jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

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

-- O app usa chave anônima e autenticação interna própria.
-- Portanto, as tabelas precisam aceitar acesso via role anon/authenticated.
alter table public.app_users disable row level security;
alter table public.campaign_states disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.app_users to anon, authenticated;
grant select, insert, update, delete on public.campaign_states to anon, authenticated;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

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

commit;
