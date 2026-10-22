-- "Best near me": the top-rated dishes within a distance of you, optionally
-- matching a word like "burger" (in the dish name, its menu section or the
-- restaurant's cuisine). Dishes with few reviews are pulled towards 7/10 so one
-- lucky 10 doesn't beat a dish with twenty 9s.

create index if not exists restaurants_lat_lng on public.restaurants (latitude, longitude);

create or replace function public.best_dishes_near(
  lat double precision, lng double precision, km double precision default 1.6, term text default null, max_rows integer default 40
) returns table (
  dish_id uuid, dish_name text, restaurant_id uuid, restaurant_name text,
  avg_rating numeric, review_count integer, distance_km double precision, photo_path text
)
language sql stable set search_path = public, pg_temp as $$
  with box as (
    select r.id, r.name, r.cuisine,
      6371 * 2 * asin(sqrt(power(sin(radians(r.latitude - lat) / 2), 2)
        + cos(radians(lat)) * cos(radians(r.latitude)) * power(sin(radians(r.longitude - lng) / 2), 2))) as dist
    from restaurants r
    where r.latitude between lat - km / 111.0 and lat + km / 111.0
      and r.longitude between lng - km / (111.0 * cos(radians(lat))) and lng + km / (111.0 * cos(radians(lat)))
  ), ranked as (
    select d.id, d.name, b.id as rid, b.name as rname, d.avg_rating, d.review_count, b.dist,
      (d.avg_rating * d.review_count + 7 * 2) / (d.review_count + 2) as score
    from box b
    join dishes d on d.restaurant_id = b.id
    where b.dist <= km
      and d.review_count > 0
      and (coalesce(trim(term), '') = ''
        or d.name ilike '%' || trim(term) || '%'
        or d.section ilike '%' || trim(term) || '%'
        or b.cuisine ilike '%' || trim(term) || '%')
    order by score desc, d.review_count desc, b.dist
    limit least(greatest(max_rows, 1), 100)
  )
  select x.id, x.name, x.rid, x.rname, x.avg_rating, x.review_count, x.dist,
    (select p.storage_path from reviews v join review_photos p on p.review_id = v.id
      where v.dish_id = x.id order by v.like_count desc, v.created_at desc, p.position limit 1)
  from ranked x
  order by x.score desc, x.review_count desc, x.dist;
$$;
