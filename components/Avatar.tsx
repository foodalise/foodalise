import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { photoUrl } from '@/lib/supabase';

// A person's profile photo, or the first letter of their username until they add one.
export function Avatar({ username, path, size }: { username?: string | null; path?: string | null; size: number }) {
  const t = useTheme();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (path) return <Image source={{ uri: photoUrl(path) }} style={[round, { backgroundColor: t.bg }]} contentFit="cover" />;
  return (
    <View style={[round, { backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: t.surface, fontWeight: '800', fontSize: size * 0.4 }}>{username?.[0]?.toUpperCase() ?? ''}</Text>
    </View>
  );
}
