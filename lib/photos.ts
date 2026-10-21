import type { GalleryPhoto } from '@/components/PhotoGallery';
import { supabase } from '@/lib/supabase';

type PhotoRow = {
  id: string; created_at: string; like_count: number; comment_count: number; rating: number;
  dishes: { id: string; name: string } | null; review_photos: { storage_path: string; position: number }[];
};

// Photos diners have posted at a restaurant: most liked and commented on first, then newest.
export async function restaurantPhotos(restaurantId: string, reviews = 500): Promise<GalleryPhoto[]> {
  const { data } = await supabase.from('reviews')
    .select('id, created_at, rating, like_count, comment_count, review_photos(storage_path, position), dishes!inner(id, name, restaurant_id)')
    .eq('dishes.restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(reviews)
    .returns<PhotoRow[]>();
  return toPhotos(data ?? []);
}

function toPhotos(data: PhotoRow[]): GalleryPhoto[] {
  const rows = [...data].sort((a, b) =>
    (b.like_count + b.comment_count) - (a.like_count + a.comment_count) || b.created_at.localeCompare(a.created_at));
  return rows.flatMap((r) => [...r.review_photos].sort((a, b) => a.position - b.position).map((p) => ({
    path: p.storage_path, reviewId: r.id, dishId: r.dishes?.id, dish: r.dishes?.name ?? '', likes: r.like_count, comments: r.comment_count, rating: Number(r.rating),
  })));
}

// Photos diners have posted of one dish: most liked and commented on first, then newest.
export async function dishPhotos(dishId: string, reviews = 60): Promise<GalleryPhoto[]> {
  const { data } = await supabase.from('reviews')
    .select('id, created_at, rating, like_count, comment_count, review_photos(storage_path, position), dishes!inner(id, name)')
    .eq('dish_id', dishId).order('created_at', { ascending: false }).limit(reviews)
    .returns<PhotoRow[]>();
  return toPhotos(data ?? []);
}
