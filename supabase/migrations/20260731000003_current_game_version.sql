create table public.game_config (
  singleton boolean primary key default true check (singleton),
  current_game_version text not null
);

insert into public.game_config (singleton, current_game_version)
values (true, '0.2.1');

alter table public.game_config enable row level security;

create policy "Current game version is publicly readable"
  on public.game_config for select
  using (true);

grant select on public.game_config to anon, authenticated;

create or replace view public.leaderboard
with (security_invoker = true)
as
select
  game_runs.id,
  game_runs.played_at,
  game_runs.wave,
  game_runs.seed,
  game_runs.towers,
  game_runs.buffs,
  game_runs.stats,
  profiles.display_name as name
from public.game_runs
join public.profiles on profiles.id = game_runs.user_id
join public.game_config on game_config.singleton
where game_runs.game_version = game_config.current_game_version;
