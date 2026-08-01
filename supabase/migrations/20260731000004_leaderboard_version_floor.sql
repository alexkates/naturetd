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
where game_runs.game_version ~ '^\\d+\\.\\d+\\.\\d+$'
  and string_to_array(game_runs.game_version, '.')::integer[] >= array[0, 2, 0];

drop table public.game_config;
