-- Diet filter for "Best near me": vegetarian, vegan, gluten_free or halal.

drop function if exists public.best_dishes_near(double precision, double precision, double precision, text, integer);

create or replace function public.best_dishes_near(
  lat double precision, lng double precision, km double precision default 1.6, term text default null, max_rows integer default 40,
  diet text default null
) returns table (
  dish_id uuid, dish_name text, restaurant_id uuid, restaurant_name text,
  avg_rating numeric, review_count integer, distance_km double precision, photo_path text
)
language sql stable set search_path = public, pg_temp as $$
  with box as (
    select r.id, r.name, r.cuisine, r.diets,
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
      -- Vegan, vegetarian and gluten free come from the dish; halal can also be
      -- the whole restaurant.
      and (diet is null
        or diet = any (d.diets)
        or (diet = 'halal' and 'halal' = any (b.diets)))
    order by score desc, d.review_count desc, b.dist
    limit least(greatest(max_rows, 1), 100)
  )
  select x.id, x.name, x.rid, x.rname, x.avg_rating, x.review_count, x.dist,
    (select p.storage_path from reviews v join review_photos p on p.review_id = v.id
      where v.dish_id = x.id order by v.like_count desc, v.created_at desc, p.position limit 1)
  from ranked x
  order by x.score desc, x.review_count desc, x.dist;
$$;
