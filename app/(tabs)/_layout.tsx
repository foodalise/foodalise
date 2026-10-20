import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useTheme } from '@/constants/theme';

function icon(name: SymbolViewProps['name']) {
  return ({ color }: { color: ColorValue }) => <SymbolView name={name} tintColor={color} size={24} />;
}

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        headerStyle: { backgroundColor: t.surface },
        headerTitleStyle: { fontWeight: '800', color: t.ink },
        headerShadowVisible: false,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Feed', headerTitle: 'foodalise', tabBarIcon: icon({ ios: 'house', android: 'home', web: 'home' }) }} />
      <Tabs.Screen name="map" options={{ title: 'Map', headerTitle: 'Near you', tabBarIcon: icon({ ios: 'map', android: 'map', web: 'map' }) }} />
      <Tabs.Screen name="review" options={{ title: 'Review', headerTitle: 'Review a dish', tabBarIcon: icon({ ios: 'plus.square', android: 'add_box', web: 'add_box' }) }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: icon({ ios: 'magnifyingglass', android: 'search', web: 'search' }) }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: icon({ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }) }} />
    </Tabs>
  );
}
