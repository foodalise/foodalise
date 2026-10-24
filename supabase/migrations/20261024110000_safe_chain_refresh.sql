-- A chain menu refresh that only read part of the menu (Wagamama's read found just
-- 5 lunch dishes) hid every other dish at every branch, and the app said "200 new
-- dishes" because it counted all branches together. From now on:
--   * a read that finds fewer than 80% of the dishes we already have only adds and
--     updates dishes; it never hides or forgets any;
--   * the number returned is the new dishes at the branch being looked at.

drop function if exists public.sync_chain_menu(text, jsonb);

create function public.sync_chain_menu(slug text, items jsonb, branch uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  before_count integer;
  new_count integer;
  full_read boolean;
  added integer;
  old record;
  new_name text;
begin
  select count(*) into before_count from public.chain_dishes where chain_slug = slug;
  select count(distinct lower(trim(i->>'name'))) into new_count
  from jsonb_array_elements(items) i where char_length(trim(i->>'name')) between 2 and 120;
  full_read := new_count >= ceil(before_count * 0.8);

  -- Only a read of (nearly) the whole menu replaces the chain's list.
  if full_read then
    delete from public.chain_dishes c where c.chain_slug = slug
      and not exists (select 1 from jsonb_array_elements(items) i where lower(trim(i->>'name')) = lower(c.name));
  end if;
  insert into public.chain_dishes (chain_slug, section, name, price_pence)
  select distinct on (lower(trim(i->>'name'))) slug, nullif(trim(i->>'section'), ''), trim(i->>'name'), (i->>'price_pence')::integer
  from jsonb_array_elements(items) i
  where char_length(trim(i->>'name')) between 2 and 120
  on conflict (chain_slug, name) do update
    set section = coalesce(excluded.section, public.chain_dishes.section),
        price_pence = coalesce(excluded.price_pence, public.chain_dishes.price_pence);

  if full_read then
    -- Dishes whose name isn't on the new menu as written, but is there in other words:
    -- they take the new name so their reviews carry on. An unreviewed copy under the new
    -- name (from an earlier read) is removed first.
    for old in
      select x.id, x.restaurant_id, x.name from public.dishes x join public.restaurants r on r.id = x.restaurant_id
      where r.chain_slug = slug and x.source = 'chain'
        and not exists (select 1 from public.chain_dishes c where c.chain_slug = slug and lower(c.name) = lower(x.name))
      order by x.review_count desc
    loop
      select c.name into new_name from public.chain_dishes c
      where c.chain_slug = slug and public.same_dish(c.name, old.name)
        and not exists (select 1 from public.dishes y where y.restaurant_id = old.restaurant_id and lower(y.name) = lower(c.name) and y.review_count > 0)
      limit 1;
      continue when new_name is null;
      delete from public.dishes y where y.restaurant_id = old.restaurant_id and lower(y.name) = lower(new_name) and y.review_count = 0 and y.id <> old.id;
      update public.dishes set name = new_name where id = old.id;
    end loop;
  end if;

  update public.dishes d set on_menu = true, section = coalesce(c.section, d.section), price_pence = coalesce(c.price_pence, d.price_pence)
  from public.restaurants r, public.chain_dishes c
  where d.restaurant_id = r.id and r.chain_slug = slug and d.source = 'chain'
    and c.chain_slug = slug and lower(c.name) = lower(d.name);

  -- Gone from the menu: hidden, unless people have reviewed it. Only after a full read.
  if full_read then
    update public.dishes d set on_menu = false
    from public.restaurants r
    where d.restaurant_id = r.id and r.chain_slug = slug and d.source = 'chain' and d.review_count = 0
      and not exists (select 1 from public.chain_dishes c where c.chain_slug = slug and lower(c.name) = lower(d.name));
  end if;

  with ins as (
    insert into public.dishes (restaurant_id, section, name, price_pence, source)
    select r.id, c.section, c.name, c.price_pence, 'chain'
    from public.restaurants r
    join public.chain_dishes c on c.chain_slug = r.chain_slug
    where r.chain_slug = slug
      and not exists (select 1 from public.dishes x where x.restaurant_id = r.id and lower(x.name) = lower(c.name))
    returning restaurant_id
  )
  select count(*) into added from ins where branch is null or restaurant_id = branch;

  update public.restaurants set menu_checked_at = now(),
    menu_source = case when menu_source in ('none', 'users') then 'chain'::public.menu_source else menu_source end
  where chain_slug = slug;
  return added;
end $$;
revoke execute on function public.sync_chain_menu(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_chain_menu(text, jsonb, uuid) to service_role;

-- Repair: bring back chain dishes that refreshes hid, and put their names back on the
-- chain's list so the next refresh keeps them.
insert into public.chain_dishes (chain_slug, section, name, price_pence)
select distinct on (r.chain_slug, lower(d.name)) r.chain_slug, d.section, d.name, d.price_pence
from public.dishes d join public.restaurants r on r.id = d.restaurant_id
where d.source = 'chain' and not d.on_menu and r.chain_slug is not null
on conflict (chain_slug, name) do nothing;

update public.dishes d set on_menu = true
from public.restaurants r
where d.restaurant_id = r.id and r.chain_slug is not null and d.source = 'chain' and not d.on_menu;
