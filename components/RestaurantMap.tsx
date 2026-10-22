import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { LONDON, type MapRestaurant, type Region } from '@/lib/places';
import { photoUrl } from '@/lib/supabase';

export type RestaurantMapHandle = { moveTo: (region: Region) => void };

type LatLng = { latitude: number; longitude: number };

// The FSA places every business at its postcode's centre, so places sharing a postcode
// (a parade of shops, a food court) land on exactly the same spot and only the top pin
// can be seen or tapped. Places on the same spot are fanned out in a small circle,
// sized to the zoom so the pins don't overlap, and close back up as you zoom out.
function spread(restaurants: MapRestaurant[], span: number): Record<string, LatLng> {
  const groups = new Map<string, MapRestaurant[]>();
  for (const r of restaurants) {
    const key = `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`; // within about 10m
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const spots: Record<string, LatLng> = {};
  for (const group of groups.values()) {
    if (group.length === 1) {
      spots[group[0].id] = { latitude: group[0].latitude, longitude: group[0].longitude };
      continue;
    }
    const lat = group.reduce((s, r) => s + r.latitude, 0) / group.length;
    const lng = group.reduce((s, r) => s + r.longitude, 0) / group.length;
    // About a pin's width at this zoom, wider when many share the spot.
    const radius = span * 0.05 * Math.max(1, group.length / 6);
    const lngScale = Math.cos((lat * Math.PI) / 180);
    [...group].sort((a, b) => a.id.localeCompare(b.id)).forEach((r, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      spots[r.id] = { latitude: lat + radius * Math.sin(angle), longitude: lng + (radius * Math.cos(angle)) / lngScale };
    });
  }
  return spots;
}

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
  const [span, setSpan] = useState(LONDON.latitudeDelta);
  const spots = spread(restaurants, span);
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
      onRegionChangeComplete={(region) => { setSpan(region.latitudeDelta); onRegionChange(region); }}
      onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') onSelect(null); }}>
      {restaurants.map((r) => {
        const selected = r.id === selectedId;
        const cover = covers[r.id];
        return cover ? (
          <PhotoPin key={`${r.id}-${selected}`} restaurant={r} coordinate={spots[r.id]} path={cover} selected={selected} onPress={() => onSelect(r.id)} />
        ) : (
          <Marker
            // Re-mount when selection changes so the pin redraws with tracking off.
            key={`${r.id}-${selected}`}
            coordinate={spots[r.id]}
            tracksViewChanges={false}
            zIndex={selected ? 3 : 1}
            onPress={() => onSelect(r.id)}>
            <View style={[styles.pin, { backgroundColor: selected ? t.accent : t.card, borderColor: selected ? t.accent : t.line }]}>
              <Text style={[styles.pinText, { color: selected ? t.accentInk : r.rating != null ? scoreColor(t, r.rating) : t.muted }]}>
                {formatScore(r.rating)}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
});

// A restaurant with photos: a round food photo in an orange ring, its score underneath.
// The marker keeps redrawing until the photo has loaded, then stops to save battery.
function PhotoPin({ restaurant: r, coordinate, path, selected, onPress }: {
  restaurant: MapRestaurant; coordinate: LatLng; path: string; selected: boolean; onPress: () => void;
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
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  photoRing: { borderWidth: 3, overflow: 'hidden' },
  photoScore: { marginTop: -10, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pin: { minWidth: 34, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, alignItems: 'center' },
  pinText: { fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
});
