#!/usr/bin/env node
// Imports restaurants, cafés, takeaways and pubs from the Food Standards Agency's
// open hygiene-ratings API into the `restaurants` table, then gives branches of
// known chains their chain's menu. The database itself skips school, hospital and
// care-home kitchens (see is_food_place() in the food_places_only migration). Re-running it updates existing places and adds
// new openings, so run it again every month or so to stay current.
//
//   node scripts/import-fsa.mjs --london                  # every London borough
//   node scripts/import-fsa.mjs --region "North West"     # any FSA region
//   node scripts/import-fsa.mjs --list-authorities        # find an authority id
//   node scripts/import-fsa.mjs --authority 197           # import one authority
//   node scripts/import-fsa.mjs --council Brent           # import one council by name
//   node scripts/import-fsa.mjs --existing                # refresh every council already imported
//                                                         # (the monthly GitHub Action runs this)
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never ship
// the service role key in the app). Data: https://ratings.food.gov.uk/open-data
import { createClient } from '@supabase/supabase-js';

const API = 'https://api.ratings.food.gov.uk';
const HEADERS = { 'x-api-version': '2', accept: 'application/json' };
// FSA business type ids: Restaurant/Cafe/Canteen, Takeaway/sandwich shop, Pub/bar/nightclub,
// Other catering premises (only the ones named like a place to eat are kept).
const BUSINESS_TYPES = [1, 7844, 7843, 7841];
const PAGE_SIZE = 1000;

async function fsa(path) {
  const res = await fetch(API + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`FSA API ${res.status} for ${path}`);
  return res.json();
}

function toRow(e) {
  const address = [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4].filter(Boolean).join(', ');
  const lat = parseFloat(e.geocode?.latitude);
  const lng = parseFloat(e.geocode?.longitude);
  return {
    fsa_id: e.FHRSID,
    name: e.BusinessName.trim(),
    business_type: e.BusinessType,
    address: address || null,
    postcode: e.PostCode || null,
    local_authority: e.LocalAuthorityName,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    hygiene_rating: e.RatingValue ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function listAuthorities() {
  const { authorities } = await fsa('/Authorities');
  for (const a of authorities.sort((x, y) => x.Name.localeCompare(y.Name))) console.log(`${a.LocalAuthorityId}\t${a.Name}\t${a.RegionName ?? ''}`);
}

function connect() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function importAuthority(db, authorityId) {
  let total = 0;
  for (const type of BUSINESS_TYPES) {
    for (let page = 1; ; page++) {
      const data = await fsa(`/Establishments?localAuthorityId=${authorityId}&businessTypeId=${type}&pageNumber=${page}&pageSize=${PAGE_SIZE}`);
      const rows = data.establishments.map(toRow);
      if (rows.length) {
        const { error } = await db.from('restaurants').upsert(rows, { onConflict: 'fsa_id' });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
        total += rows.length;
        console.log(`type ${type} page ${page}: ${rows.length} places checked (${total} so far)`);
      }
      if (page >= (data.meta?.totalPages ?? 1) || rows.length < PAGE_SIZE) break;
    }
  }
  console.log(`Done: ${total} places checked for authority ${authorityId}.`);
  return total;
}

// Give branches of known chains (McDonald's, Nando's, ...) their chain's menu.
async function applyChainMenus(db) {
  const { data: added, error } = await db.rpc('apply_chain_menus');
  if (error) console.warn(`Couldn't add chain menus: ${error.message}`);
  else console.log(`Chain menus: ${added} dishes added to chain branches.`);
}

const LONDON = ['barking', 'barnet', 'bexley', 'brent', 'bromley', 'camden', 'city of london', 'croydon', 'ealing', 'enfield',
  'greenwich', 'hackney', 'hammersmith', 'haringey', 'harrow', 'havering', 'hillingdon', 'hounslow', 'islington', 'kensington',
  'kingston', 'lambeth', 'lewisham', 'merton', 'newham', 'redbridge', 'richmond', 'southwark', 'sutton', 'tower hamlets',
  'waltham forest', 'wandsworth', 'westminster'];

// Every authority in an FSA region, e.g. "London" (its 32 boroughs plus the City).
async function importRegion(db, region) {
  const { authorities } = await fsa('/Authorities');
  let inRegion = authorities.filter((a) => (a.RegionName ?? '').toLowerCase() === region.toLowerCase());
  // Backup in case the FSA's region names change: London's councils by name.
  if (!inRegion.length && region.toLowerCase() === 'london') {
    inRegion = authorities.filter((a) => LONDON.some((n) => a.Name.toLowerCase().includes(n)));
  }
  if (!inRegion.length) throw new Error(`No authorities found in region "${region}". See --list-authorities for region names.`);
  console.log(`Importing ${inRegion.length} authorities in ${region}…`);
  let total = 0;
  for (const [i, a] of inRegion.entries()) {
    console.log(`\n[${i + 1}/${inRegion.length}] ${a.Name}`);
    try {
      total += await importAuthority(db, a.LocalAuthorityId);
    } catch (e) {
      // One council's hiccup shouldn't stop the rest; re-running picks it up.
      console.warn(`Skipped ${a.Name}: ${e.message}`);
    }
  }
  console.log(`\nAll done: ${total} places across ${region}.`);
}

// One council by name, e.g. "Brent".
async function importCouncil(db, name) {
  const { authorities } = await fsa('/Authorities');
  const matches = authorities.filter((a) => a.Name.toLowerCase().includes(name.toLowerCase()));
  if (matches.length !== 1) {
    const names = matches.map((a) => a.Name).join(', ');
    throw new Error(matches.length ? `"${name}" matches ${names}. Be more specific.` : `No council called "${name}". See --list-authorities.`);
  }
  console.log(`Importing ${matches[0].Name}…`);
  await importAuthority(db, matches[0].LocalAuthorityId);
}

// Every council that already has places in Foodalise, so the monthly refresh picks
// up new openings wherever we've imported, without anyone listing the areas.
async function importExisting(db) {
  const { authorities } = await fsa('/Authorities');
  const ours = [];
  for (const a of authorities) {
    const { count, error } = await db.from('restaurants').select('id', { count: 'exact', head: true }).eq('local_authority', a.Name);
    if (error) throw new Error(`Supabase lookup failed: ${error.message}`);
    if (count) ours.push(a);
  }
  console.log(`Refreshing ${ours.length} councils already in Foodalise…`);
  let total = 0;
  for (const [i, a] of ours.entries()) {
    console.log(`\n[${i + 1}/${ours.length}] ${a.Name}`);
    try {
      total += await importAuthority(db, a.LocalAuthorityId);
    } catch (e) {
      console.warn(`Skipped ${a.Name}: ${e.message}`);
    }
  }
  console.log(`\nAll done: ${total} places checked.`);
}

const args = process.argv.slice(2);
const regionAt = args.indexOf('--region');
const councilAt = args.indexOf('--council');
if (args.includes('--list-authorities')) {
  await listAuthorities();
} else if (args.includes('--existing')) {
  const db = connect();
  await importExisting(db);
  await applyChainMenus(db);
} else if (councilAt >= 0) {
  const db = connect();
  await importCouncil(db, args[councilAt + 1] ?? '');
  await applyChainMenus(db);
} else if (args.includes('--london') || regionAt >= 0) {
  const db = connect();
  await importRegion(db, args.includes('--london') ? 'London' : args[regionAt + 1]);
  await applyChainMenus(db);
} else {
  const i = args.indexOf('--authority');
  const id = i >= 0 ? Number(args[i + 1]) : NaN;
  if (!Number.isInteger(id)) {
    console.error('Usage: node scripts/import-fsa.mjs --authority <id>   (find ids with --list-authorities)');
    process.exit(1);
  }
  const db = connect();
  await importAuthority(db, id);
  await applyChainMenus(db);
}
