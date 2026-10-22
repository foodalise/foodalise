-- "Something wrong with this menu?" reports on the team dashboard: one row per
-- restaurant, with what people said is wrong, and a way to clear them once checked.

create function public.admin_menu_reports() returns table (
  restaurant_id uuid, restaurant text, postcode text, problems text[], reports integer,
  last_reported timestamptz, reported_by text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
  select r.id, r.name, r.postcode,
    array_agg(distinct m.problem order by m.problem),
    count(*)::int,
    max(m.created_at),
    (select p.username from public.menu_reports x join public.profiles p on p.id = x.reporter_id
      where x.restaurant_id = r.id order by x.created_at desc limit 1)
  from public.menu_reports m
  join public.restaurants r on r.id = m.restaurant_id
  group by r.id, r.name, r.postcode
  order by max(m.created_at) desc
  limit 200;
end;
$$;

-- Checked it: clear every menu report about that restaurant.
create function public.admin_clear_menu_reports(place uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  delete from public.menu_reports where restaurant_id = place;
end;
$$;

revoke execute on function public.admin_menu_reports(), public.admin_clear_menu_reports(uuid) from public, anon;
grant execute on function public.admin_menu_reports(), public.admin_clear_menu_reports(uuid) to authenticated;
