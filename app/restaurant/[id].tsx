import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PhotoGallery, type GalleryPhoto } from '@/components/PhotoGallery';
import { SnapMenuButton } from '@/components/SnapMenuButton';
import { Button, Empty, Field, Label, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { DIETS } from '@/lib/cuisines';
import { openDirections, priceLabel } from '@/lib/directions';
import { fetchWebsiteMenu, fileCuisine, MENU_PROBLEMS, reportMenu } from '@/lib/menu';
import { COURSES, courseOf } from '@/lib/menuOrder';
import { restaurantPhotos } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';

type DishRow = { id: string; name: string; section: string | null; price_pence: number | null; review_count: number; avg_rating: number | null; on_menu: boolean };

// Website menus are re-read in the background once they're this old.
const WEBSITE_MENU_DAYS = 60;

// What "Refresh menu" tells the diner, by how it went.
const REFRESH_RESULT: Record<string, string> = {
  done: 'The menu is up to date.',
  too_soon: 'This menu was refreshed in the last month. Try again later, or tell us what looks wrong.',
  already_refreshed: "You've already refreshed this menu. Tell us what looks wrong instead and we'll check it.",
  no_website: "We don't know where their menu is online. Tell us what looks wrong and we'll check it.",
  no_menu: "We couldn't read a newer menu from their website, so we've kept this one.",
  unreadable: "Their website wouldn't let us in, so we've kept this menu.",
  limit: "You've refreshed lots of menus today. Try again tomorrow.",
  error: 'Something went wrong refreshing the menu. Try again later.',
};

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
  const [checking, setChecking] = useState(false);
  const [website, setWebsite] = useState('');
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);

  const loadDishes = useCallback(() => {
    supabase.from('dishes').select('id, name, section, price_pence, review_count, avg_rating, on_menu').eq('restaurant_id', id).order('name')
      .returns<DishRow[]>().then(({ data }) => setDishes(data ?? []));
  }, [id]);

  const loadRestaurant = useCallback(() => {
    supabase.from('restaurants').select('id, name, address, postcode, hygiene_rating, menu_source, website, chain_slug, menu_checked_at, latitude, longitude, cuisine, price_level, diets').eq('id', id).single()
      .then(({ data }) => setRestaurant(data));
  }, [id]);

  // Every photo diners have posted here: most liked and commented on first, then newest.
  const loadPhotos = useCallback(() => { restaurantPhotos(id).then(setPhotos); }, [id]);

  useEffect(() => {
    loadRestaurant();
    loadDishes();
    loadPhotos();
  }, [loadRestaurant, loadDishes, loadPhotos]);

  const onMenu = dishes?.filter((d) => d.on_menu) ?? null;

  // No menu yet: try reading it from the restaurant's own website.
  const needsMenu = restaurant?.menu_source === 'none' && onMenu?.length === 0;
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

  // Dishes but no cuisine yet (a snapped menu, or one read before cuisines existed): work it out.
  const needsCuisine = !!restaurant && !restaurant.cuisine && (onMenu?.length ?? 0) > 0;
  useEffect(() => {
    if (!needsCuisine) return;
    fileCuisine(id).then((cuisine) => { if (cuisine) setRestaurant((r) => r && { ...r, cuisine }); });
  }, [needsCuisine, id]);

  // A website menu that's two months old is re-read quietly in the background.
  const age = restaurant?.menu_checked_at ? (Date.now() - new Date(restaurant.menu_checked_at).getTime()) / 864e5 : Infinity;
  const due = !!restaurant && !needsMenu && !restaurant.chain_slug && restaurant.menu_source === 'website' && age > WEBSITE_MENU_DAYS;
  useEffect(() => {
    if (!due) return;
    let live = true;
    setChecking(true);
    fetchWebsiteMenu(id).then(({ status }) => {
      if (!live) return;
      setChecking(false);
      if (status === 'done') {
        loadRestaurant();
        loadDishes();
      }
    });
    return () => { live = false; };
  }, [due, id, loadRestaurant, loadDishes]);

  // The ⋯ button at the top right.
  function openMenuOptions() {
    Alert.alert(restaurant?.name ?? 'Menu', undefined, [
      { text: 'Refresh menu', onPress: refreshMenu },
      { text: 'Something wrong with this menu?', onPress: flagMenu },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function refreshMenu() {
    setChecking(true);
    const { status, added } = await fetchWebsiteMenu(id, undefined, true);
    setChecking(false);
    if (status === 'done') {
      loadRestaurant();
      loadDishes();
    }
    Alert.alert(status === 'done' && added > 0 ? `Menu refreshed: ${added} new ${added === 1 ? 'dish' : 'dishes'}.` : REFRESH_RESULT[status] ?? REFRESH_RESULT.error);
  }

  function flagMenu() {
    Alert.alert("What's wrong with the menu?", "We'll check it and update it.", [
      ...MENU_PROBLEMS.map((problem) => ({
        text: problem,
        onPress: () => reportMenu(id, problem).then(() => Alert.alert('Thanks for letting us know.'), (e: Error) => Alert.alert(e.message)),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

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

  const list = onMenu ?? [];
  // Dishes that have left the menu stay findable while they have reviews.
  const retired = (dishes ?? []).filter((d) => !d.on_menu && d.review_count > 0);
  // Starters, mains, sides, desserts, drinks; within each, grouped by the menu's own sections.
  const courses = COURSES.map((course) => ({
    course,
    dishes: list.filter((d) => courseOf(d.section) === course)
      .sort((a, b) => (a.section ?? '').localeCompare(b.section ?? '') || a.name.localeCompare(b.name)),
  })).filter((c) => c.dishes.length);
  if (retired.length) courses.push({ course: 'No longer on the menu' as (typeof COURSES)[number], dishes: retired });

  // Average over every review here, so a dish with more reviews counts for more.
  const reviewCount = [...list, ...retired].reduce((n, d) => n + d.review_count, 0);
  const average = reviewCount
    ? [...list, ...retired].reduce((sum, d) => sum + (d.avg_rating != null ? Number(d.avg_rating) * d.review_count : 0), 0) / reviewCount
    : null;

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{
        title: restaurant?.name ?? '',
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Menu options" onPress={openMenuOptions} hitSlop={12}>
            <Text style={{ color: t.ink, fontSize: 22, fontWeight: '800' }}>⋯</Text>
          </Pressable>
        ),
      }} />
      {restaurant ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.title, { color: t.ink }]}>
            {restaurant.name}
            {restaurant.cuisine ? <Text style={[styles.cuisine, { color: t.muted }]}>  {restaurant.cuisine}</Text> : null}
          </Text>
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
          <Button title="Directions" variant="ghost" onPress={() => openDirections(restaurant)} />
          <View style={styles.chips}>
            {priceLabel(restaurant.price_level) ? <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>{priceLabel(restaurant.price_level)}</Text> : null}
            {DIETS.filter((d) => restaurant.diets?.includes(d.key)).map((d) => (
              <Text key={d.key} style={[styles.chip, { borderColor: t.line, color: t.muted }]}>{d.label} options</Text>
            ))}
            {restaurant.hygiene_rating ? <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>Food hygiene {restaurant.hygiene_rating}</Text> : null}
            <Text style={[styles.chip, { borderColor: t.line, color: t.muted }]}>{SOURCE_LABEL[restaurant.menu_source]}</Text>
          </View>
        </View>
      ) : null}
      {photos.length ? (
        <View style={{ gap: 8 }}>
          <Label>Photos from diners</Label>
          <PhotoGallery photos={photos} />
        </View>
      ) : null}
      <Button title="Review a dish here" onPress={() => router.push({ pathname: '/review', params: { restaurantId: id } })} />
      {/* Only while there's no menu: once dishes are listed, a snap would just add near-duplicates. */}
      {onMenu?.length === 0 ? <SnapMenuButton restaurantId={id} onAdded={loadDishes} /> : null}
      {lookingUp ? (
        <View style={styles.looking}>
          <ActivityIndicator color={t.muted} />
          <Text style={{ color: t.muted }}>Looking for the menu on their website…</Text>
        </View>
      ) : onMenu?.length === 0 ? (
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
          <View style={[styles.course, { borderBottomColor: t.ink }]}>
            <Text style={[styles.courseTitle, { color: t.ink }]}>{course}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{inCourse.length} {inCourse.length === 1 ? 'dish' : 'dishes'}</Text>
          </View>
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
      {list.length && (checking || restaurant?.menu_checked_at) ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {checking ? 'Checking for menu updates…'
              : restaurant?.menu_checked_at ? `Menu updated ${new Date(restaurant.menu_checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : null}
          </Text>
        </View>
      ) : null}
      <Text style={{ color: t.muted, fontSize: 11, marginTop: 8 }}>
        Restaurant details and hygiene rating from the Food Standards Agency, under the Open Government Licence v3.0.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6 },
  cuisine: { fontSize: 15, fontWeight: '400', fontStyle: 'italic', letterSpacing: 0 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  course: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, paddingBottom: 6, borderBottomWidth: 2 },
  courseTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  looking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});
