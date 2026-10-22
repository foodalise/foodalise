import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { PHOTO_BUCKET, supabase } from './supabase';

// Phone photos are several megabytes. 1440px wide stays sharp on the biggest
// iPhone screens (the feed shows photos edge to edge) while keeping each photo
// around 300-500KB. The photo is compressed only once, here, at high quality.
const PHOTO_WIDTH = 1440;

async function shrinkPhoto(photo: { uri: string; width?: number | null }) {
  const edit = ImageManipulator.manipulate(photo.uri);
  if (!photo.width || photo.width > PHOTO_WIDTH) edit.resize({ width: PHOTO_WIDTH });
  const image = await edit.renderAsync();
  const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return saved.uri;
}

export type NewReview = {
  userId: string;
  dishId: string;
  taste: number;
  presentation: number;
  value: number;
  body: string;
  photo: { uri: string; mimeType?: string | null; width?: number | null } | null;
};

// Upload the photo first, so a failed upload never leaves a review without its picture.
export async function postReview({ userId, dishId, taste, presentation, value, body, photo }: NewReview) {
  let photoPath: string | null = null;
  if (photo) {
    const uri = await shrinkPhoto(photo);
    const contentType = uri === photo.uri ? photo.mimeType ?? 'image/jpeg' : 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    photoPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = await (await fetch(uri)).arrayBuffer();
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath, bytes, { contentType });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data: review, error } = await supabase.from('reviews')
    // The database recalculates rating from the three scores; this matches it.
    .insert({ user_id: userId, dish_id: dishId, taste, presentation, value, rating: Math.round(((taste + presentation + value) / 3) * 10) / 10, body: body.trim() || null })
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

// Deletes one of your reviews everywhere: the review, its photo rows (removed by
// the database along with it), the dish's score, and the photo files themselves.
export async function deleteReview(reviewId: string) {
  const { data: photos } = await supabase.from('review_photos').select('storage_path').eq('review_id', reviewId);
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  if (error) throw new Error(`Couldn't delete the review: ${error.message}`);
  const paths = (photos ?? []).map((p) => p.storage_path);
  // The review is already gone, so a leftover file is harmless; don't fail on it.
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}
