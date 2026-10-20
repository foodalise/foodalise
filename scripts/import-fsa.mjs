#!/usr/bin/env node
// Imports restaurants, cafés, takeaways and pubs for one local authority from the
// Food Standards Agency's open hygiene-ratings API into the `restaurants` table.
//
//   node scripts/import-fsa.mjs --list-authorities        # find an authority id
//   node scripts/import-fsa.mjs --authority 197           # import that authority
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never ship
// the service role key in the app). Data: https://ratings.food.gov.uk/open-data
import { createClient } from '@supabase/supabase-js';

const API = 'https://api.ratings.food.gov.uk';
const HEADERS = { 'x-api-version': '2', accept: 'application/json' };
// FSA business type ids: Restaurant/Cafe/Canteen, Takeaway/sandwich shop, Pub/bar/nightclub.
const BUSINESS_TYPES = [1, 7844, 7843];
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
  const { authorities } = await fsa('/Authorities/basic');
  for (const a of authorities.sort((x, y) => x.Name.localeCompare(y.Name))) console.log(`${a.LocalAuthorityId}\t${a.Name}`);
}

async function importAuthority(authorityId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  let total = 0;
  for (const type of BUSINESS_TYPES) {
    for (let page = 1; ; page++) {
      const data = await fsa(`/Establishments?localAuthorityId=${authorityId}&businessTypeId=${type}&pageNumber=${page}&pageSize=${PAGE_SIZE}`);
      const rows = data.establishments.map(toRow);
      if (rows.length) {
        const { error } = await db.from('restaurants').upsert(rows, { onConflict: 'fsa_id' });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
        total += rows.length;
        console.log(`type ${type} page ${page}: ${rows.length} places (${total} so far)`);
      }
      if (page >= (data.meta?.totalPages ?? 1) || rows.length < PAGE_SIZE) break;
    }
  }
  console.log(`Done: ${total} places imported for authority ${authorityId}.`);
}

const args = process.argv.slice(2);
if (args.includes('--list-authorities')) {
  await listAuthorities();
} else {
  const i = args.indexOf('--authority');
  const id = i >= 0 ? Number(args[i + 1]) : NaN;
  if (!Number.isInteger(id)) {
    console.error('Usage: node scripts/import-fsa.mjs --authority <id>   (find ids with --list-authorities)');
    process.exit(1);
  }
  await importAuthority(id);
}
