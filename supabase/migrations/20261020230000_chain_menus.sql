-- Gives every branch of a known chain that chain's menu. Branches come from the
-- FSA import with just a name, so they're matched by name pattern. Each chain's
-- menu is copied from its template restaurant in seed.sql (the one without an
-- fsa_id). Add a chain by adding its menu to seed.sql and a row here.
create table public.chain_patterns (
  chain_slug text not null,
  pattern text not null primary key -- matched with ilike against the restaurant name
);
alter table public.chain_patterns enable row level security;

insert into public.chain_patterns (chain_slug, pattern) values
  ('mcdonalds', 'mcdonald%'),
  ('nandos', 'nando%'),
  ('dishoom', 'dishoom%'),
  ('wagamama', 'wagamama%'),
  ('greggs', 'greggs%'),
  ('pret', 'pret a manger%'),
  ('pret', 'pret'),
  ('flat-iron', 'flat iron%'),
  ('five-guys', 'five guys%')
on conflict do nothing;

create function public.apply_chain_menus() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  added integer;
begin
  update public.restaurants r set chain_slug = p.chain_slug
  from public.chain_patterns p
  where r.chain_slug is null and r.fsa_id is not null and r.name ilike p.pattern;

  insert into public.dishes (restaurant_id, section, name, price_pence, source)
  select r.id, d.section, d.name, d.price_pence, 'chain'
  from public.restaurants r
  join public.restaurants t on t.chain_slug = r.chain_slug and t.fsa_id is null and t.id <> r.id
  join public.dishes d on d.restaurant_id = t.id and d.source = 'chain'
  where r.chain_slug is not null
    and not exists (select 1 from public.dishes x where x.restaurant_id = r.id and lower(x.name) = lower(d.name));
  get diagnostics added = row_count;

  update public.restaurants r set menu_source = 'chain'
  where r.chain_slug is not null and r.menu_source in ('none', 'users')
    and exists (select 1 from public.dishes d where d.restaurant_id = r.id and d.source = 'chain');

  return added;
end $$;

-- Only the import script (service role) runs this, never the app.
revoke execute on function public.apply_chain_menus() from public, anon, authenticated;
grant execute on function public.apply_chain_menus() to service_role;

select public.apply_chain_menus();
