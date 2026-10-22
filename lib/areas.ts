// Finds UK areas, towns and postcodes for the map search ("Soho", "Brighton",
// "EN4", "W1D 3QF"), using postcodes.io: free, no key, Ordnance Survey and ONS
// open data. Only the words typed into the search are sent.
const API = 'https://api.postcodes.io';

export type Area = { key: string; name: string; detail: string; latitude: number; longitude: number; delta: number };

type Place = {
  code: string; name_1: string; local_type: string; latitude: number; longitude: number;
  county_unitary: string | null; district_borough: string | null; region: string | null; country: string;
};

// How much map to show for each kind of place, in degrees: a city needs more room than a village.
const ZOOM: Record<string, number> = { City: 0.15, Town: 0.07, 'Suburban Area': 0.03, Village: 0.03, Hamlet: 0.02, 'Other Settlement': 0.02 };
const RANK = ['City', 'Town', 'Suburban Area', 'Village', 'Hamlet', 'Other Settlement'];
const LABEL: Record<string, string> = { 'Suburban Area': 'Area', 'Other Settlement': 'Place' };

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

async function get<T>(path: string): Promise<T | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 4000);
  try {
    const res = await fetch(API + path, { signal: abort.signal });
    if (!res.ok) return null;
    return (await res.json()).result as T;
  } catch {
    return null; // offline or slow: the search still shows restaurants and dishes
  } finally {
    clearTimeout(timer);
  }
}

export async function searchAreas(term: string): Promise<Area[]> {
  const q = term.trim();
  if (FULL_POSTCODE.test(q)) {
    const p = await get<{ postcode: string; latitude: number | null; longitude: number | null; admin_district: string | null }>(`/postcodes/${encodeURIComponent(q)}`);
    return p?.latitude != null && p.longitude != null
      ? [{ key: `pc${p.postcode}`, name: p.postcode, detail: ['Postcode', p.admin_district].filter(Boolean).join(' · '), latitude: p.latitude, longitude: p.longitude, delta: 0.01 }]
      : [];
  }
  const [district, places] = await Promise.all([
    OUTCODE.test(q) ? get<{ outcode: string; latitude: number | null; longitude: number | null; admin_district: string[] | null }>(`/outcodes/${encodeURIComponent(q)}`) : null,
    get<Place[]>(`/places?q=${encodeURIComponent(q)}&limit=20`),
  ]);
  const areas: Area[] = [];
  if (district?.latitude != null && district.longitude != null) {
    areas.push({ key: `oc${district.outcode}`, name: district.outcode, detail: ['Postcode area', district.admin_district?.[0]].filter(Boolean).join(' · '), latitude: district.latitude, longitude: district.longitude, delta: 0.03 });
  }
  const lower = q.toLowerCase();
  const seen = new Set<string>();
  const sorted = (places ?? [])
    .filter((p) => ZOOM[p.local_type] && p.latitude != null)
    // Exact names first ("Soho" before "Soho Road"), then cities before towns before villages.
    .sort((a, b) => Number(b.name_1.toLowerCase() === lower) - Number(a.name_1.toLowerCase() === lower) || RANK.indexOf(a.local_type) - RANK.indexOf(b.local_type));
  for (const p of sorted) {
    const where = p.district_borough ?? p.county_unitary ?? p.region ?? p.country;
    const id = `${p.name_1}|${where}`;
    if (seen.has(id)) continue;
    seen.add(id);
    areas.push({ key: `pl${p.code}`, name: p.name_1, detail: [LABEL[p.local_type] ?? p.local_type, where].filter(Boolean).join(' · '), latitude: p.latitude, longitude: p.longitude, delta: ZOOM[p.local_type] });
    if (areas.length >= 3) break;
  }
  return areas;
}
