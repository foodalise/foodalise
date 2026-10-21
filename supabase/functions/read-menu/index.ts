// Reads a photo of a restaurant menu with Claude and adds every dish to that
// restaurant's menu in Foodalise.
//
// Called from the app with the signed-in user's session:
//   POST { restaurantId: string, image: string (base64 JPEG) }
//   -> { found: number, added: number }
//
// Secrets: ANTHROPIC_API_KEY (set in Supabase → Edge Functions → Secrets).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const DAILY_LIMIT = 20; // menu photos per person per day, to keep API costs capped
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MENU_SCHEMA = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: ['string', 'null'] },
          name: { type: 'string' },
          price_pence: { type: ['integer', 'null'] },
        },
        required: ['section', 'name', 'price_pence'],
        additionalProperties: false,
      },
    },
  },
  required: ['dishes'],
  additionalProperties: false,
};

const PROMPT = `This is a photo of a restaurant menu. List every dish or drink a customer can order.
- name: the dish name as printed, in normal capitalisation (e.g. "Chicken Katsu Curry", not "CHICKEN KATSU CURRY"). Leave out descriptions and ingredients.
- section: the menu heading it sits under (e.g. "Starters", "Mains"), or null if there is none.
- price_pence: the price in pence (£12.50 -> 1250), or null if no price is shown. If there are several sizes, use the smallest.
Skip anything that isn't something you can order, such as opening times, allergy notes or set-menu rules.
If the photo isn't a menu or can't be read, return an empty list.`;

type Dish = { section: string | null; name: string; price_pence: number | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Who is asking: check the signed-in user's session token.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const { restaurantId, image } = await req.json().catch(() => ({}));
  if (typeof restaurantId !== 'string' || typeof image !== 'string' || !image) {
    return json({ error: 'Missing restaurant or photo.' }, 400);
  }
  if (image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: 'That photo is too large. Try again a little further away.' }, 413);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin.from('menu_scans').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `You can read ${DAILY_LIMIT} menu photos a day. Try again tomorrow.` }, 429);

  const { data: restaurant } = await admin.from('restaurants').select('id, menu_source').eq('id', restaurantId).single();
  if (!restaurant) return json({ error: 'Restaurant not found.' }, 404);
  await admin.from('menu_scans').insert({ user_id: user.id, restaurant_id: restaurantId });

  let dishes: Dish[];
  try {
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    // Claude Haiku 5.5: the lowest-cost model, which is plenty for reading a menu.
    const response = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: MENU_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') return json({ error: "Couldn't read that photo. Try another." }, 422);
    const text = response.content.find((b) => b.type === 'text');
    dishes = text && text.type === 'text' ? (JSON.parse(text.text).dishes as Dish[]) : [];
  } catch (e) {
    console.error('Claude request failed', e);
    return json({ error: "Couldn't read the menu right now. Try again in a minute." }, 502);
  }

  // Clean up and drop dishes the restaurant already has (same name, any capitals).
  const { data: existing } = await admin.from('dishes').select('name').eq('restaurant_id', restaurantId);
  const seen = new Set((existing ?? []).map((d) => d.name.toLowerCase()));
  const rows = [];
  for (const d of dishes) {
    const name = d.name?.trim().replace(/\s+/g, ' ') ?? '';
    if (name.length < 2 || name.length > 120 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const price = Number.isInteger(d.price_pence) && d.price_pence! >= 0 ? d.price_pence : null;
    rows.push({
      restaurant_id: restaurantId, name, section: d.section?.trim() || null,
      price_pence: price, source: 'menu_photo', created_by: user.id,
    });
  }

  if (rows.length) {
    const { error } = await admin.from('dishes').insert(rows);
    if (error) {
      console.error('Inserting dishes failed', error);
      return json({ error: "Couldn't save the dishes. Try again." }, 500);
    }
    if (restaurant.menu_source === 'none') await admin.from('restaurants').update({ menu_source: 'users' }).eq('id', restaurantId);
  }

  return json({ found: dishes.length, added: rows.length });
});
