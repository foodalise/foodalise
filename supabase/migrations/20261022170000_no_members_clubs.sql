-- Members' clubs, sports clubs, lodges and halls aren't places you can just walk
-- into for food, but many have a licensed bar, so the FSA lists them as a
-- "Pub/bar/nightclub" or a restaurant (Southgate Masonic Centre, Conway Lawn
-- Tennis Club). They are now recognised by name whatever their FSA type.

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
    when place_type = 'Restaurant/Cafe/Canteen' then true
    -- "Other catering premises": only if the name says it is somewhere to eat.
    else place_name ~* (
      '(\m(restaurant|caf[eé]|coffee|bar|grill|kitchen|bistro|brasserie|diner|eatery|pizza|pizzeria|bakery|deli|lounge|club'
      '|tea ?rooms?|tavern|inn|steakhouse|canteen|banqueting|buffet|noodle|sushi|curry|tandoori|burger|chicken|cuisine|dining)\M)'
    )
  end
$$;

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
