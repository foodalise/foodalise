import { forwardRef, useEffect } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { LONDON, type MapRestaurant, type Region } from '@/lib/places';

export type RestaurantMapHandle = { moveTo: (region: Region) => void };

type Props = {
  restaurants: MapRestaurant[];
  covers: Record<string, string>;
  selectedId: string | null;
  showUser: boolean;
  onSelect: (id: string | null) => void;
  onRegionChange: (region: Region) => void;
};

// The native map isn't available on web; the app is built for phones.
export const RestaurantMap = forwardRef<RestaurantMapHandle, Props>(function RestaurantMap({ onRegionChange }, _ref) {
  const t = useTheme();
  useEffect(() => { onRegionChange(LONDON); }, [onRegionChange]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <Text style={{ color: t.muted }}>The map is available in the phone app.</Text>
    </View>
  );
});
