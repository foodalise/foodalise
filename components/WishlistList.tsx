import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { loadWishlist, type WishDish } from '@/lib/wishlist';

// Your "Want to try" list: newest saved first, each with where it is.
export function WishlistList() {
  const t = useTheme();
  const [items, setItems] = useState<WishDish[] | null>(null);
  useFocusEffect(useCallback(() => { loadWishlist().then(setItems); }, []));

  if (items === null) return null;
  if (!items.length) {
    return <Empty title="Nothing saved yet" body="Tap Want to try on any dish to keep a list of what to eat next." />;
  }
  return (
    <View>
      {items.map(({ dish_id, dishes: d }) => d ? (
        <Pressable key={dish_id} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })}
          style={[styles.row, { borderBottomColor: t.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{d.name}</Text>
            {d.restaurants ? (
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {d.restaurants.name}
                {d.restaurants.cuisine ? <Text style={{ fontStyle: 'italic' }}> · {d.restaurants.cuisine}</Text> : null}
              </Text>
            ) : null}
          </View>
          {d.review_count ? <ScorePill rating={Number(d.avg_rating)} /> : null}
        </Pressable>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
