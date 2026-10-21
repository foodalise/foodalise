import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { LONDON, type MapRestaurant, type Region } from '@/lib/places';
import { photoUrl } from '@/lib/supabase';

export type RestaurantMapHandle = { moveTo: (region: Region) => void };

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
      {restaurants.map((r) => {
        const selected = r.id === selectedId;
        const cover = covers[r.id];
        return cover ? (
          <PhotoPin key={`${r.id}-${selected}`} restaurant={r} path={cover} selected={selected} onPress={() => onSelect(r.id)} />
        ) : (
          <Marker
            // Re-mount when selection changes so the pin redraws with tracking off.
            key={`${r.id}-${selected}`}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
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
function PhotoPin({ restaurant: r, path, selected, onPress }: {
  restaurant: MapRestaurant; path: string; selected: boolean; onPress: () => void;
}) {
  const t = useTheme();
  const [loaded, setLoaded] = useState(false);
  const size = selected ? 64 : 50;
  return (
    <Marker coordinate={{ latitude: r.latitude, longitude: r.longitude }} tracksViewChanges={!loaded}
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
