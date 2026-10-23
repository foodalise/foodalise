// Finds a restaurant's own website, reads the menu on it with Claude, and adds the
// dishes to the restaurant in Foodalise. The app calls this when someone opens a
// restaurant that has no menu or whose website menu is two months old, and when a
// diner taps "Refresh menu" (once each per restaurant, and each restaurant at most
// once a month). Refreshing a chain branch reads the chain's menu page
// (chain_menu_sources) and updates every branch at once.
// Dishes that have dropped off a menu are hidden (on_menu = false), never deleted.
// A re-read that finds far fewer dishes than before is ignored, in case the site was
// half-loaded.
//
//   POST { restaurantId: string, website?: string, refresh?: boolean, menuLink?: string } -> { status: string, added: number }
//   website: the restaurant's site, typed in by a diner when we couldn't find it.
//   menuLink: the Foodalise team only: read the menu from this page or PDF (not saved as the website).
//   refresh: a diner tapped "Refresh menu". Statuses only it returns: too_soon, already_refreshed.
//
// Websites come from OpenStreetMap (free), then Google Places if GOOGLE_PLACES_API_KEY is
// set (free up to GOOGLE_MONTHLY_CAP a month), then, for anything Google misses or once
// its monthly allowance is used, a web search by Claude (about 2p each, up to
// SEARCH_MONTHLY_CAP a month). Both limits can be changed in Supabase's Edge Function
// secrets without a code change. Google's terms don't allow keeping what it returns,
// so a website found through Google is used once to read the menu and never saved
// (the dishes are kept); it is looked up again at the next re-read.
// Sites that build their menu with JavaScript after loading (Square Online, Wix and
// other ordering sites) arrive empty, so if the plain read finds no dishes, the page
// is read again through Jina Reader (free), which loads it in a real browser first.
// Menu PDFs are handed to Claude as links, so Claude fetches them itself; if that
// fails they're downloaded here and sent instead.
// Reading a menu can take a minute or two, longer than a phone waits for an answer,
// so the read runs in the background: the app gets status "running" straight away
// and asks again every few seconds until the status changes.
// Secrets: ANTHROPIC_API_KEY (required), GOOGLE_PLACES_API_KEY and JINA_API_KEY (optional).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// How long before a restaurant is tried again, by what happened last time.
const RETRY_AFTER_DAYS: Record<string, number> = { done: 60, no_menu: 30, no_website: 14, unreadable: 7, error: 1, running: 0.01 };
const DAILY_LIMIT = 30; // restaurants one person can trigger a day
// Monthly limits, each overridable with a Supabase secret of the same name (0 turns one off).
const monthlyCap = (name: string, fallback: number) => {
  const set = Number(Deno.env.get(name));
  return Number.isFinite(set) && Deno.env.get(name)?.trim() ? Math.max(0, Math.floor(set)) : fallback;
};
// Google gives 1,000 free website lookups a month; stay under it so it never bills.
const GOOGLE_MONTHLY_CAP = monthlyCap('GOOGLE_MONTHLY_CAP', 950);
// Web searches a month once Google has nothing, about 2p each: 250 is about £5 (Jay's choice, 2026-10-23).
const SEARCH_MONTHLY_CAP = monthlyCap('SEARCH_MONTHLY_CAP', 250);
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// Listing and delivery sites aren't the restaurant's own website.
const NOT_OWN_SITE = ['deliveroo.co.uk', 'ubereats.com', 'just-eat.co.uk', 'tripadvisor.co.uk', 'tripadvisor.com', 'facebook.com', 'instagram.com', 'google.com', 'yelp.co.uk', 'yelp.com', 'opentable.co.uk', 'opentable.com', 'thefork.co.uk', 'tiktok.com', 'x.com', 'twitter.com', 'foodhygiene.food.gov.uk', 'ratings.food.gov.uk', 'restaurantguru.com', 'menulist.menu', 'sirved.com', 'hungryhouse.co.uk', 'yell.com', 'squaremeal.co.uk', 'timeout.com'];
const USER_AGENT = 'FoodaliseMenuReader/1.0 (reads public restaurant menus)';
const MAX_TEXT_CHARS = 80_000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PDF_CHARS_TOTAL = 24_000_000;
const MAX_PAGES = 5; // homepage plus up to four menu pages or PDFs
const REFRESH_EVERY_DAYS = 30; // any restaurant's menu, refreshed by diners at most this often
const CHAIN_RETRY_DAYS = 3;
const KEEP_IF_FEWER_THAN = 0.5; // a re-read must find at least half as many dishes as before

// Same list as lib/cuisines.ts in the app.
const CUISINES = [
  'African', 'American', 'Bakery', 'British', 'Burgers', 'Cafe', 'Caribbean', 'Chicken', 'Chinese', 'Desserts',
  'Fish & Chips', 'French', 'Greek', 'Healthy', 'Indian', 'Italian', 'Japanese', 'Kebab', 'Korean', 'Latin American',
  'Mediterranean', 'Mexican', 'Middle Eastern', 'Pan-Asian', 'Pizza', 'Portuguese', 'Pub', 'Sandwiches', 'Seafood',
  'Spanish', 'Steak', 'Thai', 'Turkish', 'Vietnamese', 'Other',
];
const DISH_DIETS = ['vegetarian', 'vegan', 'gluten_free'];

const MENU_SCHEMA = {
  type: 'object',
  properties: {
    cuisine: { type: 'string', enum: CUISINES },
    halal: { type: 'boolean' },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: ['string', 'null'] },
          name: { type: 'string' },
          price_pence: { type: ['integer', 'null'] },
          diets: { type: 'array', items: { type: 'string', enum: DISH_DIETS } },
        },
        required: ['section', 'name', 'price_pence', 'diets'],
        additionalProperties: false,
      },
    },
  },
  required: ['cuisine', 'halal', 'dishes'],
  additionalProperties: false,
};

const CUISINE_SCHEMA = {
  type: 'object',
  properties: { cuisine: { type: 'string', enum: CUISINES } },
  required: ['cuisine'],
  additionalProperties: false,
};

const PROMPT = `Above are pages from a restaurant's own website. List every dish or drink on its current menu.
- name: the dish name as printed, in normal capitalisation (e.g. "Chicken Katsu Curry", not "CHICKEN KATSU CURRY"). Leave out descriptions and ingredients.
- section: the menu heading it sits under (e.g. "Starters", "Mains"), or null if there is none. The text may start part-way through a page; give dishes before the first heading the heading they most likely sit under.
- price_pence: the price in pence (£12.50 -> 1250), or null if no price is shown. If there are several sizes, use the smallest.
- diets: "vegetarian", "vegan" or "gluten_free" only where the menu marks the dish that way (e.g. V, VG, GF). Don't guess.
- cuisine: the kind of food the restaurant serves overall, or "Other" if none fits.
- halal: true only if the pages say the food is halal.
Only include things a customer can order. Ignore opening times, events, allergy notes and navigation text.
If the pages don't contain a menu, return an empty list.`;

type Dish = { section: string | null; name: string; price_pence: number | null; diets: string[] };
type Menu = { dishes: Dish[]; cuisine: string | null; halal: boolean }; // cuisine is null only when nothing was read
const NO_MENU: Menu = { dishes: [], cuisine: null, halal: false };
type Page = { url: string; text?: string; pdf?: string; pdfUrl?: string; html?: string };

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// "DISHOOM LTD" and "Dishoom Covent Garden" -> comparable word sets.
const STOP = new Set(['the', 'ltd', 'limited', 'restaurant', 'restaurants', 'cafe', 'and', 'bar', 'kitchen', 'co', 'plc', 'uk', 'london']);
// Words that say what kind of place it is rather than which one: the food hygiene list
// has "Moka Indian" where its website and the map say "Moka Dining".
const KIND = new Set(['indian', 'italian', 'chinese', 'thai', 'japanese', 'korean', 'vietnamese', 'turkish', 'lebanese',
  'greek', 'mexican', 'spanish', 'french', 'portuguese', 'persian', 'nepalese', 'pakistani', 'bangladeshi', 'caribbean',
  'african', 'american', 'british', 'cuisine', 'dining', 'grill', 'lounge', 'bistro', 'brasserie', 'eatery', 'takeaway',
  'tandoori', 'diner', 'canteen', 'trattoria', 'pizzeria', 'cantina']);
function words(name: string) {
  const all = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  const own = all.filter((w) => !KIND.has(w));
  return own.length ? own : all; // "Indian Lounge" has only kind words, so keep them
}
function sameName(a: string, b: string) {
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.filter((w) => long.includes(w)).length / short.length >= 0.6;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000) {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) } });
}

// A web address a diner typed: public http(s) only, with a dot in the host name.
function cleanWebsite(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.endsWith('.local')) return null;
    return isOwnSite(url.href) ? url.href : null;
  } catch { return null; }
}

function isOwnSite(url: string) {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
    return !NOT_OWN_SITE.some((d) => host === d || host.endsWith(`.${d}`));
  } catch { return false; }
}

// Free: OpenStreetMap's map data often lists a venue's website. Food hygiene
// locations are often the postcode's centre, so search a few hundred metres.
// Public map servers are busy, so try the next one if one fails.
async function websiteFromOsm(name: string, lat: number, lng: number) {
  const query = `[out:json][timeout:15];nwr(around:400,${lat},${lng})["name"];out tags center 300;`;
  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetchWithTimeout(server, { method: 'POST', body: new URLSearchParams({ data: query }) }, 20_000);
      if (!res.ok) continue;
      const { elements } = await res.json() as { elements: { tags?: Record<string, string> }[] };
      for (const el of elements) {
        const site = el.tags?.website ?? el.tags?.['contact:website'];
        if (site && el.tags?.name && sameName(name, el.tags.name) && isOwnSite(site)) return site;
      }
      return null;
    } catch (e) {
      console.warn('overpass failed', server, e);
    }
  }
  return null;
}

// Monthly counter kept in google_lookups, under its own key per service.
async function underMonthlyCap(admin: SupabaseClient<any>, key: string, cap: number) {
  const { data: used } = await admin.from('google_lookups').select('count').eq('month', key).maybeSingle();
  if ((used?.count ?? 0) >= cap) return false;
  await admin.from('google_lookups').upsert({ month: key, count: (used?.count ?? 0) + 1 });
  return true;
}

// About 2p: Claude Haiku searches the web for the restaurant's own website.
async function websiteFromSearch(admin: SupabaseClient<any>, name: string, address: string | null, postcode: string | null) {
  try {
    return await searchForWebsite(admin, name, address, postcode);
  } catch (e) {
    console.warn('web search failed', e); // a failed search shouldn't stop the restaurant being tried again later
    return null;
  }
}
async function searchForWebsite(admin: SupabaseClient<any>, name: string, address: string | null, postcode: string | null) {
  if (!(await underMonthlyCap(admin, `search-${new Date().toISOString().slice(0, 7)}`, SEARCH_MONTHLY_CAP))) return null;
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const where = [address, postcode].filter(Boolean).join(', ');
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low' },
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2, user_location: { type: 'approximate', country: 'GB' } }],
    messages: [{
      role: 'user',
      content: `Find the official website of the restaurant "${name}" at ${where || 'an address in the UK'}. ` +
        'It must be the restaurant\'s own site, not a delivery app, review site or social media page. ' +
        'Reply with only the website address, or NONE if it has no website of its own.',
    }],
  });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.type === 'text' ? b.text : '').join(' ');
  if (/^\s*NONE\b/i.test(text)) return null;
  // The first address in the answer that is the restaurant's own site.
  const urls = [...text.matchAll(/https?:\/\/[^\s)"'<>\]]+/gi)].map((m) => m[0]);
  if (!urls.length) urls.push(...[...text.matchAll(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:co\.uk|com|uk|london|net|org|restaurant|cafe)\b[^\s)"'<>\]]*/gi)].map((m) => m[0]));
  return urls.map((u) => u.replace(/[.,]+$/, '')).find(isOwnSite) ?? null;
}

// Capped below Google's free monthly allowance so it never bills.
async function websiteFromGoogle(admin: SupabaseClient<any>, name: string, postcode: string | null, lat: number | null, lng: number | null) {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return null;
  if (!(await underMonthlyCap(admin, new Date().toISOString().slice(0, 7), GOOGLE_MONTHLY_CAP))) return null;

  const res = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.websiteUri' },
    body: JSON.stringify({
      textQuery: [name, postcode].filter(Boolean).join(' '),
      maxResultCount: 1,
      ...(lat != null && lng != null ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 200 } } } : {}),
    }),
  });
  if (!res.ok) {
    // 403 usually means billing isn't switched on for the Google Cloud project.
    console.warn('google places failed', res.status, await res.text().catch(() => ''));
    return null;
  }
  const place = (await res.json()).places?.[0];
  return place?.websiteUri && sameName(name, place.displayName?.text ?? '') && isOwnSite(place.websiteUri) ? place.websiteUri as string : null;
}

// Respect a site's robots.txt "Disallow" rules for all crawlers.
async function robotsAllow(url: URL) {
  try {
    const res = await fetchWithTimeout(`${url.origin}/robots.txt`, {}, 5_000);
    if (!res.ok) return true;
    let applies = false;
    for (const raw of (await res.text()).split('\n')) {
      const line = raw.split('#')[0].trim();
      const [field, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (/^user-agent$/i.test(field)) applies = value === '*';
      else if (applies && /^disallow$/i.test(field) && value && url.pathname.startsWith(value)) return false;
    }
  } catch { /* no robots.txt: allowed */ }
  return true;
}

function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&pound;/g, '£').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

async function getPage(url: string): Promise<Page | null> {
  const u = new URL(url);
  if (!(await robotsAllow(u))) return null;
  if (u.pathname.toLowerCase().endsWith('.pdf')) return { url, pdfUrl: url };
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('pdf') || u.pathname.toLowerCase().endsWith('.pdf')) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES) return null;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { url, pdf: btoa(bin) };
  }
  if (!type.includes('html')) return null;
  const html = await res.text();
  return { url: res.url || url, html, text: htmlToText(html) };
}

// Links on a page that look like the menu, with a score: the main food menu first,
// then lunch, brunch and the like, with drinks, seasonal and event menus last (Moka
// Dining's menu page lists 12 PDFs, drinks, Christmas and two from 2023 among them,
// and only a few get read). PDFs from years before a page's newest ones count for
// less, since they're usually old menus nobody took down.
type Scored = [href: string, score: number];
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const MAIN_MENU = /food|\beat\b|dinner|evening|a[ -]?la[ -]?carte|all[ -]?day|\bmains?\b|starter/;
const OTHER_MEAL = /lunch|brunch|breakfast|takeaway|thali|set menu/;
const SIDE_MENU = /drink|cocktail|wine|beer|christmas|festive|xmas|bottomless|valentine|mother|new[ -]?year|party|private|hire|event|whats?[ -]?on|what-s-on|offer|gift|voucher|allergen|book/;
function menuLinks(page: Page): Scored[] {
  const base = new URL(page.url);
  const links: { href: URL; hay: string; isPdf: boolean }[] = [];
  for (const m of (page.html ?? '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href: URL;
    try { href = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(href.protocol)) continue;
    const isPdf = href.pathname.toLowerCase().endsWith('.pdf');
    const hay = `${safeDecode(href.pathname)} ${htmlToText(m[2])}`.toLowerCase().replace(/[_-]/g, ' ');
    // Another site only when the link says it's the menu (many restaurants keep theirs on
    // a menu app, like Regency Club on Served), and never a delivery or review site.
    if (href.hostname !== base.hostname && !isPdf && !(/menu/.test(hay) && isOwnSite(href.href))) continue;
    links.push({ href, hay, isPdf });
  }
  const year = (u: URL) => Number(u.pathname.match(/\/(20\d\d)\//)?.[1] ?? 0);
  const newest = Math.max(0, ...links.filter((l) => l.isPdf).map((l) => year(l.href)));
  const found = new Map<string, number>();
  for (const { href, hay, isPdf } of links) {
    const main = MAIN_MENU.test(hay);
    let score = /menu/.test(hay) ? 3 : 0;
    if (main) score += 2;
    else if (OTHER_MEAL.test(hay)) score += 1;
    if (score && isPdf) score += 1;
    if (!main && SIDE_MENU.test(hay)) score -= 3;
    if (isPdf && year(href) && year(href) < newest - 1) score -= 2;
    if (score > 0 && (found.get(href.href) ?? 0) < score) found.set(href.href, score);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}

// Links to the branch in this restaurant's town, for chains whose homepage just asks
// which restaurant you want (Moka Dining's homepage: "Northwood" or "St. Albans").
const STREET = new Set(['road', 'street', 'lane', 'avenue', 'parade', 'place', 'square', 'court', 'house', 'unit', 'high', 'north', 'south', 'east', 'west', 'upper', 'lower', 'london']);
function branchLinks(page: Page, address: string | null) {
  const towns = (address ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STREET.has(w));
  if (!towns.length) return [];
  const base = new URL(page.url);
  const found: string[] = [];
  for (const m of (page.html ?? '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(m[1], base);
      const hay = `${href.pathname} ${htmlToText(m[2])}`.toLowerCase();
      if (href.hostname === base.hostname && href.href !== base.href && towns.some((t) => hay.includes(t)) && !found.includes(href.href)) found.push(href.href);
    } catch { /* not a link */ }
  }
  return found.slice(0, 1);
}

// Where most restaurant sites keep the menu, for homepages that don't link to it.
const USUAL_MENU_PATHS = ['/menu/', '/menus/', '/food/', '/our-menu/'];

// The page as a browser shows it after its scripts run, as text, via Jina Reader.
// Free without a key (rate limited); JINA_API_KEY raises the limit.
async function getRenderedPage(url: string): Promise<Page | null> {
  if (!(await robotsAllow(new URL(url)))) return null;
  const key = Deno.env.get('JINA_API_KEY');
  const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
    headers: { Accept: 'text/plain', 'X-Timeout': '25', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  }, 35_000).catch(() => null);
  if (!res?.ok) return null;
  const text = (await res.text()).trim();
  return text.length > 200 ? { url, text } : null;
}

// Menu-looking links in rendered text (Jina writes links as [text](url)): on the same
// site, or on another one (a menu app) when the link says it's the menu.
function renderedMenuLinks(page: Page) {
  const base = new URL(page.url);
  const found: string[] = [];
  for (const m of (page.text ?? '').matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    try {
      const href = new URL(m[2]);
      const hay = `${m[1]} ${href.pathname}`;
      const wanted = href.hostname === base.hostname ? /menu|order|food/i.test(hay) : /menu/i.test(hay) && isOwnSite(href.href);
      if (wanted && href.href !== base.href && !found.includes(href.href)) found.push(href.href);
    } catch { /* not a link */ }
  }
  return found.slice(0, 1); // keeps the whole lookup well inside the function time limit
}

// Menu PDFs in rendered text, on the restaurant's own site.
function renderedPdfLinks(page: Page) {
  const base = new URL(page.url);
  const found: string[] = [];
  for (const m of (page.text ?? '').matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+\.pdf)\)/gi)) {
    try {
      const href = new URL(m[2]);
      if (href.hostname === base.hostname && !/policy|terms|allergen/i.test(m[1]) && !found.includes(href.href)) found.push(href.href);
    } catch { /* not a link */ }
  }
  return found;
}

// A PDF downloaded here, for when Claude couldn't fetch it from its link.
async function downloadPdf(url: string): Promise<Page | null> {
  const res = await fetchWithTimeout(url, {}, 20_000).catch(() => null);
  if (!res?.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) return null;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { url, pdf: btoa(bin) };
}

// Long menus are read in pieces, at the same time: asked to list a 40-page-long menu in
// one go, the model skips dishes (Nando's lost its chips and garlic bread that way).
// PDFs are read together in one request; page text is cut into overlapping pieces.
const CHUNK_CHARS = 12_000;
const CHUNK_OVERLAP = 800;

function textChunks(pages: Page[]): Page[] {
  const all = pages.filter((p) => p.text && !p.pdf && !p.pdfUrl)
    .map((p) => `Page: ${p.url}\n\n${p.text}`).join('\n\n').slice(0, MAX_TEXT_CHARS);
  const chunks: Page[] = [];
  for (let start = 0; start < all.length;) {
    let end = Math.min(all.length, start + CHUNK_CHARS);
    if (end < all.length) end = Math.max(all.lastIndexOf('\n', end), start + CHUNK_CHARS / 2);
    chunks.push({ url: pages[0].url, text: all.slice(start, end) });
    if (end >= all.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function readMenu(pages: Page[]): Promise<Menu> {
  const pdfs = pages.filter((p) => p.pdf || p.pdfUrl);
  const groups = [...(pdfs.length ? [pdfs] : []), ...textChunks(pages).map((c) => [c])];
  const menus = await Promise.all(groups.map(readGroup));
  return {
    dishes: menus.flatMap((m) => m.dishes),
    cuisine: menus.find((m) => m.cuisine && m.cuisine !== 'Other')?.cuisine ?? menus.find((m) => m.cuisine)?.cuisine ?? null,
    halal: menus.some((m) => m.halal),
  };
}

async function readGroup(pages: Page[]): Promise<Menu> {
  try {
    return await askClaude(pages);
  } catch (e) {
    if (!pages.some((p) => p.pdfUrl)) throw e;
    console.warn('reading PDFs by link failed, downloading them instead', e);
    const local = await Promise.all(pages.map((p) => p.pdfUrl ? downloadPdf(p.pdfUrl) : p));
    return await askClaude(local.filter((p): p is Page => !!p));
  }
}

async function askClaude(pages: Page[]): Promise<Menu> {
  const content: Anthropic.ContentBlockParam[] = [];
  let chars = 0;
  let pdfChars = 0;
  for (const p of pages) {
    // Keeps the request under the API's 32MB size limit.
    if (p.pdf && pdfChars + p.pdf.length > MAX_PDF_CHARS_TOTAL) continue;
    if (p.pdf) pdfChars += p.pdf.length;
    if (p.pdfUrl) content.push({ type: 'document', source: { type: 'url', url: p.pdfUrl } });
    else if (p.pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.pdf } });
    else if (p.text && chars < MAX_TEXT_CHARS) {
      const text = p.text.slice(0, MAX_TEXT_CHARS - chars);
      chars += text.length;
      content.push({ type: 'text', text: `Page: ${p.url}\n\n${text}` });
    }
  }
  if (!content.length) return NO_MENU;
  content.push({ type: 'text', text: PROMPT });

  // Claude Haiku 5.5: the lowest-cost model, which is plenty for reading a menu.
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: MENU_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') return NO_MENU;
  const text = response.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? (JSON.parse(text.text) as Menu) : NO_MENU;
}

// Files a restaurant under a cuisine from its name and dishes, for menus that came
// from somewhere other than a website read (chains are set by hand, snapped menus).
async function classifyCuisine(name: string, dishes: string[]): Promise<string> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 200,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: CUISINE_SCHEMA } },
    messages: [{ role: 'user', content: `Restaurant: ${name}\nDishes: ${dishes.join('; ')}\n\nWhich cuisine is this restaurant? Use "Other" if none fits.` }],
  });
  const text = response.content.find((b) => b.type === 'text');
  const cuisine = text && text.type === 'text' ? JSON.parse(text.text).cuisine : null;
  return CUISINES.includes(cuisine) ? cuisine : 'Other';
}

// Reads the menu from a website: its menu pages and PDFs, then the homepage, then, if
// that finds little, the pages as a browser shows them. `reachable` is false if nothing loaded.
// Homepages often show just a few "favourites" (Regency Club showed 10 of its dishes and
// kept the real menu on a menu app), so a homepage is never taken as the whole menu
// while a menu page or PDF can be read.
const FEW_DISHES = 25; // fewer than this from the homepage alone: look harder
async function readWebsite(website: string, address: string | null = null): Promise<{ reachable: boolean } & Menu> {
  let home = await getPage(website).catch(() => null);
  const menuPages: Page[] = [];
  const tried = new Set([website]);
  let next = home ? menuLinks(home).map(([href]) => href) : [];
  // Only for a homepage, not a menu page or PDF someone gave us.
  const isHomepage = !!home?.html && new URL(website).pathname.replace(/\/$/, '') === '';
  // A homepage that only asks which restaurant: go to this one's own homepage.
  if (isHomepage && !next.length) {
    for (const link of branchLinks(home!, address)) {
      tried.add(link);
      const branch = await getPage(link).catch(() => null);
      if (branch?.html) { home = branch; next = menuLinks(branch).map(([href]) => href); }
    }
  }
  // Still no link to the menu: try where sites usually keep it.
  if (isHomepage && !next.length) next = USUAL_MENU_PATHS.map((p) => new URL(p, home!.url).href);
  // Follow menu links from the homepage, then one step further, since many sites
  // keep their menus as PDFs on a separate "Menus" page. The second step takes the
  // best-scoring links from all the pages the first step found.
  for (let hop = 0; hop < 2 && next.length; hop++) {
    const found: Scored[] = [];
    for (const link of next) {
      if (tried.has(link) || menuPages.length >= MAX_PAGES - 1) continue;
      tried.add(link);
      let page = await getPage(link).catch(() => null);
      // A guessed address that isn't there often lands back on the homepage.
      if (page && page.url !== link && page.url.replace(/\/$/, '') === home!.url.replace(/\/$/, '')) continue;
      // A menu app that draws its menu with JavaScript arrives as an empty "Loading..." page.
      if (page?.html && (page.text ?? '').length < 300) page = await getRenderedPage(link) ?? page;
      if (!page) continue;
      menuPages.push(page);
      if (page.html) found.push(...menuLinks(page));
    }
    next = found.sort((a, b) => b[1] - a[1]).map(([href]) => href);
  }
  const [fromMenus, fromHome] = await Promise.all([
    menuPages.length ? readMenu(menuPages) : NO_MENU,
    home ? readMenu([home]) : NO_MENU,
  ]);
  let menu = combine(fromMenus, fromHome);

  // Little or nothing found: the menu may be drawn by JavaScript, so read it as a browser sees it.
  let first: Page | null = null;
  if (!fromMenus.dishes.length && menu.dishes.length < FEW_DISHES) {
    const rendered: Page[] = [];
    first = await getRenderedPage(website);
    if (first) {
      rendered.push(first);
      for (const link of renderedMenuLinks(first).filter((u) => !tried.has(u))) {
        const page = await getRenderedPage(link);
        if (!page) continue;
        rendered.push(page);
        // A menu PDF linked from the rendered menu page is read directly.
        for (const pdf of renderedPdfLinks(page).filter((u) => !tried.has(u)).slice(0, 2)) {
          const doc = await getPage(pdf).catch(() => null);
          if (doc) rendered.push(doc);
        }
      }
      const seen = await readMenu(rendered);
      if (cleanDishes(seen.dishes).length > cleanDishes(menu.dishes).length) menu = seen;
    }
  }
  return { reachable: !!(home || first || menuPages.length), ...menu, dishes: cleanDishes(menu.dishes) };
}

// The menu pages' dishes, plus any homepage dishes they don't already list. Menu pages
// come first so their headings win over the homepage's ("Mains", not "Customer Favourites").
function combine(fromMenus: Menu, fromHome: Menu): Menu {
  const extra = fromHome.dishes.filter((h) => !fromMenus.dishes.some((d) => sameDish(d.name, h.name)));
  return {
    dishes: [...fromMenus.dishes, ...extra],
    cuisine: fromMenus.cuisine ?? fromHome.cuisine,
    halal: fromMenus.halal || fromHome.halal,
  };
}

// The same dish written differently: the same words, or (with at least two words) one
// name's words all inside the other's. Mirrors same_dish() in the database.
const FILLER = new Set(['the', 'and', 'with', 'of', 'a', 'our', 'peri', 'piri']);
function dishWords(name: string) {
  return [...new Set(name.toLowerCase().split(/[^a-z0-9/]+/).filter((w) => w && !FILLER.has(w)))];
}
function sameDish(a: string, b: string) {
  const x = dishWords(a), y = dishWords(b);
  const within = (p: string[], q: string[]) => p.every((w) => q.includes(w));
  return (x.length === y.length && within(x, y)) || (Math.min(x.length, y.length) >= 2 && (within(x, y) || within(y, x)));
}

// Tidied names and prices, each dish once. A dish listed twice keeps the main menu's
// entry over a children's menu or no heading (Nando's lists Chips for kids first).
const KIDS = /kid|child|little|nandino|junior/i;
function cleanDishes(dishes: Dish[]): Dish[] {
  const byName = new Map<string, Dish>();
  for (const d of dishes) {
    const name = d.name?.trim().replace(/\s+/g, ' ') ?? '';
    if (name.length < 2 || name.length > 120) continue;
    const price = Number.isInteger(d.price_pence) && d.price_pence! >= 0 ? d.price_pence : null;
    const diets = (d.diets ?? []).filter((x) => DISH_DIETS.includes(x));
    const dish = { name, section: d.section?.trim() || null, price_pence: price, diets };
    const kept = byName.get(name.toLowerCase());
    const worse = (x: Dish) => !x.section || KIDS.test(x.section);
    if (!kept || (worse(kept) && !worse(dish))) byName.set(name.toLowerCase(), kept ? { ...dish, name: kept.name } : dish);
  }
  return [...byName.values()];
}

// Re-reads a chain's menu and updates every branch, at most once a month per chain
// (the Foodalise team, `anytime`, can refresh it whenever they like).
async function refreshChain(admin: SupabaseClient<any>, slug: string, claimRefresh: () => Promise<Response | null>, anytime = false) {
  const due = new Date(Date.now() - REFRESH_EVERY_DAYS * 864e5).toISOString();
  const { data: source } = await admin.from('chain_menu_sources').select('read_at').eq('chain_slug', slug).maybeSingle();
  if (!source) return json({ status: 'no_website', added: 0 });
  if (!anytime && source.read_at && source.read_at > due) return json({ status: 'too_soon', added: 0 });
  const used = await claimRefresh();
  if (used) return used;
  // Claim the chain so two people refreshing branches at once don't both read it.
  let claim = admin.from('chain_menu_sources').update({ status: 'running', read_at: new Date().toISOString() }).eq('chain_slug', slug);
  if (!anytime) claim = claim.or(`read_at.is.null,read_at.lt.${due}`);
  const { data: claimed } = await claim.select('menu_url');
  if (!claimed?.length) return json({ status: 'too_soon', added: 0 });

  const finish = async (status: string, added = 0, found: number | null = null) => {
    // A failed read is tried again after a few days rather than a month.
    const readAt = status === 'done' ? new Date() : new Date(Date.now() - (REFRESH_EVERY_DAYS - CHAIN_RETRY_DAYS) * 864e5);
    await admin.from('chain_menu_sources').update({ status, dishes_found: found, read_at: readAt.toISOString() }).eq('chain_slug', slug);
    return json({ status, added });
  };
  try {
    const { reachable, dishes } = await readWebsite(claimed[0].menu_url);
    if (!reachable) return await finish('unreadable');
    const { count: before } = await admin.from('chain_dishes').select('*', { count: 'exact', head: true }).eq('chain_slug', slug);
    if (!dishes.length || dishes.length < (before ?? 0) * KEEP_IF_FEWER_THAN) return await finish('no_menu', 0, dishes.length);
    const { data: added, error } = await admin.rpc('sync_chain_menu', { slug, items: dishes });
    if (error) throw error;
    return await finish('done', added ?? 0, dishes.length);
  } catch (e) {
    console.error('chain refresh failed', slug, e);
    return await finish('error');
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const { restaurantId, website: typed, refresh: wantsRefresh, cuisine: wantsCuisine, menuLink: typedLink } = await req.json().catch(() => ({}));
  const refresh = wantsRefresh === true || !!typedLink;
  if (typeof restaurantId !== 'string') return json({ error: 'Missing restaurant.' }, 400);
  const given = cleanWebsite(typed);
  if (typed && !given) return json({ status: 'bad_website', added: 0 });
  const menuLink = cleanWebsite(typedLink);
  if (typedLink && !menuLink) return json({ status: 'bad_website', added: 0 });

  const { data: r } = await admin.from('restaurants')
    .select('id, name, address, postcode, latitude, longitude, website, menu_source, chain_slug, menu_checked_at, cuisine').eq('id', restaurantId).single();
  if (!r) return json({ error: 'Restaurant not found.' }, 404);

  // { cuisine: true }: file a restaurant that has dishes but no cuisine yet.
  if (wantsCuisine === true) {
    if (r.cuisine) return json({ status: 'done', cuisine: r.cuisine });
    const { data: dishes } = await admin.from('dishes').select('name').eq('restaurant_id', r.id).eq('on_menu', true).limit(150);
    if (!dishes?.length) return json({ status: 'no_menu', cuisine: null });
    try {
      const cuisine = await classifyCuisine(r.name, dishes.map((d) => d.name));
      await admin.from('restaurants').update({ cuisine }).eq('id', r.id).is('cuisine', null);
      return json({ status: 'done', cuisine });
    } catch (e) {
      console.error('cuisine failed', r.id, e);
      return json({ status: 'error', cuisine: null });
    }
  }

  // The Foodalise team (the admins table) can refresh any menu as often as they like:
  // no once-a-month wait, no one-refresh-each, no daily limit on refreshes.
  const { data: team } = refresh ? await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle() : { data: null };
  const anytime = !!team;
  if (menuLink && !anytime) return json({ error: 'Only the Foodalise team can do that.' }, 403);

  // Each diner gets one "Refresh menu" per restaurant. Only used up once a read actually starts.
  const claimRefresh = async () => {
    if (!refresh || anytime) return null;
    const { error } = await admin.from('menu_refreshes').insert({ user_id: user.id, restaurant_id: r.id });
    return error ? json({ status: 'already_refreshed', added: 0 }) : null;
  };

  // A chain branch gets the chain's menu, unless a diner typed in a website for it.
  // It's only read when a diner asks for a refresh, or the branch has no menu at all.
  if (r.chain_slug && !given && !menuLink) {
    if (!refresh && r.menu_source !== 'none') return json({ status: 'done', added: 0 });
    return await refreshChain(admin, r.chain_slug, claimRefresh, anytime);
  }

  const { data: last } = await admin.from('menu_fetches').select('status, attempted_at, dishes_added').eq('restaurant_id', r.id).maybeSingle();
  if (refresh) {
    // Each restaurant's menu can be refreshed at most once a month.
    const lastRead = r.menu_checked_at ?? (last?.status === 'done' ? last.attempted_at : null);
    if (!anytime && lastRead && Date.now() - new Date(lastRead).getTime() < REFRESH_EVERY_DAYS * 864e5) return json({ status: 'too_soon', added: 0 });
    if (!r.website && !menuLink) return json({ status: 'no_website', added: 0 });
    const used = await claimRefresh();
    if (used) return used;
  } else if (last && !given && Date.now() - new Date(last.attempted_at).getTime() < (RETRY_AFTER_DAYS[last.status] ?? 1) * 864e5) {
    // Each restaurant is tried again only after a wait, whoever opens it. This is also
    // how the app finds out how a background read went.
    return json({ status: last.status, added: last.status === 'done' ? last.dishes_added ?? 0 : 0 });
  }
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await admin.from('menu_fetches').select('*', { count: 'exact', head: true })
    .eq('requested_by', user.id).gte('attempted_at', since);
  if (!anytime && (count ?? 0) >= DAILY_LIMIT) return json({ status: 'limit', added: 0 });

  await admin.from('menu_fetches').upsert({ restaurant_id: r.id, requested_by: user.id, status: 'running', attempted_at: new Date().toISOString(), dishes_added: 0 });
  const finish = async (status: string, added = 0, website: string | null = null) => {
    await admin.from('menu_fetches').update({ status, dishes_added: added, website }).eq('restaurant_id', r.id);
  };

  EdgeRuntime.waitUntil(readRestaurant(admin, r, given, finish, menuLink));
  return json({ status: 'running', added: 0 });
});

type RestaurantRow = {
  id: string; name: string; address: string | null; postcode: string | null; latitude: number | null; longitude: number | null;
  website: string | null; menu_source: string; cuisine: string | null;
};

// Finds the restaurant's website, reads its menu and brings its dishes up to date.
async function readRestaurant(admin: SupabaseClient<any>, r: RestaurantRow, given: string | null,
  finish: (status: string, added?: number, website?: string | null) => Promise<void>, menuLink: string | null = null) {
  try {
    // A menu link from the team is read in place of the website, and isn't saved as it.
    if (menuLink) {
      const read = await readWebsite(menuLink, r.address);
      if (!read.reachable) return await finish('unreadable', 0, r.website);
      return await saveMenu(admin, r, read, r.website, finish);
    }
    let website: string | null = given ?? r.website;
    if (!website && r.latitude != null && r.longitude != null) website = await websiteFromOsm(r.name, r.latitude, r.longitude);
    let fromGoogle = false;
    if (!website) {
      website = await websiteFromGoogle(admin, r.name, r.postcode, r.latitude, r.longitude);
      fromGoogle = !!website;
    }
    if (!website) website = await websiteFromSearch(admin, r.name, r.address, r.postcode);
    if (!website) return await finish('no_website');
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;

    const read = await readWebsite(website, r.address);
    // Never stored when it came from Google (see the note at the top).
    const keep = fromGoogle ? null : website;
    if (!read.reachable) return await finish('unreadable', 0, keep);
    return await saveMenu(admin, r, read, keep, finish);
  } catch (e) {
    console.error('fetch-menu failed', r.id, e);
    return await finish('error');
  }
}

// Brings the restaurant's dishes up to date with a menu just read; `keep` is the website to remember.
async function saveMenu(admin: SupabaseClient<any>, r: RestaurantRow, { dishes, cuisine, halal }: Menu, keep: string | null,
  finish: (status: string, added?: number, website?: string | null) => Promise<void>) {
  try {
    let { data: existing } = await admin.from('dishes').select('id, name, section, price_pence, source, on_menu, diets, review_count').eq('restaurant_id', r.id);
    const fromSite = (existing ?? []).filter((d) => d.source === 'website');
    // Too few dishes compared with last time: probably a half-loaded page, so keep the menu we have.
    if (!dishes.length || dishes.length < fromSite.filter((d) => d.on_menu).length * KEEP_IF_FEWER_THAN) {
      return await finish('no_menu', 0, keep);
    }

    // Dishes already listed: show the ones still on the menu (with today's section and
    // price), hide the website ones that have gone. Diners' own additions are left alone.
    const byName = new Map(dishes.map((d) => [d.name.toLowerCase(), d]));
    // A dish written a little differently now ("Chicken Wings (5)" / "5 Chicken Wings")
    // takes the new name, so its reviews carry on; an unreviewed copy under that name goes.
    let renamed = false;
    for (const d of fromSite.filter((x) => !byName.has(x.name.toLowerCase())).sort((a, b) => b.review_count - a.review_count)) {
      const match = dishes.find((n) => sameDish(n.name, d.name)
        && !(existing ?? []).some((x) => x.id !== d.id && x.review_count > 0 && x.name.toLowerCase() === n.name.toLowerCase()));
      if (!match) continue;
      const copies = (existing ?? []).filter((x) => x.id !== d.id && x.name.toLowerCase() === match.name.toLowerCase()).map((x) => x.id);
      if (copies.length) await admin.from('dishes').delete().in('id', copies);
      const { error } = await admin.from('dishes').update({ name: match.name }).eq('id', d.id);
      if (!error) renamed = true;
    }
    if (renamed) {
      ({ data: existing } = await admin.from('dishes').select('id, name, section, price_pence, source, on_menu, diets, review_count').eq('restaurant_id', r.id));
    }
    // Gone from the menu: hidden, unless people have reviewed it.
    const gone = (existing ?? []).filter((d) => d.source === 'website' && d.on_menu && d.review_count === 0 && !byName.has(d.name.toLowerCase())).map((d) => d.id);
    if (gone.length) await admin.from('dishes').update({ on_menu: false }).in('id', gone);
    for (const d of existing ?? []) {
      const now = byName.get(d.name.toLowerCase());
      if (!now) continue;
      const price = now.price_pence ?? d.price_pence;
      const diets = now.diets.length ? now.diets : d.diets;
      if (!d.on_menu || now.section !== d.section || price !== d.price_pence || diets.join() !== d.diets.join()) {
        await admin.from('dishes').update({ on_menu: true, section: now.section, price_pence: price, diets }).eq('id', d.id);
      }
    }
    const known = new Set((existing ?? []).map((d) => d.name.toLowerCase()));
    const rows = dishes.filter((d) => !known.has(d.name.toLowerCase()))
      .map((d) => ({ restaurant_id: r.id, name: d.name, section: d.section, price_pence: d.price_pence, diets: d.diets, source: 'website' }));
    if (rows.length) {
      const { error } = await admin.from('dishes').insert(rows);
      if (error) throw error;
    }

    // Only remember the website once a menu was actually read from it.
    const update: Record<string, string | string[]> = { menu_checked_at: new Date().toISOString() };
    if (keep && keep !== r.website) update.website = keep;
    if (!r.cuisine) update.cuisine = cuisine ?? await classifyCuisine(r.name, dishes.map((d) => d.name)).catch(() => 'Other');
    if (halal) {
      const { data: now } = await admin.from('restaurants').select('diets').eq('id', r.id).single();
      update.diets = [...new Set([...(now?.diets ?? []), 'halal'])];
    }
    if (r.menu_source === 'none' || r.menu_source === 'users') update.menu_source = 'website';
    await admin.from('restaurants').update(update).eq('id', r.id);
    return await finish('done', rows.length, keep);
  } catch (e) {
    console.error('fetch-menu failed', r.id, e);
    return await finish('error');
  }
}
