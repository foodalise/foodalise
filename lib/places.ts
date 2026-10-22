import { supabase } from '@/lib/supabase';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type MapRestaurant = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number;
  longitude: number;
  cuisine: string | null;
  price_level: number | null;
  diets: string[];
  rating: number | null;
  reviews: number;
};

// What the map shows. Empty lists and a null rating mean "any".
export type MapFilters = { cuisines: string[]; minRating: number | null; prices: number[]; diets: string[] };
export const NO_FILTERS: MapFilters = { cuisines: [], minRating: null, prices: [], diets: [] };

type Row = Omit<MapRestaurant, 'rating' | 'reviews'> & { dishes: { review_count: number; avg_rating: number | null }[] };

// Central London, used until we know where the user is.
export const LONDON: Region = { latitude: 51.5115, longitude: -0.13, latitudeDelta: 0.04, longitudeDelta: 0.04 };

// Most pins the map draws at once; more than this gets slow on a phone.
const MAP_LIMIT = 300;

// Restaurants inside the visible part of the map that match the filters, scored by
// the average of every review across their dishes. `more` is true when the area
// holds more than the map can draw, so the app can ask you to zoom in.
export async function restaurantsIn(region: Region, filters: MapFilters = NO_FILTERS) {
  const { latitude: lat, longitude: lng, latitudeDelta: dLat, longitudeDelta: dLng } = region;
  let query = supabase.from('restaurants')
    .select('id, name, address, postcode, latitude, longitude, cuisine, price_level, diets, dishes(review_count, avg_rating)')
    .gte('latitude', lat - dLat / 2).lte('latitude', lat + dLat / 2)
    .gte('longitude', lng - dLng / 2).lte('longitude', lng + dLng / 2);
  if (filters.cuisines.length) query = query.in('cuisine', filters.cuisines);
  if (filters.prices.length) query = query.in('price_level', filters.prices);
  if (filters.diets.length) query = query.contains('diets', filters.diets);
  const limit = filters.minRating != null ? MAP_LIMIT * 2 : MAP_LIMIT;
  const { data, error } = await query.limit(limit).returns<Row[]>();
  if (error) throw error;
  const places = (data ?? []).map(({ dishes, ...r }): MapRestaurant => {
    const reviews = dishes.reduce((n, d) => n + d.review_count, 0);
    const total = dishes.reduce((s, d) => s + (d.avg_rating ?? 0) * d.review_count, 0);
    return { ...r, reviews, rating: reviews ? total / reviews : null };
  }).filter((r) => filters.minRating == null || (r.rating != null && r.rating >= filters.minRating));
  return { places, more: (data ?? []).length >= limit };
}

// The FSA places every business at its postcode's centre, so places sharing a
// postcode (a parade of shops, a food court) sit on exactly the same spot. The map
// shows one pin per spot, and the card lets you swipe through everyone there.
export function spotKey(r: { latitude: number; longitude: number }) {
  return `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`; // within about 10m
}

// Everyone at the same spot as `r`: reviewed places first, then A to Z.
export function spotmates(restaurants: MapRestaurant[], r: MapRestaurant) {
  const key = spotKey(r);
  return restaurants.filter((x) => spotKey(x) === key)
    .sort((a, b) => b.reviews - a.reviews || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));
}

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1)} km`;
}

export type NearbyRestaurant = { id: string; name: string; address: string | null; km: number };

// The closest restaurants to a point, nearest first. Looks within about 400m,
// then widens to 2km if that finds too few.
export async function restaurantsNear(here: { latitude: number; longitude: number }, count = 8) {
  for (const km of [0.4, 2]) {
    const dLat = km / 111;
    const dLng = km / (111 * Math.cos((here.latitude * Math.PI) / 180));
    const { data, error } = await supabase.from('restaurants')
      .select('id, name, address, latitude, longitude')
      .gte('latitude', here.latitude - dLat).lte('latitude', here.latitude + dLat)
      .gte('longitude', here.longitude - dLng).lte('longitude', here.longitude + dLng)
      .limit(300);
    if (error) throw error;
    const near = (data ?? [])
      .map((r): NearbyRestaurant => ({ id: r.id, name: r.name, address: r.address, km: distanceKm(here, r as { latitude: number; longitude: number }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, count);
    if (near.length >= 3 || km === 2) return near;
  }
  return [];
}

// One food photo per restaurant (its most liked), for photo pins on the map.
export async function coverPhotos(restaurantIds: string[]) {
  const covers: Record<string, string> = {};
  if (!restaurantIds.length) return covers;
  const { data } = await supabase.from('reviews')
    .select('like_count, review_photos(storage_path, position), dishes!inner(restaurant_id)')
    .in('dishes.restaurant_id', restaurantIds).order('like_count', { ascending: false }).limit(400)
    .returns<{ review_photos: { storage_path: string; position: number }[]; dishes: { restaurant_id: string } }[]>();
  for (const r of data ?? []) {
    const id = r.dishes.restaurant_id;
    const photo = [...r.review_photos].sort((a, b) => a.position - b.position)[0];
    if (photo && !covers[id]) covers[id] = photo.storage_path;
  }
  return covers;
}
