-- Two more things on the dashboard:
--   * how much space photos and the database take up (Supabase's free plan allows
--     1 GB of files and 500 MB of database);
--   * a Track list of everyone who has signed up, with how many times they've used the app.

-- One row per person: how many visits and when they last had the app open. A visit is
-- opening the app, or coming back to it after 30 minutes or more away.
create table public.app_visits (
  user_id uuid primary key references public.profiles on delete cascade,
  visits integer not null default 0,
  last_seen timestamptz not null default now()
);
alter table public.app_visits enable row level security;
-- No policies: the app records visits through record_visit, and only the team reads them.

-- The app calls this when it opens or comes back to the front.
create function public.record_visit() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then return; end if;
  insert into public.app_visits as v (user_id, visits, last_seen) values (me, 1, now())
  on conflict (user_id) do update
    set visits = v.visits + case when v.last_seen < now() - interval '30 minutes' then 1 else 0 end,
        last_seen = now();
end;
$$;
grant execute on function public.record_visit() to authenticated;

create function public.admin_storage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'file_bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o),
    'files', (select count(*) from storage.objects),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;
grant execute on function public.admin_storage() to authenticated;

-- Everyone who has signed up, newest first.
create function public.admin_people() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return (
    select coalesce(jsonb_agg(x order by x.joined desc), '[]'::jsonb)
    from (
      select p.id, p.username, p.display_name, p.created_at as joined,
        coalesce(v.visits, 0) as visits, v.last_seen,
        (select count(*) from public.reviews r where r.user_id = p.id) as reviews
      from public.profiles p
      left join public.app_visits v on v.user_id = p.id
    ) x
  );
end;
$$;
grant execute on function public.admin_people() to authenticated;

revoke execute on function public.record_visit(), public.admin_storage(), public.admin_people() from public, anon;
