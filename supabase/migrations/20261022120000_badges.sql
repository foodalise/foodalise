-- Badges on profiles, worked out from what people have already posted, so
-- there is nothing to store and everyone's past reviews count straight away.
-- Returns every badge with progress towards it; `earned` says which are won.

create or replace function public.user_badges(uid uuid) returns table (
  key text, emoji text, name text, detail text, progress integer, goal integer, earned boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (
    select v.id, v.dish_id, v.created_at, v.like_count, d.restaurant_id, r.cuisine, r.local_authority
    from reviews v join dishes d on d.id = v.dish_id join restaurants r on r.id = d.restaurant_id
    where v.user_id = uid
  ), counts as (
    select count(*)::int as reviews,
      count(distinct restaurant_id)::int as places,
      count(distinct cuisine)::int as cuisines,
      coalesce(sum(like_count), 0)::int as likes,
      (select count(*)::int from mine m where not exists (
        select 1 from reviews o where o.dish_id = m.dish_id and o.created_at < m.created_at)) as firsts
    from mine
  ), fixed (key, emoji, name, detail, progress, goal, ord) as (
    select 'first', '🍽️', 'First bite', 'Post your first dish review', reviews, 1, 1 from counts
    union all select 'regular', '⭐', 'Regular', 'Review 10 dishes', reviews, 10, 2 from counts
    union all select 'critic', '📝', 'Critic', 'Review 50 dishes', reviews, 50, 3 from counts
    union all select 'legend', '👑', 'Legend', 'Review 100 dishes', reviews, 100, 4 from counts
    union all select 'explorer', '🧭', 'Explorer', 'Review dishes at 10 different places', places, 10, 5 from counts
    union all select 'globetrotter', '🌍', 'Globetrotter', 'Try 5 different cuisines', cuisines, 5, 6 from counts
    union all select 'pioneer', '🚩', 'Pioneer', 'Be the first to review a dish', firsts, 1, 7 from counts
    union all select 'trailblazer', '🔥', 'Trailblazer', 'Be the first to review 10 dishes', firsts, 10, 8 from counts
    union all select 'crowd', '❤️', 'Crowd pleaser', 'Get 50 likes on your reviews', likes, 50, 9 from counts
  ), cuisine_fans as (
    -- "Curry lover": 10 dishes of one cuisine.
    select 'cuisine:' || cuisine, '🥢', cuisine || ' lover', 'Tried 10 ' || cuisine || ' dishes',
      count(*)::int, 10, 20
    from mine where cuisine is not null
    group by cuisine having count(*) >= 10
  ), local_hero as (
    -- Top reviewer in a council area (at least 5 reviews there).
    select 'local:' || a.local_authority, '🏆', 'Top reviewer in ' || a.local_authority,
      'Most dish reviews in ' || a.local_authority, a.n, a.n, 10
    from (select local_authority, count(*)::int as n from mine where local_authority is not null group by local_authority) a
    where a.n >= 5 and not exists (
      select 1 from reviews v join dishes d on d.id = v.dish_id join restaurants r on r.id = d.restaurant_id
      where r.local_authority = a.local_authority and v.user_id <> uid
      group by v.user_id having count(*) > a.n)
  )
  select key, emoji, name, detail, least(progress, goal), goal, progress >= goal
  from (select * from fixed union all select * from cuisine_fans union all select * from local_hero) b
  order by (progress >= goal) desc, ord, name;
$$;
grant execute on function public.user_badges(uuid) to authenticated;
