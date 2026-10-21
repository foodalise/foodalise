// Finds a restaurant's own website, reads the menu on it with Claude, and adds the
// dishes to the restaurant in Foodalise. The app calls this when someone opens a
// restaurant that has no menu, or whose menu is due a refresh:
// - Chains: the chain's menu page (chain_menu_sources) is read at most once a month
//   and copied to every branch, so one read updates them all.
// - Independents: a website menu is re-read every two months.
// Dishes that have dropped off a menu are hidden (on_menu = false), never deleted.
// A re-read that finds far fewer dishes than before is ignored, in case the site was
// half-loaded.
//
//   POST { restaurantId: string, website?: string } -> { status: string, added: number }
//   website: the restaurant's site, typed in by a diner when we couldn't find it.
//
// Websites come from OpenStreetMap (free), then (only if SEARCH_MONTHLY_CAP > 0) a web search by Claude (about 1p
// each, capped per month). If GOOGLE_PLACES_API_KEY is set, Google Places is tried
// last, capped to stay inside Google's free monthly allowance.
// Sites that build their menu with JavaScript after loading (Square Online, Wix and
// other ordering sites) arrive empty, so if the plain read finds no dishes, the page
// is read again through Jina Reader (free), which loads it in a real browser first.
// Secrets: ANTHROPIC_API_KEY (required), GOOGLE_PLACES_API_KEY and JINA_API_KEY (optional).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// How long before a restaurant is tried again, by what happened last time.
const RETRY_AFTER_DAYS: Record<string, number> = { done: 60, no_menu: 30, no_website: 14, unreadable: 7, error: 1, running: 0.01 };
const DAILY_LIMIT = 30; // restaurants one person can trigger a day
const GOOGLE_FREE_MONTHLY = 950; // Google gives 1,000 free website lookups a month; stay under it
const SEARCH_MONTHLY_CAP = 0; // web searches a month, about 1p each; 0 keeps it free (Jay's choice)
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// Listing and delivery sites aren't the restaurant's own website.
const NOT_OWN_SITE = ['deliveroo.co.uk', 'ubereats.com', 'just-eat.co.uk', 'tripadvisor.co.uk', 'tripadvisor.com', 'facebook.com', 'instagram.com', 'google.com', 'yelp.co.uk', 'yelp.com', 'opentable.co.uk', 'opentable.com', 'thefork.co.uk', 'tiktok.com', 'x.com', 'twitter.com', 'foodhygiene.food.gov.uk', 'ratings.food.gov.uk', 'restaurantguru.com', 'menulist.menu', 'sirved.com', 'hungryhouse.co.uk', 'yell.com', 'squaremeal.co.uk', 'timeout.com'];
const USER_AGENT = 'FoodaliseMenuReader/1.0 (reads public restaurant menus)';
const MAX_TEXT_CHARS = 80_000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PDF_CHARS_TOTAL = 24_000_000;
const MAX_PAGES = 5; // homepage plus up to four menu pages or PDFs
const CHAIN_REFRESH_DAYS = 30;
const CHAIN_RETRY_DAYS = 3;
const KEEP_IF_FEWER_THAN = 0.5; // a re-read must find at least half as many dishes as before

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

const PROMPT = `Above are pages from a restaurant's own website. List every dish or drink on its current menu.
- name: the dish name as printed, in normal capitalisation (e.g. "Chicken Katsu Curry", not "CHICKEN KATSU CURRY"). Leave out descriptions and ingredients.
- section: the menu heading it sits under (e.g. "Starters", "Mains"), or null if there is none.
- price_pence: the price in pence (£12.50 -> 1250), or null if no price is shown. If there are several sizes, use the smallest.
Only include things a customer can order. Ignore opening times, events, allergy notes and navigation text.
If the pages don't contain a menu, return an empty list.`;

type Dish = { section: string | null; name: string; price_pence: number | null };
type Page = { url: string; text?: string; pdf?: string; html?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// "DISHOOM LTD" and "Dishoom Covent Garden" -> comparable word sets.
const STOP = new Set(['the', 'ltd', 'limited', 'restaurant', 'restaurants', 'cafe', 'and', 'bar', 'kitchen', 'co', 'plc', 'uk', 'london']);
function words(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
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

// About 1p: Claude Haiku searches the web for the restaurant's own website.
async function websiteFromSearch(admin: SupabaseClient<any>, name: string, address: string | null, postcode: string | null) {
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
  const url = text.match(/https?:\/\/[^\s)"'<>\]]+/i)?.[0] ?? text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:co\.uk|com|uk|london|net|org|restaurant|cafe)\b[^\s)"'<>\]]*/i)?.[0];
  return url && isOwnSite(url) ? url.replace(/[.,]+$/, '') : null;
}

// Optional fallback, capped below Google's free monthly allowance so it never bills.
async function websiteFromGoogle(admin: SupabaseClient<any>, name: string, postcode: string | null, lat: number | null, lng: number | null) {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return null;
  if (!(await underMonthlyCap(admin, new Date().toISOString().slice(0, 7), GOOGLE_FREE_MONTHLY))) return null;

  const res = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.websiteUri' },
    body: JSON.stringify({
      textQuery: [name, postcode].filter(Boolean).join(' '),
      maxResultCount: 1,
      ...(lat != null && lng != null ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 200 } } } : {}),
    }),
  });
  if (!res.ok) return null;
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

// Links on the homepage that look like the menu, best first.
function menuLinks(page: Page) {
  const base = new URL(page.url);
  const found = new Map<string, number>();
  for (const m of (page.html ?? '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href: URL;
    try { href = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(href.protocol)) continue;
    const isPdf = href.pathname.toLowerCase().endsWith('.pdf');
    if (href.hostname !== base.hostname && !isPdf) continue;
    const hay = `${href.pathname} ${htmlToText(m[2])}`.toLowerCase();
    let score = /menu/.test(hay) ? 3 : 0;
    if (/food|eat|dinner|lunch|brunch|drinks/.test(hay)) score += 1;
    if (score && isPdf) score += 1;
    if (score && !found.has(href.href)) found.set(href.href, score);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([href]) => href);
}

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

// Menu-looking links in rendered text (Jina writes links as [text](url)).
function renderedMenuLinks(page: Page) {
  const base = new URL(page.url);
  const found: string[] = [];
  for (const m of (page.text ?? '').matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    try {
      const href = new URL(m[2]);
      if (href.hostname === base.hostname && /menu|order|food/i.test(`${m[1]} ${href.pathname}`) && href.href !== base.href && !found.includes(href.href)) found.push(href.href);
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

async function readMenu(pages: Page[]): Promise<Dish[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  let chars = 0;
  let pdfChars = 0;
  for (const p of pages) {
    // Keeps the request under the API's 32MB size limit.
    if (p.pdf && pdfChars + p.pdf.length > MAX_PDF_CHARS_TOTAL) continue;
    if (p.pdf) pdfChars += p.pdf.length;
    if (p.pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.pdf } });
    else if (p.text && chars < MAX_TEXT_CHARS) {
      const text = p.text.slice(0, MAX_TEXT_CHARS - chars);
      chars += text.length;
      content.push({ type: 'text', text: `Page: ${p.url}\n\n${text}` });
    }
  }
  if (!content.length) return [];
  content.push({ type: 'text', text: PROMPT });

  // Claude Haiku 5.5: the lowest-cost model, which is plenty for reading a menu.
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: MENU_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') return [];
  const text = response.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? (JSON.parse(text.text).dishes as Dish[]) : [];
}

// Reads the menu from a website: the page itself and its menu links, then, if that
// finds nothing, the page as a browser shows it. `reachable` is false if neither loaded.
async function readWebsite(website: string): Promise<{ reachable: boolean; dishes: Dish[] }> {
  const home = await getPage(website).catch(() => null);
  const pages = home ? [home] : [];
  const tried = new Set([website]);
  // Follow menu links from the homepage, then one step further, since many sites
  // keep their menus as PDFs on a separate "Menus" page.
  let next = home ? menuLinks(home) : [];
  for (let hop = 0; hop < 2 && next.length; hop++) {
    const found: string[] = [];
    for (const link of next) {
      if (tried.has(link) || pages.length >= MAX_PAGES) continue;
      tried.add(link);
      const page = await getPage(link).catch(() => null);
      if (!page) continue;
      pages.push(page);
      if (page.html) found.push(...menuLinks(page));
    }
    next = found;
  }
  let dishes = pages.length ? await readMenu(pages) : [];

  // Nothing found: the menu may be drawn by JavaScript, so read it as a browser sees it.
  let first: Page | null = null;
  if (!dishes.length) {
    const rendered: Page[] = [];
    first = await getRenderedPage(website);
    if (first) {
      rendered.push(first);
      for (const link of renderedMenuLinks(first)) {
        const page = await getRenderedPage(link);
        if (!page) continue;
        rendered.push(page);
        // A menu PDF linked from the rendered menu page is read directly.
        for (const pdf of renderedPdfLinks(page).filter((u) => !tried.has(u)).slice(0, 2)) {
          const doc = await getPage(pdf).catch(() => null);
          if (doc) rendered.push(doc);
        }
      }
      dishes = await readMenu(rendered);
    }
  }
  return { reachable: !!(home || first), dishes: cleanDishes(dishes) };
}

// Tidied names and prices, each dish once.
function cleanDishes(dishes: Dish[]): Dish[] {
  const seen = new Set<string>();
  const out: Dish[] = [];
  for (const d of dishes) {
    const name = d.name?.trim().replace(/\s+/g, ' ') ?? '';
    if (name.length < 2 || name.length > 120 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const price = Number.isInteger(d.price_pence) && d.price_pence! >= 0 ? d.price_pence : null;
    out.push({ name, section: d.section?.trim() || null, price_pence: price });
  }
  return out;
}

// Re-reads a chain's menu if it's due, and updates every branch. One read a month per chain.
async function refreshChain(admin: SupabaseClient<any>, slug: string) {
  const due = new Date(Date.now() - CHAIN_REFRESH_DAYS * 864e5).toISOString();
  // Claim the chain so two people opening branches at once don't both read it.
  const { data: claimed } = await admin.from('chain_menu_sources')
    .update({ status: 'running', read_at: new Date().toISOString() })
    .eq('chain_slug', slug).or(`read_at.is.null,read_at.lt.${due}`).select('menu_url');
  if (!claimed?.length) return json({ status: 'fresh', added: 0 });

  const finish = async (status: string, added = 0, found: number | null = null) => {
    // A failed read is tried again after a few days rather than a month.
    const readAt = status === 'done' ? new Date() : new Date(Date.now() - (CHAIN_REFRESH_DAYS - CHAIN_RETRY_DAYS) * 864e5);
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

  const { restaurantId, website: typed } = await req.json().catch(() => ({}));
  if (typeof restaurantId !== 'string') return json({ error: 'Missing restaurant.' }, 400);
  const given = cleanWebsite(typed);
  if (typed && !given) return json({ status: 'bad_website', added: 0 });

  const { data: r } = await admin.from('restaurants')
    .select('id, name, address, postcode, latitude, longitude, website, menu_source, chain_slug').eq('id', restaurantId).single();
  if (!r) return json({ error: 'Restaurant not found.' }, 404);

  // A chain branch gets the chain's menu, unless a diner typed in a website for it.
  if (r.chain_slug && !given) return await refreshChain(admin, r.chain_slug);

  // Each restaurant is tried again only after a wait, whoever opens it.
  const { data: last } = await admin.from('menu_fetches').select('status, attempted_at').eq('restaurant_id', r.id).maybeSingle();
  if (last && !given && Date.now() - new Date(last.attempted_at).getTime() < (RETRY_AFTER_DAYS[last.status] ?? 1) * 864e5) {
    return json({ status: last.status, added: 0 });
  }
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await admin.from('menu_fetches').select('*', { count: 'exact', head: true })
    .eq('requested_by', user.id).gte('attempted_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ status: 'limit', added: 0 });

  await admin.from('menu_fetches').upsert({ restaurant_id: r.id, requested_by: user.id, status: 'running', attempted_at: new Date().toISOString(), dishes_added: 0 });
  const finish = async (status: string, added = 0, website: string | null = null) => {
    await admin.from('menu_fetches').update({ status, dishes_added: added, website }).eq('restaurant_id', r.id);
    return json({ status, added });
  };

  try {
    let website: string | null = given ?? r.website;
    if (!website && r.latitude != null && r.longitude != null) website = await websiteFromOsm(r.name, r.latitude, r.longitude);
    if (!website) website = await websiteFromSearch(admin, r.name, r.address, r.postcode);
    if (!website) website = await websiteFromGoogle(admin, r.name, r.postcode, r.latitude, r.longitude);
    if (!website) return await finish('no_website');
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;

    const { reachable, dishes } = await readWebsite(website);
    if (!reachable) return await finish('unreadable', 0, website);

    const { data: existing } = await admin.from('dishes').select('id, name, section, price_pence, source, on_menu').eq('restaurant_id', r.id);
    const fromSite = (existing ?? []).filter((d) => d.source === 'website');
    // Too few dishes compared with last time: probably a half-loaded page, so keep the menu we have.
    if (!dishes.length || dishes.length < fromSite.filter((d) => d.on_menu).length * KEEP_IF_FEWER_THAN) {
      return await finish('no_menu', 0, website);
    }

    // Dishes already listed: show the ones still on the menu (with today's section and
    // price), hide the website ones that have gone. Diners' own additions are left alone.
    const byName = new Map(dishes.map((d) => [d.name.toLowerCase(), d]));
    const gone = fromSite.filter((d) => d.on_menu && !byName.has(d.name.toLowerCase())).map((d) => d.id);
    if (gone.length) await admin.from('dishes').update({ on_menu: false }).in('id', gone);
    for (const d of existing ?? []) {
      const now = byName.get(d.name.toLowerCase());
      if (!now) continue;
      const price = now.price_pence ?? d.price_pence;
      if (!d.on_menu || now.section !== d.section || price !== d.price_pence) {
        await admin.from('dishes').update({ on_menu: true, section: now.section, price_pence: price }).eq('id', d.id);
      }
    }
    const known = new Set((existing ?? []).map((d) => d.name.toLowerCase()));
    const rows = dishes.filter((d) => !known.has(d.name.toLowerCase()))
      .map((d) => ({ restaurant_id: r.id, name: d.name, section: d.section, price_pence: d.price_pence, source: 'website' }));
    if (rows.length) {
      const { error } = await admin.from('dishes').insert(rows);
      if (error) throw error;
    }

    // Only remember the website once a menu was actually read from it.
    const update: Record<string, string> = { menu_checked_at: new Date().toISOString() };
    if (website !== r.website) update.website = website;
    if (r.menu_source === 'none' || r.menu_source === 'users') update.menu_source = 'website';
    await admin.from('restaurants').update(update).eq('id', r.id);
    return await finish('done', rows.length, website);
  } catch (e) {
    console.error('fetch-menu failed', r.id, e);
    return await finish('error');
  }
});
