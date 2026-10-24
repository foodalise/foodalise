import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { themes } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const scheme = useColorScheme();
  const { session, loading, recovering } = useAuth();
  const signedIn = !!session && !recovering;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Once signed in: register this phone for push, and open the notifications
  // list when someone taps one.
  useEffect(() => {
    if (!signedIn) return;
    registerForPush();
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.push('/notifications'));
    return () => sub.remove();
  }, [signedIn]);

  // New accounts see the welcome screens once.
  const userId = signedIn ? session?.user.id : undefined;
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('onboarded_at').eq('id', userId).maybeSingle().then(({ data }) => {
      if (data && !data.onboarded_at) router.replace('/welcome');
    });
  }, [userId]);

  // Count a visit when the app opens or comes back to the front; the database only
  // counts it after 30 minutes away. The team sees the totals on the dashboard.
  useEffect(() => {
    if (!userId) return;
    const record = () => { supabase.rpc('record_visit').then(() => {}); };
    record();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') record(); });
    return () => sub.remove();
  }, [userId]);

  if (loading) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const t = themes[scheme];
  const navTheme = { ...base, colors: { ...base.colors, background: t.surface, card: t.surface, text: t.ink, border: t.line, primary: t.ink } };

  return (
    <ThemeProvider value={navTheme}>
      {/* Solid header so pages start below it (the iOS 26 glass header is see-through), and a plain back arrow. */}
      <Stack screenOptions={{ headerTransparent: false, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
        {/* Signed out, anything private goes to sign-in (not the first public page, e.g. Terms). */}
        <Stack.Protected guard={signedIn} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/[id]" options={{ title: '' }} />
          <Stack.Screen name="dish/[id]" options={{ title: '' }} />
          <Stack.Screen name="user/[id]" options={{ title: '' }} />
          <Stack.Screen name="comments/[id]" options={{ title: 'Comments' }} />
          <Stack.Screen name="edit-review/[id]" options={{ title: 'Edit review', presentation: 'modal' }} />
          <Stack.Screen name="share/[id]" options={{ title: 'Share', presentation: 'modal' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="follows" options={{ title: '' }} />
          <Stack.Screen name="top-list" options={{ title: 'Share your top 10' }} />
          <Stack.Screen name="review-dish" options={{ title: 'Review a dish' }} />
          <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
          <Stack.Screen name="food-type" options={{ title: 'Food type', presentation: 'modal' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
        <Stack.Screen name="terms" options={{ title: 'Terms of Use' }} />
        <Stack.Screen name="reviews-policy" options={{ title: 'Reviews policy' }} />
        <Stack.Screen name="credits" options={{ title: 'Data credits' }} />
      </Stack>
    </ThemeProvider>
  );
}
