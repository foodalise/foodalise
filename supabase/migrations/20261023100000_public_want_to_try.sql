-- "Want to try" lists can be seen on people's profiles, like their reviews: anyone
-- signed in can see what someone has saved, except people they've blocked.
-- Only you can still add to or remove from your own list.
-- Run this AFTER updating the app: older versions of the app assume they can only
-- read your own list, and would show everyone's saves as yours.
drop policy "see your own wishlist" on public.wishlist;
create policy "want to try lists are public" on public.wishlist for select to authenticated using (
  not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = wishlist.user_id)
);

drop policy "see your own restaurant wishlist" on public.restaurant_wishlist;
create policy "want to try places are public" on public.restaurant_wishlist for select to authenticated using (
  not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = restaurant_wishlist.user_id)
);

create index if not exists wishlist_user_saved on public.wishlist (user_id, created_at desc);
create index if not exists restaurant_wishlist_user_saved on public.restaurant_wishlist (user_id, created_at desc);
