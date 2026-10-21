// Deletes the signed-in person's account and everything they posted: their photo
// files, then their login. The database removes their profile, reviews, follows,
// reports and blocks along with the login. Apple requires apps with accounts to
// offer this inside the app.
//
//   POST (no body) -> { ok: true }
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PHOTO_BUCKET = 'review-photos';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  // Photos live in a folder named after the user id.
  const storage = admin.storage.from(PHOTO_BUCKET);
  for (;;) {
    const { data: files, error } = await storage.list(user.id, { limit: 1000 });
    if (error) return json({ error: `Couldn't delete your photos: ${error.message}` }, 500);
    if (!files?.length) break;
    const { error: removeError } = await storage.remove(files.map((f) => `${user.id}/${f.name}`));
    if (removeError) return json({ error: `Couldn't delete your photos: ${removeError.message}` }, 500);
    if (files.length < 1000) break;
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: `Couldn't delete your account: ${error.message}` }, 500);
  return json({ ok: true });
});
