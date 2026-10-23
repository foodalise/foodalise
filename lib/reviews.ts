import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

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

export type PickedPhoto = { uri: string; mimeType?: string | null; width?: number | null };

// Take or choose a square photo. Returns null if the diner backs out.
export async function choosePhoto(fromCamera: boolean): Promise<PickedPhoto | null> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(fromCamera ? 'Camera access is off. Turn it on in Settings to take a photo.' : 'Photo access is off. Turn it on in Settings to choose a photo.');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, mimeType: asset.mimeType, width: asset.width } : null;
}

// Shrinks a photo and uploads it into the diner's own folder; returns where it went.
async function uploadPhoto(userId: string, photo: PickedPhoto) {
  const uri = await shrinkPhoto(photo);
  const contentType = uri === photo.uri ? photo.mimeType ?? 'image/jpeg' : 'image/jpeg';
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

// The database recalculates rating from the four scores; this matches it.
const overall = (...scores: number[]) => Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

export type NewReview = {
  userId: string;
  dishId: string;
  taste: number;
  presentation: number;
  ingredients: number;
  value: number;
  body: string;
  photo: PickedPhoto | null;
};

// Upload the photo first, so a failed upload never leaves a review without its picture.
export async function postReview({ userId, dishId, taste, presentation, ingredients, value, body, photo }: NewReview) {
  const photoPath = photo ? await uploadPhoto(userId, photo) : null;

  const { data: review, error } = await supabase.from('reviews')
    .insert({ user_id: userId, dish_id: dishId, taste, presentation, ingredients, value, rating: overall(taste, presentation, ingredients, value), body: body.trim() || null })
    .select('id').single();
  if (error || !review) {
    if (photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
    // P0001: a daily limit message from the database, already in plain words.
    if (error?.code === 'P0001') throw new Error(error.message);
    throw new Error(`Couldn't post the review: ${error?.message ?? 'unknown error'}`);
  }

  if (photoPath) {
    const { error: photoError } = await supabase.from('review_photos').insert({ review_id: review.id, storage_path: photoPath });
    if (photoError) throw new Error(`Review posted, but the photo couldn't be attached: ${photoError.message}`);
  }
  return review.id as string;
}

// Changes your own review's scores and words, and swaps its photo if you picked a new one.
// The new photo is attached before the old one is removed, so the review is never left without one.
export async function editReview({ reviewId, userId, taste, presentation, ingredients, value, body, photo }:
  Omit<NewReview, 'dishId'> & { reviewId: string }) {
  const photoPath = photo ? await uploadPhoto(userId, photo) : null;
  const { error } = await supabase.from('reviews')
    .update({ taste, presentation, ingredients, value, rating: overall(taste, presentation, ingredients, value), body: body.trim() || null })
    .eq('id', reviewId).eq('user_id', userId);
  if (error) {
    if (photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
    throw new Error(`Couldn't save your changes: ${error.message}`);
  }
  if (!photoPath) return;

  const { data: old } = await supabase.from('review_photos').select('storage_path').eq('review_id', reviewId);
  const { error: photoError } = await supabase.from('review_photos').insert({ review_id: reviewId, storage_path: photoPath });
  if (photoError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
    throw new Error(`Your scores and words are saved, but the new photo couldn't be attached: ${photoError.message}`);
  }
  const oldPaths = (old ?? []).map((p) => p.storage_path);
  if (oldPaths.length) {
    await supabase.from('review_photos').delete().eq('review_id', reviewId).in('storage_path', oldPaths);
    await supabase.storage.from(PHOTO_BUCKET).remove(oldPaths);
  }
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
