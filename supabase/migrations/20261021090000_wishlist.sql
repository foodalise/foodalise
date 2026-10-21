-- Dishes people want to try. Private: only you see your own wishlist.
create table public.wishlist (
  user_id uuid not null references public.profiles on delete cascade,
  dish_id uuid not null references public.dishes on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dish_id)
);
create index wishlist_dish on public.wishlist (dish_id);
alter table public.wishlist enable row level security;
create policy "see your own wishlist" on public.wishlist for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add to your own wishlist" on public.wishlist for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "remove from your own wishlist" on public.wishlist for delete to authenticated
  using (user_id = (select auth.uid()));
