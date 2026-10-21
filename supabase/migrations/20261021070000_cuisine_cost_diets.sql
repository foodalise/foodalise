-- Cuisine, cost and dietary options for each restaurant, so the map can be filtered
-- and the cuisine shown beside the name.
--   cuisine: one of the list in lib/cuisines.ts. Chains are set below; other restaurants
--            get it when their menu is read, or the first time someone opens a
--            restaurant whose dishes are known.
--   price_level: 1 (£, a typical dish under £10) to 4 (££££, £28 and up), worked out from
--            the dish prices on the menu. Chains are set below, as their menus have few prices.
--   diets: vegetarian, vegan, gluten_free, halal. A restaurant has one if any dish on its menu
--            is marked with it (menus read from websites mark them), or, for halal, if the
--            menu says so. Chains are set below.

alter table public.restaurants
  add column cuisine text,
  add column price_level smallint check (price_level between 1 and 4),
  add column diets text[] not null default '{}';
alter table public.dishes add column diets text[] not null default '{}';
create index restaurants_cuisine on public.restaurants (cuisine);

-- Keeps price_level and diets up to date as dishes are added or change.
create function public.update_restaurant_from_dishes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid := coalesce(new.restaurant_id, old.restaurant_id);
  typical integer;
begin
  -- The middle price of the food, leaving out drinks, sides and desserts.
  select percentile_cont(0.5) within group (order by price_pence) into typical
  from public.dishes
  where restaurant_id = rid and on_menu and price_pence > 0
    and coalesce(section, '') !~* 'drink|wine|beer|cocktail|coffee|tea|soft|spirit|juice|side|dessert|extra|sauce|dip';
  update public.restaurants r set
    price_level = coalesce(case
      when typical is null then null
      when typical < 1000 then 1 when typical < 1800 then 2 when typical < 2800 then 3 else 4 end, r.price_level),
    -- A vegan drink doesn't make a vegan-friendly restaurant, so only food counts.
    diets = case when coalesce(new.section, '') ~* 'drink|wine|beer|cocktail|coffee|tea|soft|spirit|juice' then r.diets
      else (select coalesce(array_agg(distinct d), '{}') from unnest(r.diets || coalesce(new.diets, '{}')) d) end
  where r.id = rid;
  return null;
end $$;
create trigger update_restaurant_from_dishes after insert or update of price_pence, on_menu, section, diets or delete
  on public.dishes for each row execute function public.update_restaurant_from_dishes();

-- Chains, from what each chain is known for. Change one with, for example:
--   update restaurants set cuisine = 'Pizza', price_level = 2 where chain_slug = 'dominos';
update public.restaurants r set cuisine = c.cuisine, price_level = c.price_level, diets = c.diets
from (values
  ('ask-italian', 'Italian', 2, '{vegetarian,vegan}'::text[]),
  ('banana-tree', 'Pan-Asian', 2, '{vegetarian,vegan}'),
  ('barburrito', 'Mexican', 1, '{vegetarian,vegan}'),
  ('bella-italia', 'Italian', 2, '{vegetarian,vegan}'),
  ('black-sheep-coffee', 'Cafe', 1, '{vegetarian,vegan}'),
  ('brewdog', 'Pub', 2, '{vegetarian,vegan}'),
  ('burger-king', 'Burgers', 1, '{vegetarian,vegan}'),
  ('byron', 'Burgers', 2, '{vegetarian,vegan}'),
  ('caffe-nero', 'Cafe', 1, '{vegetarian,vegan}'),
  ('carluccios', 'Italian', 2, '{vegetarian,vegan}'),
  ('chipotle', 'Mexican', 1, '{vegetarian,vegan}'),
  ('chopstix', 'Pan-Asian', 1, '{vegetarian,vegan}'),
  ('costa', 'Cafe', 1, '{vegetarian,vegan}'),
  ('cote', 'French', 3, '{vegetarian}'),
  ('dishoom', 'Indian', 2, '{vegetarian,vegan}'),
  ('dominos', 'Pizza', 2, '{vegetarian,vegan}'),
  ('five-guys', 'Burgers', 2, '{vegetarian}'),
  ('flat-iron', 'Steak', 2, '{}'),
  ('franco-manca', 'Pizza', 1, '{vegetarian,vegan}'),
  ('frankie-and-bennys', 'American', 2, '{vegetarian,vegan}'),
  ('gails', 'Bakery', 1, '{vegetarian}'),
  ('gbk', 'Burgers', 2, '{vegetarian,vegan}'),
  ('german-doner-kebab', 'Kebab', 1, '{vegetarian,halal}'),
  ('greggs', 'Bakery', 1, '{vegetarian,vegan}'),
  ('harvester', 'British', 2, '{vegetarian,vegan}'),
  ('hawksmoor', 'Steak', 4, '{}'),
  ('honest-burgers', 'Burgers', 2, '{vegetarian,vegan}'),
  ('itsu', 'Japanese', 1, '{vegetarian,vegan}'),
  ('joe-and-the-juice', 'Cafe', 1, '{vegetarian,vegan}'),
  ('kfc', 'Chicken', 1, '{}'),
  ('kokoro', 'Japanese', 1, '{vegetarian}'),
  ('krispy-kreme', 'Desserts', 1, '{vegetarian}'),
  ('las-iguanas', 'Latin American', 2, '{vegetarian,vegan}'),
  ('leon', 'Healthy', 1, '{vegetarian,vegan}'),
  ('mcdonalds', 'Burgers', 1, '{vegetarian,vegan}'),
  ('miller-and-carter', 'Steak', 3, '{}'),
  ('nandos', 'Chicken', 2, '{vegetarian,vegan}'),
  ('papa-johns', 'Pizza', 2, '{vegetarian,vegan}'),
  ('pizza-express', 'Pizza', 2, '{vegetarian,vegan,gluten_free}'),
  ('pizza-hut', 'Pizza', 2, '{vegetarian,vegan}'),
  ('pizza-pilgrims', 'Pizza', 2, '{vegetarian,vegan}'),
  ('popeyes', 'Chicken', 1, '{halal}'),
  ('pret', 'Cafe', 1, '{vegetarian,vegan}'),
  ('prezzo', 'Italian', 2, '{vegetarian,vegan}'),
  ('rosas-thai', 'Thai', 2, '{vegetarian,vegan}'),
  ('shake-shack', 'Burgers', 2, '{vegetarian}'),
  ('starbucks', 'Cafe', 1, '{vegetarian,vegan}'),
  ('subway', 'Sandwiches', 1, '{vegetarian,vegan}'),
  ('taco-bell', 'Mexican', 1, '{vegetarian,vegan}'),
  ('tgi-fridays', 'American', 2, '{vegetarian,vegan}'),
  ('toby-carvery', 'British', 1, '{vegetarian}'),
  ('tortilla', 'Mexican', 1, '{vegetarian,vegan}'),
  ('turtle-bay', 'Caribbean', 2, '{vegetarian,vegan}'),
  ('wagamama', 'Pan-Asian', 2, '{vegetarian,vegan}'),
  ('wahaca', 'Mexican', 2, '{vegetarian,vegan}'),
  ('wasabi', 'Japanese', 1, '{vegetarian,vegan}'),
  ('wingstop', 'Chicken', 1, '{halal}'),
  ('yo-sushi', 'Japanese', 2, '{vegetarian,vegan}'),
  ('zizzi', 'Italian', 2, '{vegetarian,vegan,gluten_free}')
) as c(slug, cuisine, price_level, diets)
where r.chain_slug = c.slug;

-- Restaurants that already have priced dishes get their cost now.
update public.dishes set price_pence = price_pence
where id in (select distinct on (restaurant_id) id from public.dishes where price_pence > 0 and source <> 'chain');
