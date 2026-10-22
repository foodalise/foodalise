-- Fake-review protection (the UK's DMCC Act asks review apps to take reasonable
-- steps): one person can post at most 20 reviews a day, and only one review of the
-- same dish a day. Real diners never hit these; bulk posting does.

create or replace function public.limit_reviews() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reviews r
      where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'You''ve posted 20 reviews today. You can post more tomorrow.';
  end if;
  if exists (select 1 from public.reviews r
      where r.user_id = new.user_id and r.dish_id = new.dish_id and r.created_at > now() - interval '24 hours') then
    raise exception 'You''ve already reviewed this dish today.';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_limit on public.reviews;
create trigger reviews_limit before insert on public.reviews
  for each row execute function public.limit_reviews();
