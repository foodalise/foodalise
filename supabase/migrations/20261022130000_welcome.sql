-- Welcome screens for new people: favourite cuisines, then a few people to follow.

alter table public.profiles
  add column favourite_cuisines text[] not null default '{}',
  add column onboarded_at timestamptz;

-- Everyone who already has an account has seen the app, so skip the welcome for them.
update public.profiles set onboarded_at = now() where onboarded_at is null;

-- People worth following: the most active reviewers, putting first those who
-- review the cuisines you picked. Skips you and anyone you already follow.
create or replace function public.suggested_people(cuisines text[] default '{}') returns table (
  id uuid, username text, avatar_path text, review_count integer, matching integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.username, p.avatar_path, count(v.id)::int,
    count(v.id) filter (where r.cuisine = any (cuisines))::int
  from profiles p
  join reviews v on v.user_id = p.id
  join dishes d on d.id = v.dish_id
  join restaurants r on r.id = d.restaurant_id
  where p.id <> (select auth.uid())
    and not exists (select 1 from follows f where f.follower_id = (select auth.uid()) and f.following_id = p.id)
    and not exists (select 1 from blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
  group by p.id
  order by 5 desc, 4 desc
  limit 12;
$$;
grant execute on function public.suggested_people(text[]) to authenticated;
