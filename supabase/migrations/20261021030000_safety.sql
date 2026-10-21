-- Reporting and blocking, which the App Store requires for apps where people post
-- photos and reviews. Reports are read by the Foodalise team in the Supabase
-- dashboard (see reports_to_check); blocking hides that person's reviews from you.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles on delete cascade,
  review_id uuid not null references public.reviews on delete cascade,
  reason text not null check (char_length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (reporter_id, review_id)
);
alter table public.reports enable row level security;
create policy "report as yourself" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "see your own reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create table public.blocks (
  blocker_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
create policy "see your own blocks" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "block as yourself" on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "unblock as yourself" on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Blocking someone also ends any follow between you, both ways.
create function public.unfollow_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;
create trigger unfollow_on_block after insert on public.blocks
  for each row execute function public.unfollow_on_block();

-- Reviews stay public, except ones you reported and ones by people you blocked.
drop policy "reviews are public" on public.reviews;
create policy "reviews are public" on public.reviews for select using (
  not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = reviews.user_id)
  and not exists (select 1 from public.reports r where r.reporter_id = (select auth.uid()) and r.review_id = reviews.id)
);

-- For the team: open the SQL editor and run `select * from reports_to_check;`.
-- To remove a review, delete its row from the reviews table.
create view public.reports_to_check with (security_invoker = true) as
select rp.created_at as reported_at, rp.reason, reporter.username as reported_by,
       author.username as review_by, d.name as dish, rv.body as review_text, rv.id as review_id
from public.reports rp
join public.reviews rv on rv.id = rp.review_id
join public.profiles reporter on reporter.id = rp.reporter_id
join public.profiles author on author.id = rv.user_id
join public.dishes d on d.id = rv.dish_id
order by rp.created_at desc;
