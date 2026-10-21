import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { loadWishlist, type WishPlace } from '@/lib/wishlist';

// Your "Want to try" list, grouped by restaurant: where to go, and what to order there.
export function WishlistList() {
  const t = useTheme();
  const [places, setPlaces] = useState<WishPlace[] | null>(null);
  useFocusEffect(useCallback(() => { loadWishlist().then(setPlaces); }, []));

  if (places === null) return null;
  if (!places.length) {
    return <Empty title="Nothing saved yet" body="Tap Want to try on a restaurant or a dish to keep a list of where to eat next." />;
  }
  return (
    <View style={{ gap: 10 }}>
      {places.map(({ restaurant: r, dishes }) => (
        <View key={r.id} style={[styles.card, { borderColor: t.line }]}>
          <Pressable onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })} style={styles.head}>
            <Text style={{ color: t.ink, fontWeight: '800', fontSize: 16, flex: 1 }}>
              {r.name}
              {r.cuisine ? <Text style={{ color: t.muted, fontStyle: 'italic', fontWeight: '400', fontSize: 13 }}>  {r.cuisine}</Text> : null}
            </Text>
            <Text style={{ color: t.muted, fontSize: 16 }}>›</Text>
          </Pressable>
          {dishes.length ? dishes.map((d) => (
            <Pressable key={d.id} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })}
              style={[styles.row, { borderTopColor: t.line }]}>
              <Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>{d.name}</Text>
              {d.review_count ? <ScorePill rating={Number(d.avg_rating)} /> : null}
            </Pressable>
          )) : (
            <Pressable onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
              style={[styles.row, { borderTopColor: t.line }]}>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>No dishes picked yet. See what to order</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
