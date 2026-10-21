import { Alert, Linking } from 'react-native';

type Place = { name: string; latitude?: number | null; longitude?: number | null; address?: string | null; postcode?: string | null };

// Opens turn-by-turn directions to a restaurant in Apple Maps or Google Maps.
// Google Maps opens in its app if it's installed, otherwise in the browser.
export function openDirections(place: Place) {
  const to = place.latitude != null && place.longitude != null
    ? `${place.latitude},${place.longitude}`
    : [place.name, place.address, place.postcode].filter(Boolean).join(', ');
  const apple = `https://maps.apple.com/?daddr=${encodeURIComponent(to)}&q=${encodeURIComponent(place.name)}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}`;
  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert("Couldn't open maps."));
  Alert.alert(`Directions to ${place.name}`, undefined, [
    { text: 'Apple Maps', onPress: () => open(apple) },
    { text: 'Google Maps', onPress: () => open(google) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function priceLabel(level: number | null | undefined) {
  return level ? '£'.repeat(level) : null;
}
