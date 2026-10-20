import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';

export default function NotFoundScreen() {
  const t = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: t.surface }]}>
        <Text style={[styles.title, { color: t.ink }]}>This page doesn't exist.</Text>
        <Link href="/" style={{ color: t.muted, textDecorationLine: 'underline' }}>Go to the feed</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
});
