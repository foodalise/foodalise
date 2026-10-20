-- Foodalize core schema: people, restaurants, dishes, reviews and their photos.

create extension if not exists pg_trgm;

-- Profiles ---------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,30}$'),
  display_name text,
  bio text check (char_length(bio) <= 300),
  avatar_path text,
  created_at timestamptz not null default now()
);

-- Every new login gets a profile; the app sends the chosen username as sign-up metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(replace(new.id::text, '-', ''), 1, 10)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Restaurants (imported from FSA open data by scripts/import-fsa.mjs) ------

create type public.menu_source as enum ('none', 'chain', 'website', 'users');

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  fsa_id integer unique,
  name text not null,
  business_type text,
  address text,
  postcode text,
  local_authority text,
  latitude double precision,
  longitude double precision,
  hygiene_rating text,
  chain_slug text,
  website text,
  menu_source public.menu_source not null default 'none',
  updated_at timestamptz not null default now()
);

create index restaurants_name_trgm on public.restaurants using gin (name gin_trgm_ops);
create index restaurants_postcode on public.restaurants (postcode);

-- Dishes -------------------------------------------------------------------

create type public.dish_source as enum ('chain', 'website', 'menu_photo', 'user');

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  section text,
  price_pence integer check (price_pence >= 0),
  source public.dish_source not null default 'user',
  created_by uuid references auth.users on delete set null,
  review_count integer not null default 0,
  avg_rating numeric(3, 1),
  created_at timestamptz not null default now()
);

-- One "McChicken Sandwich" per restaurant, however people type the capitals.
create unique index dishes_restaurant_name on public.dishes (restaurant_id, lower(name));

-- Reviews and photos -------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  dish_id uuid not null references public.dishes on delete cascade,
  rating numeric(3, 1) not null check (rating between 1 and 10 and rating * 2 = floor(rating * 2)),
  body text check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index reviews_dish on public.reviews (dish_id, created_at desc);
create index reviews_user on public.reviews (user_id, created_at desc);
create index reviews_recent on public.reviews (created_at desc);

create table public.review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews on delete cascade,
  storage_path text not null,
  position smallint not null default 0
);

create index review_photos_review on public.review_photos (review_id, position);

-- Keep each dish's score and review count current so menus load in one query.
create function public.refresh_dish_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.dish_id, old.dish_id);
begin
  update public.dishes d set
    review_count = s.n,
    avg_rating = s.avg
  from (select count(*)::int as n, round(avg(rating), 1) as avg from public.reviews where dish_id = target) s
  where d.id = target;
  if tg_op = 'UPDATE' and new.dish_id <> old.dish_id then
    update public.dishes d set
      review_count = s.n,
      avg_rating = s.avg
    from (select count(*)::int as n, round(avg(rating), 1) as avg from public.reviews where dish_id = old.dish_id) s
    where d.id = old.dish_id;
  end if;
  return null;
end $$;

create trigger reviews_refresh_dish_stats
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_dish_stats();

-- Row-level security: everything is public to read; people only write their own things.

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.dishes enable row level security;
alter table public.reviews enable row level security;
alter table public.review_photos enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "restaurants are public" on public.restaurants for select using (true);

create policy "dishes are public" on public.dishes for select using (true);
create policy "diners can add dishes" on public.dishes for insert to authenticated
  with check (created_by = (select auth.uid()) and source in ('user', 'menu_photo') and review_count = 0 and avg_rating is null);

create policy "reviews are public" on public.reviews for select using (true);
create policy "post own reviews" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own reviews" on public.reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own reviews" on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "photos are public" on public.review_photos for select using (true);
create policy "add photos to own reviews" on public.review_photos for insert to authenticated
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = (select auth.uid())));
create policy "remove photos from own reviews" on public.review_photos for delete to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = (select auth.uid())));

-- Photo storage: public bucket, each person uploads into a folder named after their user id.

insert into storage.buckets (id, name, public) values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

create policy "upload own review photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own review photos" on storage.objects for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
