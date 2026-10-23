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

// One restaurant on a list, with any dishes picked there (each with when it was saved).
export type WishPlace = {
  restaurant: WishRestaurant;
  dishes: (NonNullable<WishDish['dishes']> & { savedAt: string })[];
  savedAt: string;
};

const RESTAURANT_FIELDS = 'id, name, cuisine, latitude, longitude';

// Your own id, for reading only your own list (everyone's lists can be seen on their profiles).
async function myId() {
  return (await supabase.auth.getSession()).data.session?.user.id ?? '';
}

// Everything someone wants to try (you, if no one is named), grouped by restaurant,
// most recently saved first. Saving a dish puts its restaurant on the list too.
export async function loadWishlist(userId?: string): Promise<WishPlace[]> {
  const who = userId ?? await myId();
  const [dishes, places] = await Promise.all([
    supabase.from('wishlist')
      .select(`dish_id, created_at, dishes(id, name, avg_rating, review_count, restaurants(${RESTAURANT_FIELDS}))`)
      .eq('user_id', who)
      .order('created_at', { ascending: false })
      .returns<WishDish[]>(),
    supabase.from('restaurant_wishlist')
      .select(`created_at, restaurants(${RESTAURANT_FIELDS})`)
      .eq('user_id', who)
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
    if (r && w.dishes) add(r, w.created_at).dishes.push({ ...w.dishes, savedAt: w.created_at });
  }
  return [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// The dishes you've saved, kept in memory so every feed card can show its bookmark
// without its own request. Pass refresh to re-read it (e.g. when the feed reloads).
let wanted: Promise<Set<string>> | null = null;
export function wantedDishIds(refresh = false) {
  if (!wanted || refresh) {
    wanted = myId().then((me) => supabase.from('wishlist').select('dish_id').eq('user_id', me))
      .then(({ data }) => new Set((data ?? []).map((w) => w.dish_id as string)));
  }
  return wanted;
}

export async function isWanted(dishId: string) {
  const { count } = await supabase.from('wishlist').select('*', { count: 'exact', head: true }).eq('user_id', await myId()).eq('dish_id', dishId);
  return (count ?? 0) > 0;
}

export async function setWanted(userId: string, dishId: string, want: boolean) {
  const { error } = want
    ? await supabase.from('wishlist').upsert({ user_id: userId, dish_id: dishId }, { ignoreDuplicates: true })
    : await supabase.from('wishlist').delete().eq('user_id', userId).eq('dish_id', dishId);
  if (error) throw new Error("Couldn't update your wishlist. Check your connection and try again.");
  wantedDishIds().then((ids) => { if (want) ids.add(dishId); else ids.delete(dishId); });
}

// Whether a restaurant is on your list: saved itself, and how many of its dishes you've saved.
export async function restaurantWanted(restaurantId: string) {
  const me = await myId();
  const [place, dishes] = await Promise.all([
    supabase.from('restaurant_wishlist').select('*', { count: 'exact', head: true }).eq('user_id', me).eq('restaurant_id', restaurantId),
    supabase.from('wishlist').select('dish_id, dishes!inner(restaurant_id)', { count: 'exact', head: true })
      .eq('user_id', me).eq('dishes.restaurant_id', restaurantId),
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
    .eq('user_id', userId).eq('dishes.restaurant_id', restaurantId);
  const [a, b] = await Promise.all([
    supabase.from('restaurant_wishlist').delete().eq('user_id', userId).eq('restaurant_id', restaurantId),
    saved?.length
      ? supabase.from('wishlist').delete().eq('user_id', userId).in('dish_id', saved.map((d) => d.dish_id))
      : Promise.resolve({ error: null }),
  ]);
  if (a.error || b.error) throw new Error("Couldn't update your wishlist. Check your connection and try again.");
  if (saved?.length) wantedDishIds().then((ids) => saved.forEach((d) => ids.delete(d.dish_id)));
}

// How many people want to try this restaurant (only the number, never who).
export async function wantToTryCount(restaurantId: string) {
  const { data } = await supabase.rpc('want_to_try_count', { rid: restaurantId });
  return typeof data === 'number' ? data : 0;
}
