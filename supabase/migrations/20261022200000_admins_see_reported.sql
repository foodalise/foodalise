-- Reporting a review hides it from the person who reported it. That included
-- the team: an admin who reported a review then couldn't open it from the
-- dashboard ("Review not found"). Admins can now see any review or comment that
-- has an open report, so they can read it before removing or keeping it.

create policy "team sees reported reviews" on public.reviews for select to authenticated using (
  (select public.is_admin())
  and exists (select 1 from public.reports r where r.review_id = reviews.id)
);

create policy "team sees reported comments" on public.review_comments for select to authenticated using (
  (select public.is_admin())
  and exists (select 1 from public.reports r where r.comment_id = review_comments.id)
);
