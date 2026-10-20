# Foodalise

Review individual dishes, not just restaurants. Pick a restaurant, pick the dish you ate, post a photo and a score out of 10, and build a food diary of everything you've tried.

Built with [Expo](https://expo.dev) (iOS, Android and web from one codebase) and [Supabase](https://supabase.com) (login, database, photo storage). UK restaurants come from the [Food Standards Agency open data](https://ratings.food.gov.uk/open-data).

## What works so far

- Sign up and sign in with email and password
- Feed of the latest dish reviews
- Search restaurants by name
- Restaurant page with its menu, grouped by section, with each dish's average score
- Dish page with everyone's photos and reviews
- Your profile: dishes, restaurants and average score, plus a photo grid

Next up: posting a review (restaurant → dish → photo and score), adding a missing dish, loading chain menus, and reading menu photos with AI.

## First-time setup

1. **Supabase project.** Create a free project at [supabase.com](https://supabase.com). In the SQL editor, run `supabase/migrations/20261020000000_init.sql`. (Or, with the Supabase CLI: `supabase link` then `supabase db push`.)
2. **Environment.** The app already points at the Foodalise Supabase project. To use a different project, copy `.env.example` to `.env` and fill in its URL and publishable key.
3. **Install and run.**
   ```bash
   npm install
   npx expo start
   ```
   Scan the QR code with the Expo Go app on your phone, or press `w` to open it in a browser.
4. **Load restaurants.** Find your council's id, then import its restaurants, cafés, takeaways and pubs:
   ```bash
   node --env-file=.env scripts/import-fsa.mjs --list-authorities | grep -i westminster
   node --env-file=.env scripts/import-fsa.mjs --authority <id>
   ```
   This uses the service role key, so only run it on your own machine.

## Project layout

- `app/` screens (Expo Router: every file is a route)
- `components/ui.tsx` shared buttons, fields, score pills and review cards
- `constants/theme.ts` colours for light and dark mode, and score colours (green 8+, amber 6–8, red below 6)
- `lib/` Supabase client, login state and shared types
- `supabase/migrations/` database schema and access rules
- `scripts/import-fsa.mjs` FSA restaurant import

## Checks

```bash
npx tsc --noEmit
```
