-- A fourth score: quality of ingredients. New reviews score taste, presentation,
-- quality of ingredients and value for money, and the overall rating is the
-- average of all four. Reviews from before this keep their three-score average.
alter table public.reviews
  add column ingredients numeric(3, 1) check (ingredients between 1 and 10 and ingredients * 2 = floor(ingredients * 2));

create or replace function public.set_review_rating() returns trigger
language plpgsql as $$
begin
  if new.taste is not null and new.presentation is not null and new.value is not null then
    if new.ingredients is not null then
      new.rating := round((new.taste + new.presentation + new.ingredients + new.value) / 4, 1);
    else
      new.rating := round((new.taste + new.presentation + new.value) / 3, 1);
    end if;
  end if;
  return new;
end;
$$;

drop trigger reviews_set_rating on public.reviews;
create trigger reviews_set_rating
  before insert or update of taste, presentation, ingredients, value, rating on public.reviews
  for each row execute function public.set_review_rating();
