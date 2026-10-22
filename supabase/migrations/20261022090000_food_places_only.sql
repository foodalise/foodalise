-- Only places you can walk into and eat at.
--
-- The FSA's "Restaurant/Cafe/Canteen" type also covers school, hospital and
-- care-home kitchens, so those are recognised by name and kept off the map.
-- Its "Other catering premises" type (banqueting halls, clubs, event caterers,
-- home bakers) is now imported too, but only when the name says it is a place
-- to eat, such as "The Regency Club" or "Rose Café".

create or replace function public.is_food_place(place_name text, place_type text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    -- Pubs, bars and takeaways are always places you can just go to.
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

-- Imports and edits skip anything that isn't a food place.
create or replace function public.skip_non_food_places() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_food_place(new.name, new.business_type) then
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists restaurants_food_places_only on public.restaurants;
create trigger restaurants_food_places_only
  before insert on public.restaurants
  for each row execute function public.skip_non_food_places();

-- Remove schools, hospitals and the like that are already on the map, unless
-- someone has reviewed a dish there or saved it to Want to try.
delete from public.restaurants r
where not public.is_food_place(r.name, r.business_type)
  and not exists (
    select 1 from public.dishes d join public.reviews v on v.dish_id = d.id where d.restaurant_id = r.id
  )
  and not exists (select 1 from public.restaurant_wishlist w where w.restaurant_id = r.id)
  and not exists (
    select 1 from public.dishes d join public.wishlist w on w.dish_id = d.id where d.restaurant_id = r.id
  );
