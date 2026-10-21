-- Keeps menus up to date. Website menus are re-read every two months. Diners can tap
-- "Refresh menu" (once each per restaurant; each restaurant at most once a month):
-- for a chain branch that reads the chain's full menu page and updates every branch.
-- Dishes that drop off a menu are hidden (on_menu = false), never deleted, so their
-- reviews stay. Diners can also flag a menu that looks wrong.

alter table public.dishes add column on_menu boolean not null default true;
alter table public.restaurants add column menu_checked_at timestamptz;

-- Where each chain's menu lives. Change a URL with:
--   update chain_menu_sources set menu_url = 'https://…', read_at = null where chain_slug = 'nandos';
-- (read_at = null lets the next "Refresh menu" on one of its branches read it straight away.)
create table public.chain_menu_sources (
  chain_slug text primary key,
  menu_url text not null,
  read_at timestamptz,
  status text,
  dishes_found integer
);
alter table public.chain_menu_sources enable row level security; -- no policies: only the menu reader uses it

insert into public.chain_menu_sources (chain_slug, menu_url) values
  ('ask-italian', 'https://www.askitalian.co.uk'),
  ('banana-tree', 'https://bananatree.co.uk'),
  ('barburrito', 'https://www.barburrito.co.uk'),
  ('bella-italia', 'https://www.bellaitalia.co.uk'),
  ('black-sheep-coffee', 'https://www.blacksheepcoffee.com'),
  ('brewdog', 'https://www.brewdog.com/uk/bars'),
  ('burger-king', 'https://www.burgerking.co.uk/menu'),
  ('byron', 'https://www.byron.co.uk'),
  ('caffe-nero', 'https://caffenero.com/uk'),
  ('carluccios', 'https://www.carluccios.com'),
  ('chipotle', 'https://www.chipotle.co.uk'),
  ('chopstix', 'https://www.chopstix.co.uk'),
  ('costa', 'https://www.costa.co.uk/menu'),
  ('cote', 'https://www.cote.co.uk'),
  ('dishoom', 'https://www.dishoom.com'),
  ('dominos', 'https://www.dominos.co.uk/menu'),
  ('five-guys', 'https://fiveguys.co.uk/menu'),
  ('flat-iron', 'https://flatironsteak.co.uk'),
  ('franco-manca', 'https://www.francomanca.co.uk'),
  ('frankie-and-bennys', 'https://www.frankieandbennys.com'),
  ('gails', 'https://gailsbread.co.uk'),
  ('gbk', 'https://www.gbk.co.uk'),
  ('german-doner-kebab', 'https://www.germandonerkebab.com/uk'),
  ('greggs', 'https://www.greggs.co.uk/menu'),
  ('harvester', 'https://www.harvester.co.uk'),
  ('hawksmoor', 'https://thehawksmoor.com'),
  ('honest-burgers', 'https://www.honestburgers.co.uk'),
  ('itsu', 'https://www.itsu.com'),
  ('joe-and-the-juice', 'https://www.joejuice.com'),
  ('kfc', 'https://www.kfc.co.uk/menu'),
  ('kokoro', 'https://www.kokorouk.com'),
  ('krispy-kreme', 'https://www.krispykreme.co.uk'),
  ('las-iguanas', 'https://www.iguanas.co.uk'),
  ('leon', 'https://leon.co'),
  ('mcdonalds', 'https://www.mcdonalds.com/gb/en-gb/menu.html'),
  ('miller-and-carter', 'https://www.millerandcarter.co.uk'),
  ('nandos', 'https://www.nandos.co.uk/food/menu'),
  ('papa-johns', 'https://www.papajohns.co.uk'),
  ('pizza-express', 'https://www.pizzaexpress.com'),
  ('pizza-hut', 'https://www.pizzahut.co.uk'),
  ('pizza-pilgrims', 'https://www.pizzapilgrims.co.uk'),
  ('popeyes', 'https://popeyesuk.com'),
  ('pret', 'https://www.pret.co.uk/en-GB'),
  ('prezzo', 'https://www.prezzo.co.uk'),
  ('rosas-thai', 'https://rosasthai.com'),
  ('shake-shack', 'https://shakeshack.co.uk'),
  ('starbucks', 'https://www.starbucks.co.uk/menu'),
  ('subway', 'https://www.subway.com/en-GB'),
  ('taco-bell', 'https://www.tacobell.co.uk'),
  ('tgi-fridays', 'https://www.tgifridays.co.uk'),
  ('toby-carvery', 'https://www.tobycarvery.co.uk'),
  ('tortilla', 'https://www.tortilla.co.uk'),
  ('turtle-bay', 'https://turtlebay.co.uk'),
  ('wagamama', 'https://www.wagamama.com/menu'),
  ('wahaca', 'https://www.wahaca.co.uk'),
  ('wasabi', 'https://www.wasabi.uk.com'),
  ('wingstop', 'https://www.wingstop.co.uk'),
  ('yo-sushi', 'https://yosushi.com'),
  ('zizzi', 'https://www.zizzi.co.uk')
on conflict do nothing;

-- Replaces a chain's menu with a freshly read one and brings every branch in line:
-- new dishes added, changed sections and prices updated, dropped dishes hidden.
create function public.sync_chain_menu(slug text, items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  added integer;
begin
  delete from public.chain_dishes where chain_slug = slug;
  insert into public.chain_dishes (chain_slug, section, name, price_pence)
  select slug, nullif(trim(i->>'section'), ''), trim(i->>'name'), (i->>'price_pence')::integer
  from jsonb_array_elements(items) i
  where char_length(trim(i->>'name')) between 2 and 120
  on conflict do nothing;

  update public.dishes d set on_menu = true, section = c.section, price_pence = coalesce(c.price_pence, d.price_pence)
  from public.restaurants r, public.chain_dishes c
  where d.restaurant_id = r.id and r.chain_slug = slug and d.source = 'chain'
    and c.chain_slug = slug and lower(c.name) = lower(d.name);

  update public.dishes d set on_menu = false
  from public.restaurants r
  where d.restaurant_id = r.id and r.chain_slug = slug and d.source = 'chain'
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

-- "Something wrong with this menu?" reports from diners.
create table public.menu_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles on delete cascade,
  restaurant_id uuid not null references public.restaurants on delete cascade,
  problem text not null check (char_length(problem) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table public.menu_reports enable row level security;
create policy "report menus as yourself" on public.menu_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- For the team: `select * from menu_reports_to_check;`
create view public.menu_reports_to_check with (security_invoker = true) as
select m.created_at as reported_at, m.problem, p.username as reported_by, r.name as restaurant, r.postcode,
       r.chain_slug, r.website, r.menu_checked_at, r.id as restaurant_id
from public.menu_reports m
join public.profiles p on p.id = m.reporter_id
join public.restaurants r on r.id = m.restaurant_id
order by m.created_at desc;

-- Who has used their one "Refresh menu" on which restaurant. Written by the menu reader.
create table public.menu_refreshes (
  user_id uuid not null references public.profiles on delete cascade,
  restaurant_id uuid not null references public.restaurants on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
alter table public.menu_refreshes enable row level security;
create policy "see your own refreshes" on public.menu_refreshes for select to authenticated
  using (user_id = (select auth.uid()));
