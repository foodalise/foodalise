import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { SnapMenuButton } from '@/components/SnapMenuButton';
import { Button, Empty, Field, Label, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchWebsiteMenu } from '@/lib/menu';
import { COURSES, courseOf } from '@/lib/menuOrder';
import { photoUrl, supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';

type DishRow = { id: string; name: string; section: string | null; price_pence: number | null; review_count: number; avg_rating: number | null };
type PhotoRow = { id: string; dish_id: string; review_photos: { storage_path: string; position: number }[] };

const PHOTO_COUNT = 9;

const LOOKUP_RESULT: Record<string, string> = {
  bad_website: "That doesn't look like the restaurant's own website. Check the address and try again.",
  unreadable: "Their website wouldn't let us in. Try snapping the menu instead.",
  no_menu: "We couldn't find a menu on that website. Try snapping the menu instead.",
  limit: "You've looked up lots of menus today. Try again tomorrow.",
  error: 'Something went wrong reading their website. Try again later.',
};

const SOURCE_LABEL: Record<Restaurant['menu_source'], string> = {
  chain: 'Chain menu loaded', website: 'Menu read from website', users: 'Menu added by diners', none: 'No menu yet',
};

export default function RestaurantScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<DishRow[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [website, setWebsite] = useState('');
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 32 - 8) / 3);

  const loadDishes = useCallback(() => {
    supabase.from('dishes').select('id, name, section, price_pence, review_count, avg_rating').eq('restaurant_id', id).order('name')
      .returns<DishRow[]>().then(({ data }) => setDishes(data ?? []));
  }, [id]);

  const loadRestaurant = useCallback(() => {
    supabase.from('restaurants').select('id, name, address, postcode, hygiene_rating, menu_source, website').eq('id', id).single()
      .then(({ data }) => setRestaurant(data));
  }, [id]);

  // Latest photos diners have posted here, newest first.
  const loadPhotos = useCallback(() => {
    supabase.from('reviews').select('id, dish_id, review_photos(storage_path, position), dishes!inner(restaurant_id)')
      .eq('dishes.restaurant_id', id).order('created_at', { ascending: false }).limit(PHOTO_COUNT)
      .returns<PhotoRow[]>().then(({ data }) => setPhotos((data ?? []).filter((r) => r.review_photos.length)));
  }, [id]);

  useEffect(() => {
    loadRestaurant();
    loadDishes();
    loadPhotos();
  }, [loadRestaurant, loadDishes, loadPhotos]);

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

  const readTheirWebsite = async () => {
    setLookingUp(true);
    setLookupNote(null);
    const { status, added } = await fetchWebsiteMenu(id, website.trim());
    setLookingUp(false);
    if (added > 0) {
      setWebsite('');
      loadRestaurant();
      loadDishes();
    } else {
      setLookupNote(LOOKUP_RESULT[status] ?? LOOKUP_RESULT.error);
    }
  };

  const list = dishes ?? [];
  // Starters, mains, sides, desserts, drinks; within each, grouped by the menu's own sections.
  const courses = COURSES.map((course) => ({
    course,
    dishes: list.filter((d) => courseOf(d.section) === course)
      .sort((a, b) => (a.section ?? '').localeCompare(b.section ?? '') || a.name.localeCompare(b.name)),
  })).filter((c) => c.dishes.length);

  // Average over every review here, so a dish with more reviews counts for more.
  const reviewCount = list.reduce((n, d) => n + d.review_count, 0);
  const average = reviewCount
    ? list.reduce((sum, d) => sum + (d.avg_rating != null ? Number(d.avg_rating) * d.review_count : 0), 0) / reviewCount
    : null;

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: restaurant?.name ?? '' }} />
      {restaurant ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.title, { color: t.ink }]}>{restaurant.name}</Text>
          <Text style={{ color: t.muted }}>{[restaurant.address, restaurant.postcode].filter(Boolean).join(', ')}</Text>
          <View style={styles.summary}>
            {average != null ? <ScorePill rating={average} /> : null}
            <Text style={{ color: t.muted }}>
              {reviewCount ? `Average of ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
            </Text>
          </View>
          {restaurant.website ? (
            <Pressable onPress={() => Linking.openURL(/^https?:/i.test(restaurant.website!) ? restaurant.website! : `https://${restaurant.website}`)}>
              <Text style={{ color: t.ink, textDecorationLine: 'underline' }}>{restaurant.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</Text>
            </Pressable>
          ) : null}
          <View style={styles.chips}>
            {restaurant.hygiene_rating ? <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>Food hygiene {restaurant.hygiene_rating}</Text> : null}
            <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>{SOURCE_LABEL[restaurant.menu_source]}</Text>
          </View>
        </View>
      ) : null}
      {photos.length ? (
        <View style={{ gap: 8 }}>
          <Label>Photos from diners</Label>
          <View style={styles.grid}>
            {photos.map((p) => (
              <Pressable key={p.id} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: p.dish_id } })}>
                <Image source={{ uri: photoUrl([...p.review_photos].sort((a, b) => a.position - b.position)[0].storage_path) }} style={{ width: tile, height: tile, borderRadius: 8, backgroundColor: t.bg }} contentFit="cover" />
              </Pressable>
            ))}
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
      ) : dishes?.length === 0 ? (
        <>
          <Empty title="No dishes yet" body="Snap the menu to add every dish, or add one when posting a review." />
          <View style={{ gap: 8 }}>
            <Label>Know their website?</Label>
            <Field value={website} onChangeText={setWebsite} placeholder="e.g. mangialondon.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Button title="Read the menu from their website" variant="ghost" disabled={!website.trim()} onPress={readTheirWebsite} />
            {lookupNote ? <Text style={{ color: t.muted }}>{lookupNote}</Text> : null}
          </View>
        </>
      ) : null}
      {courses.map(({ course, dishes: inCourse }) => (
        <View key={course} style={{ gap: 2 }}>
          <Label>{course}</Label>
          {inCourse.map((d) => (
            <Link key={d.id} href={{ pathname: '/dish/[id]', params: { id: d.id } }} asChild>
              <Pressable style={StyleSheet.flatten([styles.row, { borderBottomColor: t.line }])}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}>{d.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    {[d.section && d.section.toLowerCase() !== course.toLowerCase() ? d.section : null,
                      `${d.review_count} ${d.review_count === 1 ? 'review' : 'reviews'}`,
                      d.price_pence != null ? `£${(d.price_pence / 100).toFixed(2)}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {d.avg_rating != null ? <ScorePill rating={Number(d.avg_rating)} /> : null}
              </Pressable>
            </Link>
          ))}
        </View>
      ))}
      <Text style={{ color: t.muted, fontSize: 11, marginTop: 8 }}>
        Restaurant details and hygiene rating from the Food Standards Agency, under the Open Government Licence v3.0.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  looking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});
