import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapFilterSheet, type FilterKind } from '@/components/MapFilterSheet';
import type { GalleryPhoto } from '@/components/PhotoGallery';
import { RestaurantMap, type RestaurantMapHandle } from '@/components/RestaurantMap';
import { Button, Chips, PhotoScore, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { DIETS, PRICE_LEVELS } from '@/lib/cuisines';
import { openDirections, priceLabel } from '@/lib/directions';
import { restaurantPhotos } from '@/lib/photos';
import { addRestaurant, coverPhotos, distanceKm, formatDistance, NO_FILTERS, restaurantsIn, type MapFilters, type MapRestaurant, type Region } from '@/lib/places';
import { photoUrl, supabase } from '@/lib/supabase';
import { loadWishlist, type WishPlace } from '@/lib/wishlist';

const NEARBY_KM = 0.8; // how close a wishlist restaurant must be to get a nudge

// What each filter button says, given what's chosen.
function filterLabel(kind: FilterKind, f: MapFilters) {
  const many = (list: string[], name: string) => (list.length ? (list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`) : name);
  if (kind === 'cuisine') return many(f.cuisines, 'Cuisine');
  if (kind === 'rating') return f.minRating != null ? `${f.minRating}+` : 'Rating';
  if (kind === 'cost') return many(PRICE_LEVELS.filter((p) => f.prices.includes(p.level)).map((p) => p.label), 'Cost');
  return many(DIETS.filter((d) => f.diets.includes(d.key)).map((d) => d.label), 'Dietary');
}
const isSet = (kind: FilterKind, f: MapFilters) =>
  kind === 'cuisine' ? f.cuisines.length > 0 : kind === 'rating' ? f.minRating != null : kind === 'cost' ? f.prices.length > 0 : f.diets.length > 0;

type Coords = { latitude: number; longitude: number };
type Hit = { key: string; restaurant: { id: string; name: string; latitude: number | null; longitude: number | null }; dish?: string };

// Restaurants whose name matches, then dishes whose name matches (with where they are).
async function search(term: string): Promise<Hit[]> {
  const like = `%${term.replace(/[%_]/g, '')}%`;
  const [places, dishes] = await Promise.all([
    supabase.from('restaurants').select('id, name, latitude, longitude').ilike('name', like).not('latitude', 'is', null).limit(6),
    supabase.from('dishes').select('id, name, restaurants!inner(id, name, latitude, longitude)').ilike('name', like)
      .eq('on_menu', true).gt('review_count', 0).order('avg_rating', { ascending: false }).limit(6)
      .returns<{ id: string; name: string; restaurants: Hit['restaurant'] }[]>(),
  ]);
  return [
    ...(places.data ?? []).map((r) => ({ key: `r${r.id}`, restaurant: r })),
    ...(dishes.data ?? []).map((d) => ({ key: `d${d.id}`, restaurant: d.restaurants, dish: d.name })),
  ];
}

export default function MapScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const map = useRef<RestaurantMapHandle>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  // Adding a missing place: the name being typed, while a pin sits in the middle of the map.
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const params = useLocalSearchParams<{ add?: string }>();
  const [me, setMe] = useState<Coords | null>(null);
  const [locationOff, setLocationOff] = useState(false);
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilters>(NO_FILTERS);
  const [sheet, setSheet] = useState<FilterKind | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const request = useRef(0);
  const region = useRef<Region | null>(null);
  const [wishlist, setWishlist] = useState<WishPlace[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const locate = useCallback(async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    setLocationOff(!granted);
    if (!granted) return;
    // A recent last-known position is instant; otherwise ask the phone where it is now.
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000 }))
      ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setMe(coords);
    map.current?.moveTo({ ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  }, []);

  // Every time the Map tab is opened, centre it on where you are.
  useFocusEffect(useCallback(() => {
    locate().catch(() => setLocationOff(true));
    loadWishlist().then(setWishlist);
  }, [locate]));

  // The closest restaurant on your wishlist, if one is a short walk away.
  const nearby = me ? wishlist
    .map((w) => {
      const r = w.restaurant;
      return r.latitude != null && r.longitude != null
        ? { w, km: distanceKm(me, { latitude: r.latitude, longitude: r.longitude }) } : null;
    })
    .filter((x): x is { w: WishPlace; km: number } => !!x && x.km <= NEARBY_KM && x.w.restaurant.id !== dismissed)
    .sort((a, b) => a.km - b.km)[0] ?? null : null;

  const load = useCallback(async (area: Region) => {
    region.current = area;
    const id = ++request.current;
    try {
      const found = await restaurantsIn(area, filters);
      if (id !== request.current) return;
      setRestaurants(found);
      setError(null);
      const rated = found.filter((r) => r.reviews > 0).map((r) => r.id).slice(0, 60);
      const pics = await coverPhotos(rated);
      if (id === request.current) setCovers(pics);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load restaurants');
    }
  }, [filters]);

  // Changing a filter reloads the part of the map you're looking at.
  useEffect(() => { if (region.current) load(region.current); }, [load]);

  const selected = restaurants.find((r) => r.id === selectedId) ?? null;

  // The selected restaurant's dishes with photos, one tile each (best liked photo), up to six.
  useEffect(() => {
    setPhotos([]);
    if (!selectedId) return;
    let live = true;
    restaurantPhotos(selectedId, 80).then((all) => {
      if (!live) return;
      const seen = new Set<string>();
      setPhotos(all.filter((p) => { const k = p.dishId ?? p.path; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6));
    });
    return () => { live = false; };
  }, [selectedId]);

  // Search as you type, a moment after you stop.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let live = true;
    const timer = setTimeout(() => { search(term).then((h) => { if (live) setHits(h); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  // Opened from Review with "Add it on the map": start adding with the name they searched for.
  useEffect(() => {
    if (params.add === undefined) return;
    setAdding(params.add);
    setSelectedId(null);
    router.setParams({ add: undefined });
  }, [params.add]);

  function startAdding() {
    setAdding(q.trim());
    setQ(''); setHits([]); setSelectedId(null);
  }

  async function saveNewPlace() {
    const at = region.current;
    if (adding === null || !at) return;
    setSaving(true);
    try {
      const id = await addRestaurant(adding, { latitude: at.latitude, longitude: at.longitude });
      setAdding(null);
      await load(at);
      setSelectedId(id);
    } catch (e) {
      Alert.alert((e as Error).message);
    }
    setSaving(false);
  }

  function openHit(h: Hit) {
    setQ(''); setHits([]);
    const { latitude, longitude } = h.restaurant;
    if (latitude == null || longitude == null) {
      router.push({ pathname: '/restaurant/[id]', params: { id: h.restaurant.id } });
      return;
    }
    map.current?.moveTo({ latitude, longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 });
    setSelectedId(h.restaurant.id);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <RestaurantMap
        ref={map}
        restaurants={restaurants}
        covers={covers}
        selectedId={selectedId}
        showUser={!locationOff}
        onSelect={setSelectedId}
        onRegionChange={load}
      />

      {adding !== null ? (
        <>
          {/* The new place goes where this pin points: move the map underneath it. */}
          <View pointerEvents="none" style={styles.crosshair}>
            <SymbolView name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} tintColor={t.accent} size={40}
              fallback={<View style={[styles.pinDot, { backgroundColor: t.accent }]} />} />
          </View>
          <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
            <View style={[styles.addCard, { backgroundColor: t.card, borderColor: t.line }]}>
              <Text style={{ color: t.ink, fontWeight: '800', fontSize: 17 }}>Add a missing place</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>Move the map so the pin sits on the restaurant, then add it.</Text>
              <TextInput value={adding} onChangeText={setAdding} placeholder="Restaurant name" placeholderTextColor={t.muted}
                autoFocus={!adding} autoCorrect={false} maxLength={80}
                style={[styles.addField, { color: t.ink, borderColor: t.line, backgroundColor: t.surface }]} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button variant="ghost" title="Cancel" onPress={() => setAdding(null)} /></View>
                <View style={{ flex: 1 }}>
                  <Button title="Add here" onPress={saveNewPlace} busy={saving} disabled={adding.trim().length < 2} />
                </View>
              </View>
            </View>
          </View>
        </>
      ) : null}

      <View style={[styles.top, { top: insets.top + 8 }, adding !== null && { display: 'none' }]} pointerEvents="box-none">
        <View style={[styles.search, { backgroundColor: t.card, borderColor: t.line }]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={t.muted} size={18} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search dishes or places" placeholderTextColor={t.muted}
            returnKeyType="search" autoCorrect={false} style={{ flex: 1, color: t.ink, fontSize: 16 }} />
          {q ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQ('')}>
              <Text style={{ color: t.muted, fontSize: 16, fontWeight: '700' }}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        {q.trim().length >= 2 ? (
          <View style={[styles.hits, { backgroundColor: t.card, borderColor: t.line }]}>
            <FlatList data={hits} keyExtractor={(h) => h.key} keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                <Pressable onPress={startAdding} style={styles.hit}>
                  <Text style={{ color: t.accent, fontWeight: '700' }} numberOfLines={1}>
                    {hits.length ? "Can't see it? " : ''}Add “{q.trim()}” to the map
                  </Text>
                </Pressable>
              }
              renderItem={({ item: h }) => (
                <Pressable onPress={() => openHit(h)} style={[styles.hit, { borderBottomColor: t.line }]}>
                  <Text style={{ color: t.ink, fontWeight: '700' }} numberOfLines={1}>{h.dish ?? h.restaurant.name}</Text>
                  {h.dish ? <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>at {h.restaurant.name}</Text> : null}
                </Pressable>
              )} />
          </View>
        ) : (
          <Chips style={{ marginHorizontal: -12, paddingHorizontal: 12 }}
            items={(['rating', 'cuisine', 'cost', 'dietary'] as const).map((kind) => ({
              key: kind, label: `${filterLabel(kind, filters)} ▾`, on: isSet(kind, filters), onPress: () => setSheet(kind),
            }))} />
        )}
        {nearby && !selected && q.trim().length < 2 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: nearby.w.restaurant.id } })}
            style={[styles.nudge, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentInk, flex: 1, fontSize: 14 }}>
              You're {formatDistance(nearby.km)} from{' '}
              {nearby.w.dishes.length ? (
                <>
                  {nearby.w.restaurant.name}. <Text style={{ fontWeight: '800' }}>{nearby.w.dishes[0].name}</Text>
                  {nearby.w.dishes.length > 1 ? ` and ${nearby.w.dishes.length - 1} more` : ''}{' '}
                  {nearby.w.dishes.length > 1 ? 'are' : 'is'} on your Want to try list.
                </>
              ) : (
                <><Text style={{ fontWeight: '800' }}>{nearby.w.restaurant.name}</Text>, which is on your Want to try list.</>
              )}
            </Text>
            <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={() => setDismissed(nearby.w.restaurant.id)}>
              <Text style={{ color: t.accentInk, fontSize: 16, fontWeight: '800' }}>✕</Text>
            </Pressable>
          </Pressable>
        ) : null}
        {(locationOff || error) && q.trim().length < 2 ? (
          <Text style={[styles.banner, { backgroundColor: t.card, color: error ? t.lo : t.muted }]}>
            {error ?? 'Location is off, so the map starts in central London.'}
          </Text>
        ) : null}
      </View>

      <View style={[styles.bottom, adding !== null && { display: 'none' }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show where I am"
          onPress={() => { locate().catch(() => setLocationOff(true)); }}
          style={[styles.locate, { backgroundColor: t.card, borderColor: t.line }]}>
          <SymbolView name={{ ios: 'location', android: 'near_me', web: 'near_me' }} tintColor={t.ink} size={20} />
        </Pressable>
        {selected ? (
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}>
            <View style={[styles.handle, { backgroundColor: t.line }]} />
            <View style={styles.cardRow}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.name, { color: t.ink }]} numberOfLines={1}>{selected.name}</Text>
                <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>
                  {selected.cuisine ? <Text style={{ fontStyle: 'italic' }}>{selected.cuisine} · </Text> : null}
                  {[me ? formatDistance(distanceKm(me, selected)) : null, priceLabel(selected.price_level), selected.postcode,
                    selected.reviews ? `${selected.reviews} review${selected.reviews === 1 ? '' : 's'}` : 'No reviews yet'].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {selected.rating != null ? <ScorePill rating={selected.rating} size="lg" /> : null}
            </View>
            {photos.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {photos.map((p) => (
                  <Pressable key={p.path} style={{ width: 112, gap: 6 }}
                    onPress={() => p.dishId
                      ? router.push({ pathname: '/dish/[id]', params: { id: p.dishId } })
                      : router.push({ pathname: '/comments/[id]', params: { id: p.reviewId } })}>
                    <View>
                      <Image source={{ uri: photoUrl(p.path) }} style={[styles.dishPhoto, { backgroundColor: t.line }]} contentFit="cover" />
                      <PhotoScore rating={p.rating} style={{ position: 'absolute', top: 6, left: 6 }} />
                    </View>
                    <Text style={{ color: t.ink, fontSize: 13 }} numberOfLines={1}>{p.dish}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="See every dish" onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: selected.id } })} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Directions" onPress={() => openDirections(selected)}
                style={[styles.directions, { borderColor: t.line }]}>
                <SymbolView name={{ ios: 'arrow.triangle.turn.up.right.diamond', android: 'directions', web: 'directions' }} tintColor={t.ink} size={22} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <MapFilterSheet kind={sheet} filters={filters} onChange={setFilters} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 50 },
  hits: { maxHeight: 320, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  hit: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  banner: { alignSelf: 'flex-start', fontSize: 13, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 10 },
  locate: { alignSelf: 'flex-end', width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, paddingTop: 8, gap: 14, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontWeight: '800', fontSize: 24, letterSpacing: -0.4 },
  dishPhoto: { width: 112, height: 80, borderRadius: 12 },
  directions: { width: 52, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  crosshair: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  pinDot: { width: 18, height: 18, borderRadius: 9 },
  addCard: { gap: 10, padding: 14, borderRadius: 20, borderWidth: 1 },
  addField: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14 },
});
