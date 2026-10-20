import { supabase } from '@/lib/supabase';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type MapRestaurant = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviews: number;
};

type Row = Omit<MapRestaurant, 'rating' | 'reviews'> & { dishes: { review_count: number; avg_rating: number | null }[] };

// Central London, used until we know where the user is.
export const LONDON: Region = { latitude: 51.5115, longitude: -0.13, latitudeDelta: 0.04, longitudeDelta: 0.04 };

// Restaurants inside the visible part of the map, scored by the average of
// every review across their dishes.
export async function restaurantsIn(region: Region) {
  const { latitude: lat, longitude: lng, latitudeDelta: dLat, longitudeDelta: dLng } = region;
  const { data, error } = await supabase.from('restaurants')
    .select('id, name, address, postcode, latitude, longitude, dishes(review_count, avg_rating)')
    .gte('latitude', lat - dLat / 2).lte('latitude', lat + dLat / 2)
    .gte('longitude', lng - dLng / 2).lte('longitude', lng + dLng / 2)
    .limit(200)
    .returns<Row[]>();
  if (error) throw error;
  return (data ?? []).map(({ dishes, ...r }): MapRestaurant => {
    const reviews = dishes.reduce((n, d) => n + d.review_count, 0);
    const total = dishes.reduce((s, d) => s + (d.avg_rating ?? 0) * d.review_count, 0);
    return { ...r, reviews, rating: reviews ? total / reviews : null };
  });
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
