import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { LONDON, spotKey, spotmates, type MapRestaurant, type Region } from '@/lib/places';
import { photoUrl } from '@/lib/supabase';

export type RestaurantMapHandle = { moveTo: (region: Region) => void };

type LatLng = { latitude: number; longitude: number };

type Props = {
  restaurants: MapRestaurant[];
  covers: Record<string, string>; // restaurant id -> a food photo, shown as its pin
  selectedId: string | null;
  showUser: boolean;
  onSelect: (id: string | null) => void;
  onRegionChange: (region: Region) => void;
};

export const RestaurantMap = forwardRef<RestaurantMapHandle, Props>(function RestaurantMap(
  { restaurants, covers, selectedId, showUser, onSelect, onRegionChange }, ref) {
  const t = useTheme();
  const map = useRef<MapView>(null);
  // A move asked for before the map has loaded is ignored by the map, so hold it until it's ready.
  const ready = useRef(false);
  const pending = useRef<Region | null>(null);
  // One pin per spot: the selected place if it's there, otherwise the best reviewed.
  const pins = new Map<string, { r: MapRestaurant; count: number }>();
  for (const r of restaurants) {
    const key = spotKey(r);
    if (pins.has(key)) continue;
    const here = spotmates(restaurants, r);
    pins.set(key, { r: here.find((x) => x.id === selectedId) ?? here[0], count: here.length });
  }
  useImperativeHandle(ref, () => ({
    moveTo: (region) => {
      if (ready.current) map.current?.animateToRegion(region, 400);
      else pending.current = region;
    },
  }));

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={LONDON}
      onMapReady={() => {
        ready.current = true;
        if (pending.current) map.current?.animateToRegion(pending.current, 0);
        pending.current = null;
      }}
      userInterfaceStyle="dark"
      showsUserLocation={showUser}
      showsPointsOfInterests={false}
      onRegionChangeComplete={onRegionChange}
      onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') onSelect(null); }}>
      {[...pins.values()].map(({ r, count }) => {
        const selected = r.id === selectedId;
        const cover = covers[r.id];
        const coordinate = { latitude: r.latitude, longitude: r.longitude };
        // Re-mount when the pin changes so it redraws with tracking off.
        const key = `${spotKey(r)}-${r.id}-${selected}-${count}`;
        return cover ? (
          <PhotoPin key={key} restaurant={r} coordinate={coordinate} count={count} path={cover} selected={selected} onPress={() => onSelect(r.id)} />
        ) : (
          <Marker key={key} coordinate={coordinate} tracksViewChanges={false} zIndex={selected ? 3 : 1} onPress={() => onSelect(r.id)}>
            <View style={styles.pinWrap}>
              <View style={[styles.pin, { backgroundColor: selected ? t.accent : t.card, borderColor: selected ? t.accent : t.line }]}>
                <Text style={[styles.pinText, { color: selected ? t.accentInk : r.rating != null ? scoreColor(t, r.rating) : t.muted }]}>
                  {formatScore(r.rating)}
                </Text>
              </View>
              {count > 1 ? <Count n={count} /> : null}
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
});

// A restaurant with photos: a round food photo in an orange ring, its score underneath.
// The marker keeps redrawing until the photo has loaded, then stops to save battery.
function PhotoPin({ restaurant: r, coordinate, count, path, selected, onPress }: {
  restaurant: MapRestaurant; coordinate: LatLng; count: number; path: string; selected: boolean; onPress: () => void;
}) {
  const t = useTheme();
  const [loaded, setLoaded] = useState(false);
  const size = selected ? 64 : 50;
  return (
    <Marker coordinate={coordinate} tracksViewChanges={!loaded}
      zIndex={selected ? 3 : 2} onPress={onPress} anchor={{ x: 0.5, y: 0.5 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.photoRing, { width: size, height: size, borderRadius: size / 2, borderColor: t.accent, backgroundColor: t.card }]}>
          <Image source={{ uri: photoUrl(path) }} style={{ width: '100%', height: '100%' }} contentFit="cover"
            onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
        </View>
        <View style={[styles.photoScore, { backgroundColor: t.accent }]}>
          <Text style={[styles.pinText, { color: t.accentInk, fontSize: 12 }]}>{formatScore(r.rating)}</Text>
        </View>
        {count > 1 ? <Count n={count} /> : null}
      </View>
    </Marker>
  );
}

// How many places share this spot, on the pin's top-right corner.
function Count({ n }: { n: number }) {
  const t = useTheme();
  return (
    <View style={[styles.count, { backgroundColor: t.ink, borderColor: t.bg }]}>
      <Text style={{ color: t.bg, fontWeight: '800', fontSize: 11 }}>{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photoRing: { borderWidth: 3, overflow: 'hidden' },
  photoScore: { marginTop: -10, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pin: { minWidth: 34, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, alignItems: 'center' },
  pinText: { fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  pinWrap: { paddingTop: 8, paddingRight: 10 },
  count: { position: 'absolute', top: 0, right: 0, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
});
