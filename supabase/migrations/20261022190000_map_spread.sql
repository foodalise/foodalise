-- What the map shows. Before, it asked for "any 300 places on screen", and the
-- database handed back the 300 furthest south, so zoomed out you only saw pins
-- along the bottom edge. Now the screen is cut into a 10 x 10 grid and each
-- square gets its share, with every reviewed place first. `more` is true when
-- some places were left out, so the app can ask you to zoom in.

create index if not exists dishes_reviewed on public.dishes (restaurant_id) where review_count > 0;

create or replace function public.map_places(
  min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision,
  cuisines text[] default null, prices integer[] default null, want_diets text[] default null,
  min_rating numeric default null, max_rows integer default 300
) returns table (
  id uuid, name text, address text, postcode text, latitude double precision, longitude double precision,
  cuisine text, price_level integer, diets text[], rating numeric, reviews integer, more boolean
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
        and (cuisines is null or r.cuisine = any (cuisines))
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
    select r.id, r.name, r.address, r.postcode, r.latitude, r.longitude, r.cuisine, r.price_level, r.diets,
      s.rating, coalesce(s.reviews, 0) as reviews, k.rn,
      count(*) over () as total, max(k.rn) over () as deepest
    from picked k
    join restaurants r on r.id = k.rid
    left join scores s on s.rid = k.rid
    where (cuisines is null or r.cuisine = any (cuisines))
      and (prices is null or r.price_level = any (prices))
      and (want_diets is null or r.diets @> want_diets)
      and (min_rating is null or s.rating >= min_rating)
  )
  select x.id, x.name, x.address, x.postcode, x.latitude, x.longitude, x.cuisine, x.price_level::integer, x.diets,
    x.rating, x.reviews, (x.total > max_rows or x.deepest >= 60) as more
  from shown x
  order by x.rn, x.reviews desc, x.rating desc nulls last
  limit least(greatest(max_rows, 1), 500);
$$;
