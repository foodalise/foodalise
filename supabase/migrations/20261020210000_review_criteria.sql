-- Reviews score a dish on taste, presentation and value for money (1-10 in
-- half steps). The overall rating is their average, worked out here so it
-- always matches. Older reviews keep their single overall score.
alter table public.reviews
  add column taste numeric(3, 1) check (taste between 1 and 10 and taste * 2 = floor(taste * 2)),
  add column presentation numeric(3, 1) check (presentation between 1 and 10 and presentation * 2 = floor(presentation * 2)),
  add column value numeric(3, 1) check (value between 1 and 10 and value * 2 = floor(value * 2));

-- An average of three half-step scores can land on any tenth (e.g. 7.7).
alter table public.reviews drop constraint reviews_rating_check;
alter table public.reviews add constraint reviews_rating_check check (rating between 1 and 10);

create function public.set_review_rating() returns trigger
language plpgsql as $$
begin
  if new.taste is not null and new.presentation is not null and new.value is not null then
    new.rating := round((new.taste + new.presentation + new.value) / 3, 1);
  end if;
  return new;
end;
$$;

create trigger reviews_set_rating
  before insert or update of taste, presentation, value, rating on public.reviews
  for each row execute function public.set_review_rating();
