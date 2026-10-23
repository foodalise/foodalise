-- Website lookups on the dashboard: how many times the menu finder used OpenStreetMap,
-- Google and web search this month and last, how many found a website, and the monthly
-- limits for Google and web search, which the team can change on the dashboard.
--
-- Counts live in google_lookups (month -> count), one row per service and month:
--   '2026-10' Google (the original key), 'search-2026-10' web search, 'osm-2026-10' the map,
--   and 'google-found-2026-10', 'search-found-2026-10', 'osm-found-2026-10' for websites found.

create table public.lookup_limits (
  service text primary key check (service in ('google', 'search')),
  monthly_cap integer not null check (monthly_cap between 0 and 100000)
);
alter table public.lookup_limits enable row level security;
-- No policies: fetch-menu reads it with the service key; the team changes it through admin_set_lookup_limit.

-- Google: 1,000 free a month, so 950 never bills. Web search: about 1-2p each, 250 is about £4.
insert into public.lookup_limits (service, monthly_cap) values ('google', 950), ('search', 250);

create function public.admin_lookups() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  this_month text := to_char(now(), 'YYYY-MM');
  last_month text := to_char(now() - interval '1 month', 'YYYY-MM');
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return (
    select jsonb_agg(jsonb_build_object(
      'service', s.service,
      'used', coalesce((select count from public.google_lookups where month = s.used_prefix || this_month), 0),
      'found', coalesce((select count from public.google_lookups where month = s.service || '-found-' || this_month), 0),
      'used_last_month', coalesce((select count from public.google_lookups where month = s.used_prefix || last_month), 0),
      'found_last_month', coalesce((select count from public.google_lookups where month = s.service || '-found-' || last_month), 0),
      'cap', (select monthly_cap from public.lookup_limits l where l.service = s.service)
    ) order by s.position)
    from (values (1, 'osm', 'osm-'), (2, 'google', ''), (3, 'search', 'search-')) as s(position, service, used_prefix)
  );
end;
$$;
grant execute on function public.admin_lookups() to authenticated;

create function public.admin_set_lookup_limit(service text, monthly_cap integer) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if service not in ('google', 'search') then raise exception 'Unknown lookup'; end if;
  if monthly_cap is null or monthly_cap < 0 or monthly_cap > 100000 then raise exception 'Pick a number from 0 to 100,000'; end if;
  insert into public.lookup_limits as l (service, monthly_cap) values (admin_set_lookup_limit.service, admin_set_lookup_limit.monthly_cap)
  on conflict (service) do update set monthly_cap = excluded.monthly_cap;
end;
$$;
grant execute on function public.admin_set_lookup_limit(text, integer) to authenticated;
