-- Jay's private dashboard: numbers on how Foodalise is doing, plus reported
-- reviews and comments to keep or remove. Only people listed in `admins` can
-- use any of it; nobody can add themselves through the app.
--
-- To make yourself an admin, run this once with your own sign-in email:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';

create table public.admins (
  user_id uuid primary key references public.profiles on delete cascade
);
alter table public.admins enable row level security;
-- No policies: the app can't read or change this table directly.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
grant execute on function public.is_admin() to authenticated;

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'people', (select count(*) from public.profiles),
    'people_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'people_today', (select count(*) from public.profiles where created_at > date_trunc('day', now())),
    'reviews', (select count(*) from public.reviews),
    'reviews_7d', (select count(*) from public.reviews where created_at > now() - interval '7 days'),
    'reviews_today', (select count(*) from public.reviews where created_at > date_trunc('day', now())),
    'photos', (select count(*) from public.review_photos),
    'likes', (select count(*) from public.review_likes),
    'comments', (select count(*) from public.review_comments),
    'active_7d', (select count(distinct user_id) from public.reviews where created_at > now() - interval '7 days'),
    'open_reports', (select count(*) from public.reports),
    'per_day', (
      select jsonb_agg(jsonb_build_object('day', d::date, 'reviews', coalesce(n, 0), 'people', coalesce(p, 0)) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
      left join (select date_trunc('day', created_at) as day, count(*) as n from public.reviews group by 1) r on r.day = d
      left join (select date_trunc('day', created_at) as day, count(*) as p from public.profiles group by 1) u on u.day = d
    ),
    'top_people', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.username, count(*) as reviews from public.reviews v join public.profiles p on p.id = v.user_id
        where v.created_at > now() - interval '7 days' group by p.username order by 2 desc limit 5) x
    ),
    'top_places', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select r.name, count(*) as reviews from public.reviews v join public.dishes d on d.id = v.dish_id
        join public.restaurants r on r.id = d.restaurant_id
        group by r.id, r.name order by 2 desc limit 5) x
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_stats() to authenticated;

-- Everything reported, newest first: reviews and comments together.
create function public.admin_reports() returns table (
  report_id uuid, kind text, reported_at timestamptz, reason text, reported_by text,
  author text, target_id uuid, review_id uuid, dish text, body text, reports integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
  select rp.id, case when rp.comment_id is null then 'review' else 'comment' end, rp.created_at, rp.reason,
    reporter.username,
    coalesce(ca.username, ra.username),
    coalesce(rp.comment_id, rp.review_id),
    coalesce(c.review_id, rp.review_id),
    d.name,
    coalesce(c.body, rv.body),
    (select count(*)::int from public.reports x where x.review_id is not distinct from rp.review_id and x.comment_id is not distinct from rp.comment_id)
  from public.reports rp
  join public.profiles reporter on reporter.id = rp.reporter_id
  left join public.review_comments c on c.id = rp.comment_id
  left join public.profiles ca on ca.id = c.user_id
  left join public.reviews rv on rv.id = coalesce(c.review_id, rp.review_id)
  left join public.profiles ra on ra.id = rv.user_id
  left join public.dishes d on d.id = rv.dish_id
  order by rp.created_at desc
  limit 200;
end;
$$;
grant execute on function public.admin_reports() to authenticated;

-- Remove a reported review or comment (its reports go with it).
create function public.admin_remove(kind text, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if kind = 'review' then delete from public.reviews where id = target;
  elsif kind = 'comment' then delete from public.review_comments where id = target;
  else raise exception 'Unknown kind %', kind;
  end if;
end;
$$;
grant execute on function public.admin_remove(text, uuid) to authenticated;

-- Keep it: clear every report about that review or comment.
create function public.admin_dismiss(kind text, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if kind = 'review' then delete from public.reports where review_id = target and comment_id is null;
  else delete from public.reports where comment_id = target;
  end if;
end;
$$;
grant execute on function public.admin_dismiss(text, uuid) to authenticated;

revoke execute on function public.is_admin(), public.admin_stats(), public.admin_reports(),
  public.admin_remove(text, uuid), public.admin_dismiss(text, uuid) from public, anon;
