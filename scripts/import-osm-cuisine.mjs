#!/usr/bin/env node
// Gives restaurants a food type (coffee, Chinese, pizza...) from OpenStreetMap, the
// free, open map. OSM volunteers tag many places with their cuisine; this finds the
// OSM entry for each of our restaurants (by its hygiene-rating id when OSM has one,
// otherwise by a similar name close by) and saves the cuisine as osm_cuisine. The
// app's little food pictures use it when a place has no menu yet (see the
// food_types migration). Re-run it after each FSA import, or every few months.
//
//   node scripts/import-osm-cuisine.mjs            # every area we have restaurants in
//   node scripts/import-osm-cuisine.mjs --dry-run  # show what it would save
//   node scripts/import-osm-cuisine.mjs --from 20  # carry on from area 20 after stopping
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment, like the FSA
// import. Data © OpenStreetMap contributors, ODbL (credited in the app's Credits).
import { createClient } from '@supabase/supabase-js';

const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const TILE = 0.1; // degrees, about 11km north to south
const NEAR_KM = 0.3; // FSA places sit at their postcode's centre, so allow for some drift

// OSM cuisine tags to the app's cuisine list (lib/cuisines.ts).
const CUISINE = {
  chinese: 'Chinese', cantonese: 'Chinese', szechuan: 'Chinese', sichuan: 'Chinese', dim_sum: 'Chinese', hunan: 'Chinese',
  indian: 'Indian', curry: 'Indian', bangladeshi: 'Indian', nepalese: 'Indian', pakistani: 'Indian', sri_lankan: 'Indian', punjabi: 'Indian', south_indian: 'Indian', gujarati: 'Indian',
  pizza: 'Pizza', burger: 'Burgers', chicken: 'Chicken', fried_chicken: 'Chicken', wings: 'Chicken', 'peri-peri': 'Chicken', peri_peri: 'Chicken',
  kebab: 'Kebab', doner: 'Kebab', fish_and_chips: 'Fish & Chips', 'fish_&_chips': 'Fish & Chips', fish_chips: 'Fish & Chips', chips: 'Fish & Chips',
  coffee_shop: 'Cafe', coffee: 'Cafe', cafe: 'Cafe', tea: 'Cafe', breakfast: 'Cafe', brunch: 'Cafe',
  sandwich: 'Sandwiches', deli: 'Sandwiches', bagel: 'Bakery', bakery: 'Bakery', pastry: 'Bakery',
  italian: 'Italian', pasta: 'Italian', thai: 'Thai', japanese: 'Japanese', sushi: 'Japanese', ramen: 'Japanese',
  korean: 'Korean', vietnamese: 'Vietnamese', asian: 'Pan-Asian', noodle: 'Pan-Asian', malaysian: 'Pan-Asian', indonesian: 'Pan-Asian', filipino: 'Pan-Asian', pan_asian: 'Pan-Asian', oriental: 'Chinese',
  turkish: 'Turkish', lebanese: 'Middle Eastern', middle_eastern: 'Middle Eastern', persian: 'Middle Eastern', iranian: 'Middle Eastern', arab: 'Middle Eastern', syrian: 'Middle Eastern', falafel: 'Middle Eastern', shawarma: 'Middle Eastern', kurdish: 'Middle Eastern', afghan: 'Middle Eastern', iraqi: 'Middle Eastern',
  greek: 'Greek', cypriot: 'Greek', mediterranean: 'Mediterranean',
  mexican: 'Mexican', 'tex-mex': 'Mexican', tacos: 'Mexican', burrito: 'Mexican',
  caribbean: 'Caribbean', jamaican: 'Caribbean', african: 'African', nigerian: 'African', ethiopian: 'African', eritrean: 'African', somali: 'African', ghanaian: 'African', west_african: 'African',
  brazilian: 'Latin American', peruvian: 'Latin American', argentinian: 'Latin American', colombian: 'Latin American', latin_american: 'Latin American', venezuelan: 'Latin American',
  spanish: 'Spanish', tapas: 'Spanish', portuguese: 'Portuguese', french: 'French', british: 'British', english: 'British', pie: 'British', american: 'American', hot_dog: 'American',
  steak_house: 'Steak', steak: 'Steak', seafood: 'Seafood', fish: 'Seafood',
  ice_cream: 'Desserts', dessert: 'Desserts', cake: 'Desserts', donut: 'Desserts', frozen_yogurt: 'Desserts', waffle: 'Desserts', crepe: 'Desserts', bubble_tea: 'Desserts',
  vegan: 'Healthy', salad: 'Healthy', juice: 'Healthy', healthy: 'Healthy', smoothie: 'Healthy', poke: 'Healthy',
};
// Used when an OSM place has no cuisine tag.
const AMENITY = { cafe: 'Cafe', pub: 'Pub', bar: 'Pub', ice_cream: 'Desserts' };
const SHOP = { bakery: 'Bakery', pastry: 'Bakery', deli: 'Sandwiches' };

function foodType(tags) {
  for (const raw of (tags.cuisine ?? '').toLowerCase().split(';')) {
    const c = CUISINE[raw.trim().replace(/\s+/g, '_')];
    if (c) return c;
  }
  return AMENITY[tags.amenity] ?? SHOP[tags.shop] ?? null;
}

const STOP = new Set(['the', 'and', 'ltd', 'limited', 'restaurant', 'cafe', 'café', 'takeaway', 'bar', 'kitchen', 'of', 'at', 'london', 'co', 'uk']);
function words(name) {
  return new Set(name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)));
}
// How alike two names are, from 0 to 1 (shared words over all words).
function alike(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// The free servers are often busy. Start with whichever answered last, give up on
// a request after 90 seconds rather than waiting forever, and move on quickly.
let preferred = 0;
async function overpass(s, w, n, e) {
  const bbox = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:80];(nwr["amenity"~"^(restaurant|cafe|fast_food|pub|bar|ice_cream|food_court)$"]["name"](${bbox});nwr["shop"~"^(bakery|pastry|deli)$"]["name"](${bbox}););out center tags;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const which = (preferred + attempt) % OVERPASS_SERVERS.length;
    const server = OVERPASS_SERVERS[which];
    try {
      const res = await fetch(server, {
        method: 'POST', body: new URLSearchParams({ data: query }),
        headers: { 'user-agent': 'Foodalise import (foodalise.app)' }, signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const { elements } = await res.json();
        preferred = which;
        return elements ?? [];
      }
      console.warn(`  ${server} said ${res.status}, trying again`);
    } catch (err) {
      console.warn(`  ${server} failed (${err.message}), trying again`);
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`OpenStreetMap didn't answer for ${bbox}. Try again later.`);
}

function connect() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function allRestaurants(db) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('restaurants').select('id, fsa_id, name, latitude, longitude, osm_cuisine')
      .not('latitude', 'is', null).order('id').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fromArg = process.argv.indexOf('--from');
  const from = fromArg > 0 ? Math.max(1, parseInt(process.argv[fromArg + 1], 10) || 1) : 1;
  const db = connect();
  const places = await allRestaurants(db);
  console.log(`${places.length} restaurants in Foodalise.`);

  const byFsa = new Map(places.filter((p) => p.fsa_id).map((p) => [String(p.fsa_id), p]));
  const cellOf = (lat, lng) => `${Math.floor(lat / 0.005)},${Math.floor(lng / 0.005)}`;
  const grid = new Map();
  for (const p of places) {
    const k = cellOf(p.latitude, p.longitude);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const tiles = [...new Set(places.map((p) => `${Math.floor(p.latitude / TILE)},${Math.floor(p.longitude / TILE)}`))].sort(); // same order every run, for --from
  console.log(`Asking OpenStreetMap about ${tiles.length} areas${from > 1 ? `, starting at area ${from}` : ''}. This can take a while when its servers are busy.`);
  if (!dryRun) console.log('Each area is saved as it finishes, so you can stop with Ctrl+C and carry on later with --from <area>.');

  const found = new Map(); // restaurant id -> { cuisine, score }
  const byId = new Map(places.map((p) => [p.id, p]));
  const skipped = [];
  let saved = 0;
  for (const [i, tile] of tiles.entries()) {
    if (i + 1 < from) continue;
    const [ty, tx] = tile.split(',').map(Number);
    const s = (ty * TILE).toFixed(3), w = (tx * TILE).toFixed(3), n = ((ty + 1) * TILE).toFixed(3), e = ((tx + 1) * TILE).toFixed(3);
    let elements;
    try {
      elements = await overpass(s, w, n, e);
    } catch (err) {
      // One busy area shouldn't lose the rest: skip it, and a later run fills it in.
      console.warn(`area ${i + 1} of ${tiles.length}: skipped, ${err.message}`);
      skipped.push(i + 1);
      continue;
    }
    const touched = new Set();
    for (const el of elements) {
      const tags = el.tags ?? {};
      const cuisine = foodType(tags);
      if (!cuisine) continue;
      // Best match: OSM's own hygiene-rating id; otherwise the most alike name close by.
      let best = byFsa.get(String(tags['fhrs:id'] ?? '').trim());
      let score = best ? 2 : 0;
      if (!best) {
        const at = { lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon };
        if (at.lat == null || at.lng == null) continue;
        const [cy, cx] = cellOf(at.lat, at.lng).split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          for (const p of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
            const a = alike(tags.name, p.name);
            if (a < 0.5 || km(at, { lat: p.latitude, lng: p.longitude }) > NEAR_KM) continue;
            if (a > score) { best = p; score = a; }
          }
        }
      }
      if (!best) continue;
      const before = found.get(best.id);
      if (!before || score > before.score) { found.set(best.id, { cuisine, score }); touched.add(best.id); }
    }

    // Save as we go, so stopping halfway keeps what's done.
    const changes = [...touched].filter((id) => byId.get(id).osm_cuisine !== found.get(id).cuisine)
      .map((id) => ({ id, cuisine: found.get(id).cuisine }));
    if (dryRun) {
      for (const c of changes.slice(0, 5)) console.log(`  ${byId.get(c.id).name} -> ${c.cuisine}`);
    } else {
      for (let j = 0; j < changes.length; j += 500) {
        const { data, error } = await db.rpc('apply_osm_cuisines', { items: changes.slice(j, j + 500) });
        if (error) throw error;
        saved += data;
      }
      for (const c of changes) byId.get(c.id).osm_cuisine = c.cuisine;
    }
    console.log(`area ${i + 1} of ${tiles.length}: ${elements.length} OSM places, ${touched.size} matched, ${changes.length} saved`);
    await new Promise((r) => setTimeout(r, 1500)); // be kind to the free servers
  }

  console.log(`Found a food type for ${found.size} restaurants.${dryRun ? ' Dry run: nothing saved.' : ` Saved ${saved}.`}`);
  if (skipped.length) console.log(`OpenStreetMap was too busy for ${skipped.length} area(s) (${skipped.join(', ')}). Run this again later to fill them in.`);
  else console.log('Done.');
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
