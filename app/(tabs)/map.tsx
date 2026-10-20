import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RestaurantMap, type RestaurantMapHandle } from '@/components/RestaurantMap';
import { Button, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { distanceKm, formatDistance, restaurantsIn, type MapRestaurant, type Region } from '@/lib/places';

type Coords = { latitude: number; longitude: number };

export default function MapScreen() {
  const t = useTheme();
  const map = useRef<RestaurantMapHandle>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [locationOff, setLocationOff] = useState(false);
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const locate = useCallback(async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    setLocationOff(!granted);
    if (!granted) return;
    const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync());
    const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setMe(coords);
    map.current?.moveTo({ ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  }, []);

  useEffect(() => { locate().catch(() => setLocationOff(true)); }, [locate]);

  const load = useCallback(async (region: Region) => {
    const id = ++request.current;
    try {
      const found = await restaurantsIn(region);
      if (id !== request.current) return;
      setRestaurants(found);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load restaurants');
    }
  }, []);

  const selected = restaurants.find((r) => r.id === selectedId) ?? null;

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
        {locationOff || error ? (
          <Text style={[styles.banner, { backgroundColor: t.surface, color: error ? t.lo : t.muted }]}>
            {error ?? 'Location is off, so the map starts in central London.'}
          </Text>
        ) : <View />}
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
              <Text style={[styles.name, { color: t.ink }]} numberOfLines={1}>{selected.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                {[me ? formatDistance(distanceKm(me, selected)) : null, selected.address, selected.postcode].filter(Boolean).join(' · ')}
              </Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {selected.reviews ? `${selected.reviews} review${selected.reviews === 1 ? '' : 's'}` : 'No reviews yet'}
              </Text>
            </View>
            <ScorePill rating={selected.rating} />
          </View>
          <Button title="See the menu" onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: selected.id } })} />
        </View>
      ) : null}
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
});
