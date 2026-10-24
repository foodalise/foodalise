-- Reviews posted before "Quality of ingredients" was added get an 8 for it,
-- so every review shows all four scores. The rating trigger recalculates
-- each overall rating as the average of the four.
update public.reviews
  set ingredients = 8
  where ingredients is null
    and taste is not null and presentation is not null and value is not null;
