-- Who follows whom. Public to read; you can only follow or unfollow as yourself.

create table public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following on public.follows (following_id);

alter table public.follows enable row level security;

create policy "follows are public" on public.follows for select using (true);
create policy "follow as yourself" on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "unfollow as yourself" on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));
