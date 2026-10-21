import { FunctionsHttpError } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export type MenuScanResult = { found: number; added: number } | null;

// Photographs (or picks) a menu and has the read-menu function add its dishes to
// the restaurant. Returns null if the person cancelled.
export async function snapMenu(restaurantId: string, fromCamera: boolean): Promise<MenuScanResult> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(fromCamera ? 'Camera access is off. Turn it on in Settings to photograph the menu.' : 'Photo access is off. Turn it on in Settings to choose a menu photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
  const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const image = result.canceled ? null : result.assets[0]?.base64;
  if (!image) return null;

  const { data, error } = await supabase.functions.invoke('read-menu', { body: { restaurantId, image } });
  if (error) {
    const message = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => null))?.error : null;
    throw new Error(message ?? "Couldn't read the menu. Check your connection and try again.");
  }
  return data as { found: number; added: number };
}

// Asks the fetch-menu function to find the restaurant's own website and read the
// menu from it. Each restaurant is only tried once a month, so this is cheap to
// call whenever a restaurant without a menu is opened. Never throws.
export async function fetchWebsiteMenu(restaurantId: string): Promise<{ status: string; added: number }> {
  const { data, error } = await supabase.functions.invoke('fetch-menu', { body: { restaurantId } });
  if (error || !data) return { status: 'error', added: 0 };
  return data as { status: string; added: number };
}
