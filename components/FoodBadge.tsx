import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { foodEmoji } from '@/lib/foodTypes';

// A small circle with a picture of the kind of food a place serves (☕, 🥡, 🍕...).
export function FoodBadge({ type, size = 28 }: { type: string | null | undefined; size?: number }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={type ?? 'Restaurant'}
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.card, borderColor: t.line }]}>
      <Text style={{ fontSize: size * 0.55 }}>{foodEmoji(type)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
