import { supabase } from '@/lib/supabase';

export type WishDish = {
  dish_id: string;
  created_at: string;
  dishes: {
    id: string; name: string; avg_rating: number | null; review_count: number;
    restaurants: { id: string; name: string; cuisine: string | null; latitude: number | null; longitude: number | null } | null;
  } | null;
};

// The dishes you've saved to try, newest first.
export async function loadWishlist(): Promise<WishDish[]> {
  const { data } = await supabase.from('wishlist')
    .select('dish_id, created_at, dishes(id, name, avg_rating, review_count, restaurants(id, name, cuisine, latitude, longitude))')
    .order('created_at', { ascending: false })
    .returns<WishDish[]>();
  return data ?? [];
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
