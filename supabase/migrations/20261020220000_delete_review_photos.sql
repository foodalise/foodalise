-- Deleting a file from Supabase Storage needs a select policy as well as a
-- delete one, so people can remove the photos of reviews they delete.
create policy "read own review photos" on storage.objects for select to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
