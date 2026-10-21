-- Restaurants people want to try, for when they've heard about a place but
-- haven't picked a dish yet. Private like the dish wishlist.
create table public.restaurant_wishlist (
  user_id uuid not null references public.profiles on delete cascade,
  restaurant_id uuid not null references public.restaurants on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
create index restaurant_wishlist_restaurant on public.restaurant_wishlist (restaurant_id);
alter table public.restaurant_wishlist enable row level security;
create policy "see your own restaurant wishlist" on public.restaurant_wishlist for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add to your own restaurant wishlist" on public.restaurant_wishlist for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "remove from your own restaurant wishlist" on public.restaurant_wishlist for delete to authenticated
  using (user_id = (select auth.uid()));

-- How many people want to try a restaurant (saved the place or any of its
-- dishes). Only the total is shared, never who.
create or replace function public.want_to_try_count(rid uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from (
    select user_id from public.restaurant_wishlist where restaurant_id = rid
    union
    select w.user_id from public.wishlist w join public.dishes d on d.id = w.dish_id where d.restaurant_id = rid
  ) people;
$$;
grant execute on function public.want_to_try_count(uuid) to authenticated;
