-- Safety checks before launch (Apple's rules for apps where people post, and the
-- UK Online Safety Act):
--   * people can report a profile (an offensive username, name, bio or photo), not only
--     reviews and comments, and the team can keep it or reset it from the dashboard;
--   * reviews, comments and profiles can't contain slurs or explicit words.

-- 1. Reporting a profile.
alter table public.reports
  add column profile_id uuid references public.profiles on delete cascade,
  drop constraint reports_one_target,
  add constraint reports_one_target check (num_nonnulls(review_id, comment_id, profile_id) = 1);
create unique index reports_once_per_profile on public.reports (reporter_id, profile_id);

-- Everything reported, newest first: reviews, comments and profiles together.
create or replace function public.admin_reports() returns table (
  report_id uuid, kind text, reported_at timestamptz, reason text, reported_by text,
  author text, target_id uuid, review_id uuid, dish text, body text, reports integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
  select rp.id,
    case when rp.profile_id is not null then 'profile' when rp.comment_id is not null then 'comment' else 'review' end,
    rp.created_at, rp.reason,
    reporter.username,
    coalesce(pa.username, ca.username, ra.username),
    coalesce(rp.profile_id, rp.comment_id, rp.review_id),
    coalesce(c.review_id, rp.review_id),
    d.name,
    case when rp.profile_id is not null
      then concat_ws(' · ', nullif(pa.display_name, ''), nullif(pa.bio, ''), case when pa.avatar_path is not null then '(has a profile photo)' end)
      else coalesce(c.body, rv.body) end,
    (select count(*)::int from public.reports x
     where x.review_id is not distinct from rp.review_id and x.comment_id is not distinct from rp.comment_id
       and x.profile_id is not distinct from rp.profile_id)
  from public.reports rp
  join public.profiles reporter on reporter.id = rp.reporter_id
  left join public.profiles pa on pa.id = rp.profile_id
  left join public.review_comments c on c.id = rp.comment_id
  left join public.profiles ca on ca.id = c.user_id
  left join public.reviews rv on rv.id = coalesce(c.review_id, rp.review_id)
  left join public.profiles ra on ra.id = rv.user_id
  left join public.dishes d on d.id = rv.dish_id
  order by rp.created_at desc
  limit 200;
end;
$$;

-- Remove a reported review or comment (its reports go with it). For a profile,
-- "remove" resets it: a plain username, and no name, bio or photo.
create or replace function public.admin_remove(kind text, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if kind = 'review' then delete from public.reviews where id = target;
  elsif kind = 'comment' then delete from public.review_comments where id = target;
  elsif kind = 'profile' then
    update public.profiles
      set username = 'user_' || left(replace(id::text, '-', ''), 10), display_name = null, bio = null, avatar_path = null
      where id = target;
    delete from public.reports where profile_id = target;
  else raise exception 'Unknown kind %', kind;
  end if;
end;
$$;

-- Keep it: clear every report about that review, comment or profile.
create or replace function public.admin_dismiss(kind text, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if kind = 'review' then delete from public.reports where review_id = target;
  elsif kind = 'comment' then delete from public.reports where comment_id = target;
  else delete from public.reports where profile_id = target;
  end if;
end;
$$;

-- 2. Words nobody can post: slurs and explicit words. Matched as whole words, so
-- "spice" or "Scunthorpe" are fine; digits, dots and underscores count as gaps, so
-- usernames can't hide them either. Add to the list here if something gets through.
create function public.has_blocked_words(t text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(regexp_replace(lower(t), '[0-9_.]+', ' ', 'g') ~
    '\m(nigg(a|as|er|ers|az)|fag|fags|faggot|faggots|retard|retards|retarded|paki|pakis|chink|chinks|spic|spics|kike|kikes|tranny|trannies|wog|wogs|gook|gooks|cunt|cunts|whore|whores|slut|sluts|porn)\M', false);
$$;

-- Checks the columns named in the trigger's arguments.
create function public.reject_blocked_words() returns trigger
language plpgsql set search_path = '' as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if public.has_blocked_words(to_jsonb(new) ->> col) then
      raise exception 'That has words we don''t allow on Foodalise. Please change it and try again.' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

create trigger reviews_no_blocked_words before insert or update of body on public.reviews
  for each row execute function public.reject_blocked_words('body');
create trigger comments_no_blocked_words before insert or update of body on public.review_comments
  for each row execute function public.reject_blocked_words('body');
create trigger profiles_no_blocked_words before insert or update of username, display_name, bio on public.profiles
  for each row execute function public.reject_blocked_words('username', 'display_name', 'bio');

grant execute on function public.has_blocked_words(text) to anon, authenticated;
