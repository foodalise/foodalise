import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { PHOTO_BUCKET, supabase } from './supabase';

const AVATAR_SIZE = 400;

export async function saveBio(userId: string, bio: string) {
  const clean = bio.trim().slice(0, 300);
  const { error } = await supabase.from('profiles').update({ bio: clean || null }).eq('id', userId);
  if (error) throw new Error("Couldn't save your bio. Check your connection and try again.");
  return clean || null;
}

// Picks a square photo from the library, uploads a small copy and makes it your
// profile photo. Returns the new storage path, or null if you cancelled.
export async function changeAvatar(userId: string, oldPath: string | null) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo access is off. Turn it on in Settings to choose a profile photo.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  const picked = result.canceled ? null : result.assets[0];
  if (!picked) return null;

  const image = await ImageManipulator.manipulate(picked.uri).resize({ width: AVATAR_SIZE, height: AVATAR_SIZE }).renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const bytes = await (await fetch(saved.uri)).arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error("Couldn't save your profile photo. Check your connection and try again.");
  }
  if (oldPath) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
  return path;
}
