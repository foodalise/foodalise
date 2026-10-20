import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// The publishable key is meant to ship inside the app; row-level security in
// supabase/migrations decides what it can read and write. A .env file overrides
// both values, e.g. to point at a test project.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lqguuzjfjvksgfzmsdxx.supabase.co';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_iiO9bDDI-_PA8iKg7BMWjw_zJrSArqu';

export const supabase = createClient(url, anonKey, {
  auth: {
    // During web static rendering there is no window, so skip persistence there.
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const PHOTO_BUCKET = 'review-photos';

export function photoUrl(path: string) {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
