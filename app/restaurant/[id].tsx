import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Alert, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { DishThumb } from '@/components/DishThumb';
import { FoodBadge } from '@/components/FoodBadge';
import { PhotoGallery, type GalleryPhoto } from '@/components/PhotoGallery';
import { SnapMenuButton } from '@/components/SnapMenuButton';
import { Button, Empty, Field, Label, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { DIETS } from '@/lib/cuisines';
import { openDirections, priceLabel } from '@/lib/directions';
import { fetchWebsiteMenu, fileCuisine, MENU_PROBLEMS, reportMenu } from '@/lib/menu';
import { useAuth } from '@/lib/auth';
import { COURSES, courseOf } from '@/lib/menuOrder';
import { dishCovers, restaurantPhotos } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';
import { restaurantWanted, setRestaurantWanted, wantToTryCount } from '@/lib/wishlist';

type DishRow = { id: string; name: string; section: string | null; price_pence: number | null; review_count: number; avg_rating: number | null; on_menu: boolean };

// Website menus are re-read in the background once they're this old.
const WEBSITE_MENU_DAYS = 60;

// What "Refresh menu" tells the diner, by how it went.
const REFRESH_RESULT: Record<string, string> = {
  done: 'The menu is up to date.',
  too_soon: 'This menu was refreshed in the last month. Try again later, or tell us what looks wrong.',
  already_refreshed: "You've already refreshed this menu. Tell us what looks wrong instead and we'll check it.",
  no_website: "We couldn't find their website. If you know it, type it in below, or snap the menu.",
  no_menu: "We couldn't read a newer menu from their website, so we've kept this one.",
  unreadable: "Their website wouldn't let us in, so we've kept this menu.",
  limit: "You've refreshed lots of menus today. Try again tomorrow.",
  bad_website: "That link can't be used. Check it's the restaurant's own menu page or PDF.",
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
  const [find, setFind] = useState('');
  const [finding, setFinding] = useState(false);
  const { height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const searchY = useRef(0);
  const dragging = useRef(false);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const me = useAuth().session?.user.id;
  const [wanted, setWanted] = useState<{ place: boolean; dishes: number } | null>(null);
  const [wantCount, setWantCount] = useState(0);

  const loadDishes = useCallback(() => {
    supabase.from('dishes').select('id, name, section, price_pence, review_count, avg_rating, on_menu').eq('restaurant_id', id).order('name')
      .returns<DishRow[]>().then(({ data }) => setDishes(data ?? []));
  }, [id]);

  const loadRestaurant = useCallback(() => {
    supabase.from('restaurants').select('id, name, address, postcode, hygiene_rating, menu_source, website, chain_slug, menu_checked_at, latitude, longitude, cuisine, food_type, price_level, diets').eq('id', id).single()
      .then(({ data }) => setRestaurant(data));
  }, [id]);

  // Every photo diners have posted here: most liked and commented on first, then newest.
  const loadPhotos = useCallback(() => { restaurantPhotos(id).then(setPhotos); }, [id]);
  const covers = useMemo(() => dishCovers(photos), [photos]);

  // Whether it's on your Want to try list, and how many people want to try it.
  const loadWanted = useCallback(() => {
    restaurantWanted(id).then(setWanted);
    wantToTryCount(id).then(setWantCount);
  }, [id]);

  useEffect(() => {
    loadDishes();
    loadPhotos();
  }, [loadDishes, loadPhotos]);
  useFocusEffect(loadRestaurant); // also picks up an admin's food type fix
  useFocusEffect(loadWanted);

  const onList = !!wanted && (wanted.place || wanted.dishes > 0);

  async function toggleWanted() {
    if (!me || !wanted) return;
    const remove = async () => {
      setWanted({ place: false, dishes: 0 });
      try {
        await setRestaurantWanted(me, id, false);
      } catch (e) {
        Alert.alert((e as Error).message);
      }
      loadWanted();
    };
    if (!onList) {
      setWanted({ ...wanted, place: true });
      try {
        await setRestaurantWanted(me, id, true);
      } catch (e) {
        Alert.alert((e as Error).message);
      }
      loadWanted();
    } else if (wanted.dishes) {
      const n = wanted.dishes;
      Alert.alert('Take this off your Want to try list?', `The ${n === 1 ? 'dish' : `${n} dishes`} you saved here will be removed too.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: remove },
      ]);
    } else {
      remove();
    }
  }

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

  // The ⋯ button at the top right. The team also gets "Read menu from a link", "Change food type" and "Not a place to eat".
  async function openMenuOptions() {
    const { data: admin } = await supabase.rpc('is_admin');
    Alert.alert(restaurant?.name ?? 'Menu', undefined, [
      { text: 'Refresh menu', onPress: () => refreshMenu() },
      { text: 'Something wrong with this menu?', onPress: flagMenu },
      ...(admin ? [
        { text: 'Read menu from a link', onPress: askMenuLink },
        { text: 'Change food type', onPress: () => router.push({ pathname: '/food-type', params: { id, current: restaurant?.food_type ?? '' } }) },
        { text: 'Not a place to eat', style: 'destructive' as const, onPress: confirmHide },
      ] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function confirmHide() {
    Alert.alert(`Take ${restaurant?.name ?? 'this place'} off Foodalise?`, "It won't come back when the area is imported again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('admin_hide_place', { place: id });
          if (error) Alert.alert(error.message);
          else router.back();
        },
      },
    ]);
  }

  // The team can point the reader at the real menu (a page or PDF) when the website read gets it wrong.
  function askMenuLink() {
    Alert.prompt('Read menu from a link', 'Paste a link to their menu page or menu PDF.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Read menu', onPress: (link?: string) => { if (link?.trim()) refreshMenu(link.trim()); } },
    ], 'plain-text', '', 'url');
  }

  async function refreshMenu(menuLink?: string) {
    setChecking(true);
    const { status, added } = await fetchWebsiteMenu(id, undefined, true, menuLink);
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
  // "What to order": the best-scored dishes still on the menu, ties going to the most reviewed.
  const topDishes = list.filter((d) => d.review_count > 0 && d.avg_rating != null)
    .sort((a, b) => Number(b.avg_rating) - Number(a.avg_rating) || b.review_count - a.review_count)
    .slice(0, 3);
  // Dishes that have left the menu stay findable while they have reviews.
  const retired = (dishes ?? []).filter((d) => !d.on_menu && d.review_count > 0);
  // Starters, mains, sides, desserts, drinks; within each, grouped by the menu's own sections.
  const courses = COURSES.map((course) => ({
    course,
    dishes: list.filter((d) => courseOf(d.section) === course)
      .sort((a, b) => (a.section ?? '').localeCompare(b.section ?? '') || a.name.localeCompare(b.name)),
  })).filter((c) => c.dishes.length);
  if (retired.length) courses.push({ course: 'No longer on the menu' as (typeof COURSES)[number], dishes: retired });
  // Menu search: every word typed must appear in the dish name or its menu section.
  const words = plain(find).split(/\s+/).filter(Boolean);
  const shown = words.length
    ? courses.map((c) => ({ ...c, dishes: c.dishes.filter((d) => words.every((w) => plain(`${d.name} ${d.section ?? ''}`).includes(w))) }))
      .filter((c) => c.dishes.length)
    : courses;

  // Average over every review here, so a dish with more reviews counts for more.
  const reviewCount = [...list, ...retired].reduce((n, d) => n + d.review_count, 0);
  const average = reviewCount
    ? [...list, ...retired].reduce((sum, d) => sum + (d.avg_rating != null ? Number(d.avg_rating) * d.review_count : 0), 0) / reviewCount
    : null;

  // Tapping the menu search lifts it to the top so the keyboard can't cover it or the results.
  function startFinding() {
    setFinding(true);
    dragging.current = false;
    setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, searchY.current - 12), animated: true }), 50);
  }

  return (
    <ScrollView ref={scroller} style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets scrollEventThrottle={32}
      onScrollBeginDrag={() => { dragging.current = true; }}
      // Scrolling back up past the search box puts the keyboard away.
      onScroll={(e) => {
        if (finding && dragging.current && e.nativeEvent.contentOffset.y < searchY.current - 60) Keyboard.dismiss();
      }}>
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
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: t.ink, flexShrink: 1 }]}>
              {restaurant.name}
              {restaurant.food_type && restaurant.food_type !== 'Other' ? <Text style={[styles.cuisine, { color: t.muted }]}>  {restaurant.food_type}</Text> : null}
            </Text>
            <FoodBadge type={restaurant.food_type} size={34} />
          </View>
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
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button title={onList ? '✓ Want to try' : '+ Want to try'} variant="ghost" onPress={toggleWanted} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Directions" variant="ghost" onPress={() => openDirections(restaurant)} />
            </View>
          </View>
          {wantCount ? (
            <Text style={{ color: t.muted, fontSize: 13 }}>
              {wantCount === 1 ? '1 person wants' : `${wantCount} people want`} to try this place
            </Text>
          ) : null}
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
      {topDishes.length ? (
        <View style={[styles.order, { borderColor: t.line }]}>
          <Text style={[styles.orderTitle, { color: t.ink }]}>What to order</Text>
          {topDishes.map((d, i) => (
            <Pressable key={d.id} onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })} style={styles.orderRow}>
              <Text style={[styles.rank, { color: t.muted }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{d.name}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{d.review_count} {d.review_count === 1 ? 'review' : 'reviews'}</Text>
              </View>
              {covers.get(d.id) ? <DishThumb path={covers.get(d.id)!.path} count={covers.get(d.id)!.count} /> : null}
              <ScorePill rating={Number(d.avg_rating)} />
            </Pressable>
          ))}
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
      {list.length + retired.length > 5 ? (
        <View onLayout={(e) => { searchY.current = e.nativeEvent.layout.y; }} style={[styles.search, { backgroundColor: t.card, borderColor: t.line }]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={t.muted} size={18} />
          <TextInput value={find} onChangeText={setFind} placeholder="Search the menu" placeholderTextColor={t.muted}
            onFocus={startFinding} onBlur={() => setFinding(false)} returnKeyType="search" autoCorrect={false} style={{ flex: 1, color: t.ink, fontSize: 16 }} />
          {find ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => setFind('')}>
              <Text style={{ color: t.muted, fontSize: 16, fontWeight: '700' }}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {words.length && !shown.length ? (
        <Text style={{ color: t.muted }}>No dishes match "{find.trim()}". You can add a dish when you review it here.</Text>
      ) : null}
      {shown.map(({ course, dishes: inCourse }) => (
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
                {covers.get(d.id) ? <DishThumb path={covers.get(d.id)!.path} count={covers.get(d.id)!.count} /> : null}
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
      {/* Room below a short list of results, so the search box can still sit at the top. */}
      {finding || words.length ? <View style={{ height }} /> : null}
    </ScrollView>
  );
}

// Lower case without accents, so "creme" finds "Crème brûlée".
function plain(text: string) {
  return (typeof text.normalize === 'function' ? text.normalize('NFD') : text).replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 46, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  order: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  orderTitle: { fontSize: 17, fontWeight: '800' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 18, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cuisine: { fontSize: 15, fontWeight: '400', fontStyle: 'italic', letterSpacing: 0 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  course: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, paddingBottom: 6, borderBottomWidth: 2 },
  courseTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  looking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});
