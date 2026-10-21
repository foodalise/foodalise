-- Likes and comments on reviews. Each review keeps a running count of both so the
-- feed can show them without counting rows, and `liked_by_me` tells the app
-- whether the signed-in person has liked it.

alter table public.reviews
  add column like_count integer not null default 0,
  add column comment_count integer not null default 0;

create table public.review_likes (
  review_id uuid not null references public.reviews on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index review_likes_user on public.review_likes (user_id);
alter table public.review_likes enable row level security;
create policy "likes are public" on public.review_likes for select using (true);
create policy "like as yourself" on public.review_likes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "unlike as yourself" on public.review_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index review_comments_review on public.review_comments (review_id, created_at);
alter table public.review_comments enable row level security;
create policy "comment as yourself" on public.review_comments for insert to authenticated
  with check (user_id = (select auth.uid()));
-- You can delete your own comments, and any comment on your own review.
create policy "delete own or on own review" on public.review_comments for delete to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.reviews r where r.id = review_comments.review_id and r.user_id = (select auth.uid()))
);

-- Keep the counts on reviews up to date.
create function public.count_review_likes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reviews set like_count = like_count + case when tg_op = 'INSERT' then 1 else -1 end
  where id = coalesce(new.review_id, old.review_id);
  return null;
end;
$$;
create trigger count_review_likes after insert or delete on public.review_likes
  for each row execute function public.count_review_likes();

create function public.count_review_comments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reviews set comment_count = comment_count + case when tg_op = 'INSERT' then 1 else -1 end
  where id = coalesce(new.review_id, old.review_id);
  return null;
end;
$$;
create trigger count_review_comments after insert or delete on public.review_comments
  for each row execute function public.count_review_comments();

-- Read in a select as `liked_by_me`.
create function public.liked_by_me(public.reviews) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.review_likes l where l.review_id = $1.id and l.user_id = (select auth.uid()));
$$;

-- Comments can be reported like reviews: a report now names a review or a comment.
alter table public.reports
  add column comment_id uuid references public.review_comments on delete cascade,
  alter column review_id drop not null,
  add constraint reports_one_target check ((review_id is null) <> (comment_id is null));
create unique index reports_once_per_comment on public.reports (reporter_id, comment_id);

-- Hide comments you reported, as well as ones by people you blocked.
create policy "comments are public" on public.review_comments for select using (
  not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = review_comments.user_id)
  and not exists (select 1 from public.reports r where r.reporter_id = (select auth.uid()) and r.comment_id = review_comments.id)
);

-- For the team: `select * from comment_reports_to_check;` lists reported comments.
-- To remove a comment, delete its row from the review_comments table.
create view public.comment_reports_to_check with (security_invoker = true) as
select rp.created_at as reported_at, rp.reason, reporter.username as reported_by,
       author.username as comment_by, c.body as comment_text, c.id as comment_id, c.review_id
from public.reports rp
join public.review_comments c on c.id = rp.comment_id
join public.profiles reporter on reporter.id = rp.reporter_id
join public.profiles author on author.id = c.user_id
order by rp.created_at desc;
