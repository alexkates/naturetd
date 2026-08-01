create table if not exists public.campaign_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null default '{"version":1,"completedNodeIds":[],"activeNodeId":null,"activeGame":null}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.campaign_progress enable row level security;

drop policy if exists "Users read their campaign progress" on public.campaign_progress;
create policy "Users read their campaign progress"
  on public.campaign_progress for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users insert their campaign progress" on public.campaign_progress;
create policy "Users insert their campaign progress"
  on public.campaign_progress for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users update their campaign progress" on public.campaign_progress;
create policy "Users update their campaign progress"
  on public.campaign_progress for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on table public.campaign_progress to authenticated;

drop trigger if exists campaign_progress_touch_updated_at on public.campaign_progress;
create trigger campaign_progress_touch_updated_at
  before update on public.campaign_progress
  for each row execute function public.touch_updated_at();
