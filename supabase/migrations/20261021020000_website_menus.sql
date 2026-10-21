-- Bookkeeping for the fetch-menu function, which reads menus from restaurants'
-- own websites. Only the function (service role) touches these tables.

-- One row per restaurant: when its website was last checked and what happened,
-- so each restaurant is tried at most once a month.
create table public.menu_fetches (
  restaurant_id uuid primary key references public.restaurants on delete cascade,
  requested_by uuid references auth.users on delete set null,
  status text not null,
  website text,
  dishes_added integer not null default 0,
  attempted_at timestamptz not null default now()
);
create index menu_fetches_user_time on public.menu_fetches (requested_by, attempted_at desc);
alter table public.menu_fetches enable row level security;

-- Google Places lookups per month, kept under Google's free allowance.
create table public.google_lookups (
  month text primary key, -- e.g. 2026-10
  count integer not null default 0
);
alter table public.google_lookups enable row level security;
