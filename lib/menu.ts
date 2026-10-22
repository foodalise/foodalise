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

// Asks the fetch-menu function to read the restaurant's menu from its website (or,
// for a chain, the chain's menu page). The function itself decides whether a read is
// due, so this is cheap to call whenever a restaurant is opened. Never throws.
// Pass website when a diner typed it in because we couldn't find it ourselves, and
// refresh when they tapped "Refresh menu". menuLink (the Foodalise team only) reads the
// menu from that page or PDF instead of the restaurant's website.
// A website read runs in the background and takes a minute or two, so while the
// function says "running" this asks again every few seconds, for up to three minutes.
export async function fetchWebsiteMenu(restaurantId: string, website?: string, refresh = false, menuLink?: string): Promise<{ status: string; added: number }> {
  let result = await askFetchMenu({ restaurantId, website, refresh, menuLink });
  for (let i = 0; i < 36 && result.status === 'running'; i++) {
    await new Promise((done) => setTimeout(done, 5000));
    result = await askFetchMenu({ restaurantId });
  }
  return result.status === 'running' ? { status: 'error', added: 0 } : result;
}

async function askFetchMenu(body: { restaurantId: string; website?: string; refresh?: boolean; menuLink?: string }) {
  const { data, error } = await supabase.functions.invoke('fetch-menu', { body });
  if (error || !data) return { status: 'error', added: 0 };
  return data as { status: string; added: number };
}

export const MENU_PROBLEMS = ['Dishes are missing', "Lists dishes they don't serve", 'Prices are wrong', "It's not this restaurant's menu"];

// "Something wrong with this menu?": the Foodalise team sees these on the dashboard's Menus tab.
export async function reportMenu(restaurantId: string, problem: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');
  const { error } = await supabase.from('menu_reports').insert({ reporter_id: user.id, restaurant_id: restaurantId, problem });
  if (error) throw new Error("Couldn't send that. Check your connection and try again.");
}

// Files a restaurant that has dishes but no cuisine under one (Italian, Thai…).
// Returns the cuisine, or null if it couldn't be worked out. Never throws.
export async function fileCuisine(restaurantId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('fetch-menu', { body: { restaurantId, cuisine: true } });
  return error ? null : (data?.cuisine ?? null);
}
