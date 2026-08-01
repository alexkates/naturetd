alter table public.game_runs
  add column game_version text;

update public.game_runs
set game_version = '0.1.0'
where game_version is null;

alter table public.game_runs
  alter column game_version set not null;

create index game_runs_game_version_ranking_idx
  on public.game_runs (game_version, kills desc, wave desc, damage desc, battle_time asc);

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
where game_runs.game_version = '0.2.1';

grant select on public.leaderboard to anon, authenticated;
