import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { LONDON, type MapRestaurant, type Region } from '@/lib/places';

export type RestaurantMapHandle = { moveTo: (region: Region) => void };

type Props = {
  restaurants: MapRestaurant[];
  selectedId: string | null;
  showUser: boolean;
  onSelect: (id: string | null) => void;
  onRegionChange: (region: Region) => void;
};

export const RestaurantMap = forwardRef<RestaurantMapHandle, Props>(function RestaurantMap(
  { restaurants, selectedId, showUser, onSelect, onRegionChange }, ref) {
  const t = useTheme();
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({ moveTo: (region) => map.current?.animateToRegion(region, 400) }));

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={LONDON}
      showsUserLocation={showUser}
      showsPointsOfInterests={false}
      onRegionChangeComplete={onRegionChange}
      onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') onSelect(null); }}>
      {restaurants.map((r) => {
        const selected = r.id === selectedId;
        const color = scoreColor(t, r.rating);
        return (
          <Marker
            // Re-mount when selection changes so the pin redraws with tracking off.
            key={`${r.id}-${selected}`}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
            tracksViewChanges={false}
            zIndex={selected ? 2 : 1}
            onPress={() => onSelect(r.id)}>
            <View style={[styles.pin, { backgroundColor: selected ? color : t.surface, borderColor: color }]}>
              <Text style={[styles.pinText, { color: selected ? t.surface : color }]}>{formatScore(r.rating)}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  pin: { minWidth: 34, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, borderWidth: 2, alignItems: 'center' },
  pinText: { fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
});
