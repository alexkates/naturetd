grant select on table public.profiles to anon, authenticated;
grant insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.game_saves to authenticated;
grant select on table public.game_runs to anon, authenticated;
grant insert on table public.game_runs to authenticated;
