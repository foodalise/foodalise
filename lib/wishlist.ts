import { supabase } from '@/lib/supabase';

type WishRestaurant = { id: string; name: string; cuisine: string | null; latitude: number | null; longitude: number | null };

export type WishDish = {
  dish_id: string;
  created_at: string;
  dishes: {
    id: string; name: string; avg_rating: number | null; review_count: number;
    restaurants: WishRestaurant | null;
  } | null;
};

// One restaurant on your list, with any dishes you've picked there.
export type WishPlace = {
  restaurant: WishRestaurant;
  dishes: NonNullable<WishDish['dishes']>[];
  savedAt: string;
};

const RESTAURANT_FIELDS = 'id, name, cuisine, latitude, longitude';

// Everything you want to try, grouped by restaurant, most recently saved first.
// Saving a dish puts its restaurant on the list too.
export async function loadWishlist(): Promise<WishPlace[]> {
  const [dishes, places] = await Promise.all([
    supabase.from('wishlist')
      .select(`dish_id, created_at, dishes(id, name, avg_rating, review_count, restaurants(${RESTAURANT_FIELDS}))`)
      .order('created_at', { ascending: false })
      .returns<WishDish[]>(),
    supabase.from('restaurant_wishlist')
      .select(`created_at, restaurants(${RESTAURANT_FIELDS})`)
      .order('created_at', { ascending: false })
      .returns<{ created_at: string; restaurants: WishRestaurant | null }[]>(),
  ]);
  const byId = new Map<string, WishPlace>();
  const add = (r: WishRestaurant, at: string) => {
    const place = byId.get(r.id) ?? { restaurant: r, dishes: [], savedAt: at };
    if (at > place.savedAt) place.savedAt = at;
    byId.set(r.id, place);
    return place;
  };
  for (const p of places.data ?? []) if (p.restaurants) add(p.restaurants, p.created_at);
  for (const w of dishes.data ?? []) {
    const r = w.dishes?.restaurants;
    if (r && w.dishes) add(r, w.created_at).dishes.push(w.dishes);
  }
  return [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function isWanted(dishId: string) {
  const { count } = await supabase.from('wishlist').select('*', { count: 'exact', head: true }).eq('dish_id', dishId);
  return (count ?? 0) > 0;
}

export async function setWanted(userId: string, dishId: string, want: boolean) {
  const { error } = want
    ? await supabase.from('wishlist').upsert({ user_id: userId, dish_id: dishId }, { ignoreDuplicates: true })
    : await supabase.from('wishlist').delete().eq('user_id', userId).eq('dish_id', dishId);
  if (error) throw new Error("Couldn't update your wishlist. Check your connection and try again.");
}

// Whether a restaurant is on your list: saved itself, and how many of its dishes you've saved.
export async function restaurantWanted(restaurantId: string) {
  const [place, dishes] = await Promise.all([
    supabase.from('restaurant_wishlist').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    supabase.from('wishlist').select('dish_id, dishes!inner(restaurant_id)', { count: 'exact', head: true })
      .eq('dishes.restaurant_id', restaurantId),
  ]);
  return { place: (place.count ?? 0) > 0, dishes: dishes.count ?? 0 };
}

// Saves a restaurant, or takes it off your list along with any dishes you'd saved there.
export async function setRestaurantWanted(userId: string, restaurantId: string, want: boolean) {
  if (want) {
    const { error } = await supabase.from('restaurant_wishlist')
      .upsert({ user_id: userId, restaurant_id: restaurantId }, { ignoreDuplicates: true });
    if (error) throw new Error("Couldn't update your wishlist. Check your connection and try again.");
    return;
  }
  const { data: saved } = await supabase.from('wishlist').select('dish_id, dishes!inner(restaurant_id)')
    .eq('dishes.restaurant_id', restaurantId);
  const [a, b] = await Promise.all([
    supabase.from('restaurant_wishlist').delete().eq('user_id', userId).eq('restaurant_id', restaurantId),
    saved?.length
      ? supabase.from('wishlist').delete().eq('user_id', userId).in('dish_id', saved.map((d) => d.dish_id))
      : Promise.resolve({ error: null }),
  ]);
  if (a.error || b.error) throw new Error("Couldn't update your wishlist. Check your connection and try again.");
}

// How many people want to try this restaurant (only the number, never who).
export async function wantToTryCount(restaurantId: string) {
  const { data } = await supabase.rpc('want_to_try_count', { rid: restaurantId });
  return typeof data === 'number' ? data : 0;
}
