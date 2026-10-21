-- The menu reader now hands menu PDFs to Claude as links and reads in the background,
-- so restaurants it failed on before (like The Meeting in Enfield) are worth another go.
-- Forgetting the failed attempts lets the next person who opens them try again now
-- rather than after the usual wait.
delete from public.menu_fetches where status <> 'done';
