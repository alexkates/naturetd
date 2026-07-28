-- Profiles, in-progress game saves, and the finished-run leaderboard.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 2 and 24
  )
);

-- Leaderboard names are public identities, so they must be unique case-insensitively.
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(btrim(display_name)));

-- One resumable run per player; a finished run clears it.
create table if not exists public.game_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  wave integer not null default 0,
  updated_at timestamptz not null default now()
);

-- user_id points at profiles (not auth.users) so PostgREST can embed the
-- leaderboard display name in a single request.
create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  played_at timestamptz not null default now(),
  wave integer not null,
  seed bigint not null,
  towers jsonb not null default '[]'::jsonb,
  buffs jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  kills numeric generated always as (coalesce((stats ->> 'kills')::numeric, 0)) stored,
  damage numeric generated always as (coalesce((stats ->> 'damage')::numeric, 0)) stored,
  battle_time numeric generated always as (coalesce((stats ->> 'battleTime')::numeric, 0)) stored
);

create index if not exists game_runs_user_id_played_at_idx
  on public.game_runs (user_id, played_at desc);

-- Matches the client leaderboard ordering: wave, kills, damage, fastest time.
create index if not exists game_runs_ranking_idx
  on public.game_runs (wave desc, kills desc, damage desc, battle_time asc);

alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;
alter table public.game_runs enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "Users insert their own profile" on public.profiles;
create policy "Users insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users read their own save" on public.game_saves;
create policy "Users read their own save"
  on public.game_saves for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users write their own save" on public.game_saves;
create policy "Users write their own save"
  on public.game_saves for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own save" on public.game_saves;
create policy "Users update their own save"
  on public.game_saves for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own save" on public.game_saves;
create policy "Users delete their own save"
  on public.game_saves for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Runs are publicly readable" on public.game_runs;
create policy "Runs are publicly readable"
  on public.game_runs for select
  using (true);

drop policy if exists "Users insert their own runs" on public.game_runs;
create policy "Users insert their own runs"
  on public.game_runs for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists game_saves_touch_updated_at on public.game_saves;
create trigger game_saves_touch_updated_at
  before update on public.game_saves
  for each row execute function public.touch_updated_at();
