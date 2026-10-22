-- 1. Workplace canteens (Royal Mail sorting offices, depots, police and fire
--    stations, council offices) are listed by the FSA as restaurants or caterers
--    but aren't open to the public, so they're recognised by name too.
-- 2. The Foodalise team can take any other non-food place off the map from its
--    page (⋯ > Not a place to eat). It stays off even when the area is imported again.

create or replace function public.is_food_place(place_name text, place_type text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    -- Members' clubs, sports clubs, places of worship and halls, any type, unless
    -- the name clearly says it's somewhere to eat ("Golf Burger", "FC Kitchen").
    when place_name ~* (
      '\m(masonic|freemasons?|lodge no|tennis|golf|cricket|rugby|hockey|lacrosse|bowls|bowling club|croquet|squash'
      '|rowing|sailing|yacht|boat club|angling|football club|fc|athletic club|sports club|sports ground|sports association'
      '|social club|members''? club|working ?men''?s|british legion|rbl|conservative club|labour club|liberal club|ex-?servicemen'
      '|scouts?|guides|brownies|cadets|parish|cathedral|mosque|masjid|gurdwara|synagogue'
      '|village hall|church hall|community centre|community hall|scout hut)\M'
    ) and place_name !~* (
      '\m(restaurant|caf[eé]|coffee|kitchen|grill|bistro|brasserie|diner|eatery|pizza|pizzeria|bakery|deli|steakhouse'
      '|noodle|sushi|curry|tandoori|burger|chicken|takeaway|kebab|fish bar|chippy)\M'
    ) then false
    -- Pubs, bars and takeaways are otherwise always places you can just go to.
    when place_type not in ('Restaurant/Cafe/Canteen', 'Other catering premises') then true
    when place_name ~* (
      '\m(schools?|primary|secondary|infants?|academy|college|university|sixth form|nursery|nurseries|pre-?school|playgroup|kindergarten'
      '|montessori|hospital|hospice|care home|nursing home|residential home|care centre|day centre|children''?s centre|surgery'
      '|prison|hmp|staff canteen|staff restaurant|after school|holiday club|chartwells|sodexo|aramark|caterlink)\M'
    ) then false
    -- Workplace canteens, unless the name clearly says it's open as a cafe or restaurant.
    when place_name ~* (
      '\m(royal mail|sorting office|delivery office|parcelforce|bus depot|bus garage|warehouse|distribution centre|fulfilment centre'
      '|police station|fire station|ambulance station|barracks|council offices?|civic centre|head office|headquarters'
      '|business park|works canteen|factory|data centre|compass group|elior|bm canteens|baxterstorey)\M'
    ) and place_name !~* (
      '\m(restaurant|caf[eé]|coffee|kitchen|grill|bistro|brasserie|diner|eatery|pizza|pizzeria|bakery|deli|steakhouse'
      '|noodle|sushi|curry|tandoori|burger|chicken|takeaway|kebab|fish bar|chippy)\M'
    ) then false
    when place_type = 'Restaurant/Cafe/Canteen' then true
    -- "Other catering premises": only if the name says it is somewhere to eat.
    else place_name ~* (
      '(\m(restaurant|caf[eé]|coffee|bar|grill|kitchen|bistro|brasserie|diner|eatery|pizza|pizzeria|bakery|deli|lounge|club'
      '|tea ?rooms?|tavern|inn|steakhouse|canteen|banqueting|buffet|noodle|sushi|curry|tandoori|burger|chicken|cuisine|dining)\M)'
    )
  end
$$;

-- Places the team has taken off the map, so imports skip them.
create table if not exists public.hidden_places (
  fsa_id integer primary key,
  name text,
  hidden_at timestamptz not null default now()
);
alter table public.hidden_places enable row level security;

create or replace function public.skip_non_food_places() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_food_place(new.name, new.business_type)
     and not exists (select 1 from public.hidden_places h where h.fsa_id = new.fsa_id) then
    return new;
  end if;
  return null;
end;
$$;

-- ⋯ > Not a place to eat, for the team. Places with reviews stay (their reviews would go too).
create or replace function public.admin_hide_place(place uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.restaurants;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into r from public.restaurants where id = place;
  if not found then return; end if;
  if exists (select 1 from public.dishes d join public.reviews v on v.dish_id = d.id where d.restaurant_id = place) then
    raise exception 'People have reviewed dishes here, so it can''t be removed.';
  end if;
  if r.fsa_id is not null then
    insert into public.hidden_places (fsa_id, name) values (r.fsa_id, r.name) on conflict do nothing;
  end if;
  delete from public.restaurants where id = place;
end;
$$;
revoke execute on function public.admin_hide_place(uuid) from public, anon;
grant execute on function public.admin_hide_place(uuid) to authenticated;

-- Remove the ones already on the map, unless someone has reviewed a dish there or
-- saved it to Want to try.
delete from public.restaurants r
where not public.is_food_place(r.name, r.business_type)
  and not exists (
    select 1 from public.dishes d join public.reviews v on v.dish_id = d.id where d.restaurant_id = r.id
  )
  and not exists (select 1 from public.restaurant_wishlist w where w.restaurant_id = r.id)
  and not exists (
    select 1 from public.dishes d join public.wishlist w on w.dish_id = d.id where d.restaurant_id = r.id
  );
