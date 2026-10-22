-- A food type for every restaurant, shown as a little picture next to its name
-- and on its map pin (coffee, Chinese, pizza...). It's the first of:
--   1. food_type_fix: set by an admin in the app when the others get it wrong
--   2. cuisine: worked out from the restaurant's menu
--   3. osm_cuisine: OpenStreetMap's cuisine tag (scripts/import-osm-cuisine.mjs)
--   4. words in the name ("Golden Wok", "Costa Coffee", "Chippers")
--   5. the hygiene listing's type (pubs)
-- Values are the app's cuisine list (lib/cuisines.ts). Null means we don't know.

alter table public.restaurants
  add column if not exists osm_cuisine text,
  add column if not exists food_type_fix text,
  add column if not exists food_type text;

-- Guesses a food type from a restaurant's name, most specific words first, so
-- "Pizza Cafe" is pizza and "Thai Cafe" is Thai.
create or replace function public.guess_food_type(name text, business_type text) returns text
language sql immutable set search_path = '' as $$
  select case
    when name ~* 'fish ?(and|&|n''?)? ?chip|\mchipp(y|ie|er|ers)\M|fish bar|\mfr[iy]er' then 'Fish & Chips'
    when name ~* 'pizz|domino''?s|papa john' then 'Pizza'
    when name ~* 'burger|five guys|mcdonald|shake shack' then 'Burgers'
    when name ~* 'chicken|\mwings?\M|\mkfc\M|p[ie]ri ?p[ie]ri|nando|popeyes|wingstop' then 'Chicken'
    when name ~* 'kebab|d[oö]ner|\mshish\M' then 'Kebab'
    when name ~* 'india|tandoor|curry|masala|biry?ani|balti|punjab|bombay|mumbai|delhi|madras|bengal|bangladesh|nepal|gurkha|\mdosa|chaat|tiffin|\mraj\M|mahal|sri lanka' then 'Indian'
    when name ~* 'chinese|\mwok\M|dim sum|peking|beijing|canton|s[zi]e?chuan|hunan|shanghai|hong kong|oriental|\mchow\M' then 'Chinese'
    when name ~* 'japan|sushi|ramen|wagamama|\mitsu\M|katsu|izakaya|teriyaki|bento' then 'Japanese'
    when name ~* '\mthai|siam|bangkok' then 'Thai'
    when name ~* '\mviet|\mpho\M|banh mi|saigon|hanoi' then 'Vietnamese'
    when name ~* 'korea|seoul|bibimbap|kimchi' then 'Korean'
    when name ~* 'asian|noodle|\mbao\M' then 'Pan-Asian'
    when name ~* '\mturk|anatolia|istanbul|ocakba[sş][iı]|mangal|gozleme|lahmacun' then 'Turkish'
    when name ~* 'leban|syria|persia|\miran|shawarma|falafel|mezz?e\M|levant|\marab|yemen|beirut' then 'Middle Eastern'
    when name ~* 'greek|souvlaki|\mgyros?\M|taverna|cypr' then 'Greek'
    when name ~* 'mexic|taco|burrito|tortilla|cantina|chipotle|tex ?mex' then 'Mexican'
    when name ~* 'caribbean|jamaica|\mjerk\M|trinidad' then 'Caribbean'
    when name ~* 'africa|nigeria|ghana|ethiopia|eritrea|somali|\msuya\M|jollof' then 'African'
    when name ~* 'brazil|peru|argentin|colombia|venezuel|\mlatin|empanada' then 'Latin American'
    when name ~* 'italia|trattoria|ristorante|osteria|\mpasta|carluccio|zizzi|prezzo' then 'Italian'
    when name ~* 'spanish|tapas|paella|iberic' then 'Spanish'
    when name ~* 'portug|\mnata\M|lisbo' then 'Portuguese'
    when name ~* 'steak|churrasc|rodizio|gaucho|hawksmoor' then 'Steak'
    when name ~* 'seafood|oyster|lobster|\mcrab\M' then 'Seafood'
    when name ~* '\mfrench|bistrot' then 'French'
    when name ~* 'dessert|gelat|ice cream|creamery|waffle|cr[eê]pe|\mcakes?\M|donut|doughnut|churro|yog(h)?urt|milkshake|kaspa' then 'Desserts'
    when name ~* 'bakery|\mbakers?\M|bakehouse|boulangerie|patisserie|greggs|\mbagel' then 'Bakery'
    when name ~* 'sandwich|subway|\mdeli\M|delicatessen|\mpret\M|baguette|panini' then 'Sandwiches'
    when name ~* 'salad|juice|smoothie|\mvegan|\mpoke\M|acai|\mleon\M' then 'Healthy'
    when name ~* 'caf[eéè]|caff|coffee|espresso|starbucks|\mcosta\M|tea ?room|tea house|brunch|breakfast|roast(er|ery)' then 'Cafe'
    when name ~* 'carvery|\mpies?\M' then 'British'
    when business_type ilike 'pub%' then 'Pub'
    when name ~* '\m(arms|inn|tavern|ale ?house|pub|tap ?room|brew ?pub|brewery)\M' then 'Pub'
  end;
$$;

create or replace function public.set_food_type() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.food_type := coalesce(new.food_type_fix, nullif(new.cuisine, 'Other'), new.osm_cuisine,
    public.guess_food_type(new.name, new.business_type));
  return new;
end;
$$;

drop trigger if exists restaurants_food_type on public.restaurants;
create trigger restaurants_food_type before insert or update on public.restaurants
  for each row execute function public.set_food_type();

update public.restaurants r
set food_type = coalesce(r.food_type_fix, nullif(r.cuisine, 'Other'), r.osm_cuisine, public.guess_food_type(r.name, r.business_type));

create index if not exists restaurants_food_type_idx on public.restaurants (food_type);

-- For admins: fix a restaurant's food type from the app (null goes back to the guess).
create or replace function public.admin_set_food_type(rid uuid, kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  result text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if kind is not null and kind <> all (array['African', 'American', 'Bakery', 'British', 'Burgers', 'Cafe', 'Caribbean',
    'Chicken', 'Chinese', 'Desserts', 'Fish & Chips', 'French', 'Greek', 'Healthy', 'Indian', 'Italian', 'Japanese',
    'Kebab', 'Korean', 'Latin American', 'Mediterranean', 'Mexican', 'Middle Eastern', 'Pan-Asian', 'Pizza', 'Portuguese',
    'Pub', 'Sandwiches', 'Seafood', 'Spanish', 'Steak', 'Thai', 'Turkish', 'Vietnamese', 'Other']) then
    raise exception 'Unknown food type';
  end if;
  update public.restaurants set food_type_fix = kind where id = rid returning food_type into result;
  return result;
end;
$$;
revoke execute on function public.admin_set_food_type(uuid, text) from public, anon;
grant execute on function public.admin_set_food_type(uuid, text) to authenticated;

-- For scripts/import-osm-cuisine.mjs (service role only): [{ "id": ..., "cuisine": ... }, ...]
create or replace function public.apply_osm_cuisines(items jsonb) returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.restaurants r set osm_cuisine = x.cuisine
    from jsonb_to_recordset(items) as x(id uuid, cuisine text)
    where r.id = x.id and r.osm_cuisine is distinct from x.cuisine
    returning 1
  )
  select count(*)::int from done;
$$;
revoke execute on function public.apply_osm_cuisines(jsonb) from public, anon, authenticated;

-- The map now sends each place's food type, and the Cuisine filter uses it, so
-- places without a menu yet still show up under "Chinese", "Pizza" and so on.
drop function if exists public.map_places(double precision, double precision, double precision, double precision, text[], integer[], text[], numeric, integer);

create or replace function public.map_places(
  min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision,
  cuisines text[] default null, prices integer[] default null, want_diets text[] default null,
  min_rating numeric default null, max_rows integer default 300
) returns table (
  id uuid, name text, address text, postcode text, latitude double precision, longitude double precision,
  cuisine text, food_type text, price_level integer, diets text[], rating numeric, reviews integer, more boolean
)
language sql stable set search_path = public, pg_temp as $$
  with scores as (
    -- Every reviewed place in view, scored across all its dishes.
    select d.restaurant_id as rid, sum(d.review_count)::int as reviews,
      sum(coalesce(d.avg_rating, 0) * d.review_count) / sum(d.review_count) as rating
    from dishes d join restaurants r on r.id = d.restaurant_id
    where d.review_count > 0
      and r.latitude between min_lat and max_lat and r.longitude between min_lng and max_lng
    group by d.restaurant_id
  ), grid as (
    select gi, gj from generate_series(0, 9) gi, generate_series(0, 9) gj
  ), squares as (
    -- Up to 60 places from each square. Skipped when filtering by rating,
    -- since only reviewed places have one.
    select p.id as rid, p.rn
    from grid g cross join lateral (
      select r.id, row_number() over () as rn
      from restaurants r
      where r.latitude >= min_lat + g.gi * (max_lat - min_lat) / 10
        and (g.gi = 9 or r.latitude < min_lat + (g.gi + 1) * (max_lat - min_lat) / 10)
        and r.latitude <= max_lat
        and r.longitude >= min_lng + g.gj * (max_lng - min_lng) / 10
        and (g.gj = 9 or r.longitude < min_lng + (g.gj + 1) * (max_lng - min_lng) / 10)
        and r.longitude <= max_lng
        and (cuisines is null or r.food_type = any (cuisines))
        and (prices is null or r.price_level = any (prices))
        and (want_diets is null or r.diets @> want_diets)
      limit 60
    ) p
    where min_rating is null
  ), picked as (
    select k.rid, min(k.rn) as rn
    from (select s.rid, 0::bigint as rn from scores s union all select q.rid, q.rn from squares q) k
    group by k.rid
  ), shown as (
    select r.id, r.name, r.address, r.postcode, r.latitude, r.longitude, r.cuisine, r.food_type, r.price_level, r.diets,
      s.rating, coalesce(s.reviews, 0) as reviews, k.rn,
      count(*) over () as total, max(k.rn) over () as deepest
    from picked k
    join restaurants r on r.id = k.rid
    left join scores s on s.rid = k.rid
    where (cuisines is null or r.food_type = any (cuisines))
      and (prices is null or r.price_level = any (prices))
      and (want_diets is null or r.diets @> want_diets)
      and (min_rating is null or s.rating >= min_rating)
  )
  select x.id, x.name, x.address, x.postcode, x.latitude, x.longitude, x.cuisine, x.food_type, x.price_level::integer, x.diets,
    x.rating, x.reviews, (x.total > max_rows or x.deepest >= 60) as more
  from shown x
  order by x.rn, x.reviews desc, x.rating desc nulls last
  limit least(greatest(max_rows, 1), 500);
$$;
