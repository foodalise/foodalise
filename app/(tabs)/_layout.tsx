import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';

import { Wordmark } from '@/components/Logo';
import { NotificationBell } from '@/components/NotificationBell';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useTheme } from '@/constants/theme';

function icon(name: SymbolViewProps['name']) {
  return ({ color }: { color: ColorValue }) => <SymbolView name={name} tintColor={color} size={24} />;
}

// The middle tab: an orange square with a plus, for reviewing a dish.
// It has no label, so it's nudged down to sit level with the other tabs' icon and label together.
function AddIcon() {
  const t = useTheme();
  return (
    <View style={{ width: 64, height: 42, borderRadius: 15, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: 7 }] }}>
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={t.accentInk} size={28} weight="bold" />
    </View>
  );
}

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarLabelStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: t.surface },
        headerTitleStyle: { fontWeight: '800', color: t.ink, fontSize: 22 },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Feed', headerTitle: () => <Wordmark size={24} />, headerRight: () => <NotificationBell />, tabBarIcon: icon({ ios: 'house', android: 'home', web: 'home' }) }} />
      <Tabs.Screen name="map" options={{ title: 'Map', headerShown: false, tabBarIcon: icon({ ios: 'map', android: 'map', web: 'map' }) }} />
      <Tabs.Screen name="review" options={{ title: 'Review', headerTitle: 'Review a dish', tabBarLabel: () => null, tabBarAccessibilityLabel: 'Review a dish', tabBarIcon: () => <AddIcon /> }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: icon({ ios: 'magnifyingglass', android: 'search', web: 'search' }) }} />
      <Tabs.Screen name="profile" options={{ title: 'You', headerShown: false, tabBarIcon: icon({ ios: 'person', android: 'person', web: 'person' }) }} />
    </Tabs>
  );
}
