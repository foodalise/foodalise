import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MapFilterSheet, type FilterKind } from '@/components/MapFilterSheet';
import type { GalleryPhoto } from '@/components/PhotoGallery';
import { RestaurantMap, type RestaurantMapHandle } from '@/components/RestaurantMap';
import { Button, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { DIETS, PRICE_LEVELS } from '@/lib/cuisines';
import { openDirections, priceLabel } from '@/lib/directions';
import { restaurantPhotos } from '@/lib/photos';
import { distanceKm, formatDistance, NO_FILTERS, restaurantsIn, type MapFilters, type MapRestaurant, type Region } from '@/lib/places';
import { photoUrl } from '@/lib/supabase';
import { loadWishlist, type WishDish } from '@/lib/wishlist';

const NEARBY_KM = 0.8; // how close a wishlist dish must be to get a nudge

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

export default function MapScreen() {
  const t = useTheme();
  const map = useRef<RestaurantMapHandle>(null);
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
  const [wishlist, setWishlist] = useState<WishDish[]>([]);
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

  // The closest dish on your wishlist, if one is a short walk away.
  const nearby = me ? wishlist
    .map((w) => {
      const r = w.dishes?.restaurants;
      return r?.latitude != null && r.longitude != null
        ? { w, km: distanceKm(me, { latitude: r.latitude, longitude: r.longitude }) } : null;
    })
    .filter((x): x is { w: WishDish; km: number } => !!x && x.km <= NEARBY_KM && x.w.dish_id !== dismissed)
    .sort((a, b) => a.km - b.km)[0] ?? null : null;

  const load = useCallback(async (area: Region) => {
    region.current = area;
    const id = ++request.current;
    try {
      const found = await restaurantsIn(area, filters);
      if (id !== request.current) return;
      setRestaurants(found);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load restaurants');
    }
  }, [filters]);

  // Changing a filter reloads the part of the map you're looking at.
  useEffect(() => { if (region.current) load(region.current); }, [load]);

  const selected = restaurants.find((r) => r.id === selectedId) ?? null;

  // Up to six photos of the selected restaurant's food, for a quick look.
  useEffect(() => {
    setPhotos([]);
    if (!selectedId) return;
    let live = true;
    restaurantPhotos(selectedId, 60).then((p) => { if (live) setPhotos(p.slice(0, 6)); });
    return () => { live = false; };
  }, [selectedId]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <RestaurantMap
        ref={map}
        restaurants={restaurants}
        selectedId={selectedId}
        showUser={!locationOff}
        onSelect={setSelectedId}
        onRegionChange={load}
      />

      <View style={styles.top} pointerEvents="box-none">
        <View style={{ flex: 1, gap: 8 }} pointerEvents="box-none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {(['cuisine', 'rating', 'cost', 'dietary'] as const).map((kind) => {
              const on = isSet(kind, filters);
              return (
                <Pressable key={kind} accessibilityRole="button" onPress={() => setSheet(kind)}
                  style={[styles.filter, { backgroundColor: on ? t.ink : t.surface, borderColor: on ? t.ink : t.line }]}>
                  <Text style={{ color: on ? t.surface : t.ink, fontWeight: '600', fontSize: 13 }}>{filterLabel(kind, filters)} ▾</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {nearby && !selected ? (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/dish/[id]', params: { id: nearby.w.dish_id } })}
              style={[styles.nudge, { backgroundColor: t.ink }]}>
              <Text style={{ color: t.surface, flex: 1, fontSize: 14 }}>
                You're {formatDistance(nearby.km)} from {nearby.w.dishes?.restaurants?.name}.{' '}
                <Text style={{ fontWeight: '800' }}>{nearby.w.dishes?.name}</Text> is on your Want to try list.
              </Text>
              <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={() => setDismissed(nearby.w.dish_id)}>
                <Text style={{ color: t.surface, fontSize: 16, fontWeight: '800' }}>✕</Text>
              </Pressable>
            </Pressable>
          ) : null}
          {locationOff || error ? (
            <Text style={[styles.banner, { backgroundColor: t.surface, color: error ? t.lo : t.muted }]}>
              {error ?? 'Location is off, so the map starts in central London.'}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show where I am"
          onPress={() => { locate().catch(() => setLocationOff(true)); }}
          style={[styles.locate, { backgroundColor: t.surface, borderColor: t.line }]}>
          <SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} tintColor={t.ink} size={20} />
        </Pressable>
      </View>

      {selected ? (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.name, { color: t.ink }]} numberOfLines={1}>
                {selected.name}
                {selected.cuisine ? <Text style={[styles.cuisine, { color: t.muted }]}>  {selected.cuisine}</Text> : null}
              </Text>
              <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                {[me ? formatDistance(distanceKm(me, selected)) : null, priceLabel(selected.price_level), selected.address, selected.postcode].filter(Boolean).join(' · ')}
              </Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {selected.reviews ? `${selected.reviews} review${selected.reviews === 1 ? '' : 's'}` : 'No reviews yet'}
              </Text>
            </View>
            <ScorePill rating={selected.rating} />
          </View>
          {photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {photos.map((p) => (
                <Pressable key={p.path} accessibilityLabel={p.dish}
                  onPress={() => router.push({ pathname: '/comments/[id]', params: { id: p.reviewId } })}>
                  <Image source={{ uri: photoUrl(p.path) }} style={[styles.photo, { backgroundColor: t.line }]} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="See the menu" onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: selected.id } })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Directions" variant="ghost" onPress={() => openDirections(selected)} />
            </View>
          </View>
        </View>
      ) : null}

      <MapFilterSheet kind={sheet} filters={filters} onChange={setFilters} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  banner: { flexShrink: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  locate: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, padding: 14, gap: 12, borderRadius: 16, borderWidth: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontWeight: '800', fontSize: 17 },
  cuisine: { fontWeight: '400', fontSize: 14, fontStyle: 'italic' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  photo: { width: 84, height: 84, borderRadius: 10 },
});
