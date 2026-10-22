import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
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
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
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

  if (loading) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const t = themes[scheme];
  const navTheme = { ...base, colors: { ...base.colors, background: t.surface, card: t.surface, text: t.ink, border: t.line, primary: t.ink } };

  return (
    <ThemeProvider value={navTheme}>
      <Stack>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/[id]" options={{ title: '' }} />
          <Stack.Screen name="dish/[id]" options={{ title: '' }} />
          <Stack.Screen name="user/[id]" options={{ title: '' }} />
          <Stack.Screen name="comments/[id]" options={{ title: 'Comments' }} />
          <Stack.Screen name="share/[id]" options={{ title: 'Share', presentation: 'modal' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="follows" options={{ title: '' }} />
          <Stack.Screen name="top-list" options={{ title: 'Your top list' }} />
          <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
        <Stack.Screen name="terms" options={{ title: 'Terms of Use' }} />
        <Stack.Screen name="credits" options={{ title: 'Data credits' }} />
      </Stack>
    </ThemeProvider>
  );
}
