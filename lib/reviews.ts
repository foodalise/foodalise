import { PHOTO_BUCKET, supabase } from './supabase';

export type NewReview = {
  userId: string;
  dishId: string;
  rating: number;
  body: string;
  photo: { uri: string; mimeType?: string | null } | null;
};

// Upload the photo first, so a failed upload never leaves a review without its picture.
export async function postReview({ userId, dishId, rating, body, photo }: NewReview) {
  let photoPath: string | null = null;
  if (photo) {
    const contentType = photo.mimeType ?? 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    photoPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = await (await fetch(photo.uri)).arrayBuffer();
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath, bytes, { contentType });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data: review, error } = await supabase.from('reviews')
    .insert({ user_id: userId, dish_id: dishId, rating, body: body.trim() || null })
    .select('id').single();
  if (error || !review) {
    if (photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
    throw new Error(`Couldn't post the review: ${error?.message ?? 'unknown error'}`);
  }

  if (photoPath) {
    const { error: photoError } = await supabase.from('review_photos').insert({ review_id: review.id, storage_path: photoPath });
    if (photoError) throw new Error(`Review posted, but the photo couldn't be attached: ${photoError.message}`);
  }
  return review.id as string;
}

// Adds a dish a diner ate that isn't on the menu yet. If someone already added it
// (same name, any capitals), returns that one instead.
export async function addDish(restaurantId: string, name: string, userId: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  const { data, error } = await supabase.from('dishes')
    .insert({ restaurant_id: restaurantId, name: clean, source: 'user', created_by: userId })
    .select('id, name').single();
  if (!error && data) return data as { id: string; name: string };
  if (error?.code === '23505') {
    const { data: existing } = await supabase.from('dishes').select('id, name')
      .eq('restaurant_id', restaurantId).ilike('name', clean.replace(/[%_]/g, '')).limit(1).single();
    if (existing) return existing as { id: string; name: string };
  }
  throw new Error(`Couldn't add the dish: ${error?.message ?? 'unknown error'}`);
}
