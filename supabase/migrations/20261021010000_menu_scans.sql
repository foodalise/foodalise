-- One row per menu photo read by the read-menu function, so each person can be
-- limited to a number of reads a day (each read costs an AI call). Only the
-- function (service role) touches this table.
create table public.menu_scans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  restaurant_id uuid references public.restaurants on delete set null,
  created_at timestamptz not null default now()
);
create index menu_scans_user_time on public.menu_scans (user_id, created_at desc);
alter table public.menu_scans enable row level security;
