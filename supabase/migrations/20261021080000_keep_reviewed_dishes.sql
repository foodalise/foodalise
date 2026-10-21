-- Re-reading a menu must never lose a dish people have reviewed.
-- 1. Dishes with reviews are never hidden by a re-read.
-- 2. A dish whose name is written a little differently on the new menu ("Chicken Wings (5)"
--    and "5 Chicken Wings") keeps its reviews and takes the new name.
-- Also puts back the reviewed Nando's dishes the last refresh hid, and lets Nando's be
-- refreshed again now.

-- The words in a dish name, lower case and sorted, without filler words.
create function public.dish_words(name text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct w order by w), '{}')
  from unnest(regexp_split_to_array(lower(name), '[^a-z0-9/]+')) w
  where w <> '' and w not in ('the', 'and', 'with', 'of', 'a', 'our', 'peri', 'piri');
$$;

-- Same dish, written differently: the same words, or (with at least two words) one
-- name's words all inside the other's.
create function public.same_dish(a text, b text) returns boolean
language sql immutable set search_path = '' as $$
  select x = y or (least(cardinality(x), cardinality(y)) >= 2 and (x <@ y or y <@ x))
  from (select public.dish_words(a) x, public.dish_words(b) y) w;
$$;

create or replace function public.sync_chain_menu(slug text, items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  added integer;
  old record;
  new_name text;
begin
  delete from public.chain_dishes where chain_slug = slug;
  insert into public.chain_dishes (chain_slug, section, name, price_pence)
  select slug, nullif(trim(i->>'section'), ''), trim(i->>'name'), (i->>'price_pence')::integer
  from jsonb_array_elements(items) i
  where char_length(trim(i->>'name')) between 2 and 120
  on conflict do nothing;

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

  update public.dishes d set on_menu = true, section = c.section, price_pence = coalesce(c.price_pence, d.price_pence)
  from public.restaurants r, public.chain_dishes c
  where d.restaurant_id = r.id and r.chain_slug = slug and d.source = 'chain'
    and c.chain_slug = slug and lower(c.name) = lower(d.name);

  -- Gone from the menu: hidden, unless people have reviewed it.
  update public.dishes d set on_menu = false
  from public.restaurants r
  where d.restaurant_id = r.id and r.chain_slug = slug and d.source = 'chain' and d.review_count = 0
    and not exists (select 1 from public.chain_dishes c where c.chain_slug = slug and lower(c.name) = lower(d.name));

  insert into public.dishes (restaurant_id, section, name, price_pence, source)
  select r.id, c.section, c.name, c.price_pence, 'chain'
  from public.restaurants r
  join public.chain_dishes c on c.chain_slug = r.chain_slug
  where r.chain_slug = slug
    and not exists (select 1 from public.dishes x where x.restaurant_id = r.id and lower(x.name) = lower(c.name));
  get diagnostics added = row_count;

  update public.restaurants set menu_checked_at = now(),
    menu_source = case when menu_source in ('none', 'users') then 'chain'::public.menu_source else menu_source end
  where chain_slug = slug;
  return added;
end $$;
revoke execute on function public.sync_chain_menu(text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_chain_menu(text, jsonb) to service_role;

-- Put back reviewed dishes that earlier re-reads hid.
update public.dishes set on_menu = true where not on_menu and review_count > 0;

-- Let Nando's be refreshed again with the improved reader.
update public.chain_menu_sources set read_at = null, status = null where chain_slug = 'nandos';
delete from public.menu_refreshes where restaurant_id in (select id from public.restaurants where chain_slug = 'nandos');
