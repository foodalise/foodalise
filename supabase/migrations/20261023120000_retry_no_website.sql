-- The menu finder now also asks Google and searches the web (fetch-menu, 2026-10-23).
-- Restaurants it gave up on before ("no website found") are tried again the next time
-- someone opens them, instead of waiting out the two weeks.
delete from public.menu_fetches where status = 'no_website';
