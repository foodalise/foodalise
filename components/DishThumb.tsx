import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { photoUrl } from '@/lib/supabase';

// A dish's cover photo as a small square. When there are more photos, one or two
// cards peek out from behind it, like a little stack.
export function DishThumb({ path, count, size = 40 }: { path: string; count: number; size?: number }) {
  const t = useTheme();
  const behind = Math.min(count - 1, 2);
  const step = 4;
  const card = { width: size, height: size, borderRadius: 8, borderColor: t.surface };
  return (
    <View style={{ width: size + behind * step, height: size + behind * step }}>
      {behind >= 2 ? <View style={[styles.card, card, { top: 0, left: step * 2, backgroundColor: t.line, opacity: 0.6 }]} /> : null}
      {behind >= 1 ? <View style={[styles.card, card, { top: behind >= 2 ? step : 0, left: step, backgroundColor: t.line }]} /> : null}
      <Image source={{ uri: photoUrl(path) }} contentFit="cover"
        style={[styles.card, card, { top: behind * step, left: 0, backgroundColor: t.card }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', borderWidth: 1.5, overflow: 'hidden' },
});
