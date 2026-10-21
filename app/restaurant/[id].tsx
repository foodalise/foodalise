import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SnapMenuButton } from '@/components/SnapMenuButton';
import { Button, Empty, Label, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchWebsiteMenu } from '@/lib/menu';
import { supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';

type DishRow = { id: string; name: string; section: string | null; price_pence: number | null; review_count: number; avg_rating: number | null };

const SOURCE_LABEL: Record<Restaurant['menu_source'], string> = {
  chain: 'Chain menu loaded', website: 'Menu read from website', users: 'Menu added by diners', none: 'No menu yet',
};

export default function RestaurantScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<DishRow[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const loadDishes = useCallback(() => {
    supabase.from('dishes').select('id, name, section, price_pence, review_count, avg_rating').eq('restaurant_id', id).order('name')
      .returns<DishRow[]>().then(({ data }) => setDishes(data ?? []));
  }, [id]);

  const loadRestaurant = useCallback(() => {
    supabase.from('restaurants').select('id, name, address, postcode, hygiene_rating, menu_source').eq('id', id).single()
      .then(({ data }) => setRestaurant(data));
  }, [id]);

  useEffect(() => {
    loadRestaurant();
    loadDishes();
  }, [loadRestaurant, loadDishes]);

  // No menu yet: try reading it from the restaurant's own website.
  const needsMenu = restaurant?.menu_source === 'none' && dishes?.length === 0;
  useEffect(() => {
    if (!needsMenu) return;
    let live = true;
    setLookingUp(true);
    fetchWebsiteMenu(id).then(({ added }) => {
      if (!live) return;
      setLookingUp(false);
      if (added > 0) {
        loadRestaurant();
        loadDishes();
      }
    });
    return () => { live = false; };
  }, [needsMenu, id, loadRestaurant, loadDishes]);

  const list = dishes ?? [];
  const sections = [...new Set(list.map((d) => d.section ?? 'Menu'))];

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: restaurant?.name ?? '' }} />
      {restaurant ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.title, { color: t.ink }]}>{restaurant.name}</Text>
          <Text style={{ color: t.muted }}>{[restaurant.address, restaurant.postcode].filter(Boolean).join(', ')}</Text>
          <View style={styles.chips}>
            {restaurant.hygiene_rating ? <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>Food hygiene {restaurant.hygiene_rating}</Text> : null}
            <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>{SOURCE_LABEL[restaurant.menu_source]}</Text>
          </View>
        </View>
      ) : null}
      <Button title="Review a dish here" onPress={() => router.push({ pathname: '/review', params: { restaurantId: id } })} />
      <SnapMenuButton restaurantId={id} onAdded={loadDishes} />
      {lookingUp ? (
        <View style={styles.looking}>
          <ActivityIndicator color={t.muted} />
          <Text style={{ color: t.muted }}>Looking for the menu on their website…</Text>
        </View>
      ) : dishes?.length === 0 ? <Empty title="No dishes yet" body="Snap the menu to add every dish, or add one when posting a review." /> : null}
      {sections.map((s) => (
        <View key={s} style={{ gap: 2 }}>
          <Label>{s}</Label>
          {list.filter((d) => (d.section ?? 'Menu') === s).map((d) => (
            <Link key={d.id} href={{ pathname: '/dish/[id]', params: { id: d.id } }} asChild>
              <Pressable style={StyleSheet.flatten([styles.row, { borderBottomColor: t.line }])}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}>{d.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    {d.review_count} {d.review_count === 1 ? 'review' : 'reviews'}{d.price_pence != null ? ` · £${(d.price_pence / 100).toFixed(2)}` : ''}
                  </Text>
                </View>
                {d.avg_rating != null ? <ScorePill rating={Number(d.avg_rating)} /> : null}
              </Pressable>
            </Link>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  looking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});
