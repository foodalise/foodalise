-- Diners can add a restaurant the food hygiene register doesn't give us (for
-- example venues it files as "Other catering premises"). Added through
-- add_restaurant() only, which checks the details, stops duplicates and limits
-- how many one person can add in a day. (search_path includes extensions
-- because pg_trgm's similarity() may live in either schema on Supabase.)
alter table public.restaurants add column if not exists added_by uuid references public.profiles on delete set null;
alter table public.restaurants add column if not exists added_at timestamptz;
create index if not exists restaurants_added_by on public.restaurants (added_by, added_at);

create or replace function public.add_restaurant(
  place_name text, lat double precision, lng double precision,
  place_address text default null, place_postcode text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  me uuid := (select auth.uid());
  clean text := btrim(regexp_replace(coalesce(place_name, ''), '\s+', ' ', 'g'));
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'Sign in to add a place.'; end if;
  if char_length(clean) not between 2 and 80 then raise exception 'Give the place a name (2 to 80 letters).'; end if;
  -- Roughly the UK, so a mistyped pin can't land somewhere else.
  if lat is null or lng is null or lat not between 49.8 and 60.9 or lng not between -8.7 and 1.8 then
    raise exception 'That spot is outside the UK.';
  end if;
  if (select count(*) from public.restaurants where added_by = me and added_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve added 10 places today. Try again tomorrow.';
  end if;

  -- Already on the map within about 150m under a similar name? Use that one.
  select r.id into existing from public.restaurants r
  where r.latitude between lat - 0.00135 and lat + 0.00135
    and r.longitude between lng - 0.0022 and lng + 0.0022
    and similarity(lower(r.name), lower(clean)) > 0.4
  order by similarity(lower(r.name), lower(clean)) desc
  limit 1;
  if existing is not null then return existing; end if;

  insert into public.restaurants (name, business_type, address, postcode, latitude, longitude, added_by, added_at)
  values (clean, 'Added by a diner', nullif(btrim(place_address), ''), nullif(upper(btrim(place_postcode)), ''), lat, lng, me, now())
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.add_restaurant(text, double precision, double precision, text, text) from public, anon;
grant execute on function public.add_restaurant(text, double precision, double precision, text, text) to authenticated;
