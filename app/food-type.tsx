import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FoodBadge } from '@/components/FoodBadge';
import { useTheme } from '@/constants/theme';
import { CUISINES } from '@/lib/cuisines';
import { supabase } from '@/lib/supabase';

// For admins: pick the right food type when the app's guess is wrong. "Let the
// app decide" clears the fix and goes back to the menu, OpenStreetMap or name.
export default function FoodTypeScreen() {
  const t = useTheme();
  const { id, current } = useLocalSearchParams<{ id: string; current?: string }>();
  const [saving, setSaving] = useState(false);

  async function pick(kind: string | null) {
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_food_type', { rid: id, kind });
    setSaving(false);
    if (error) Alert.alert(error.message);
    else router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Food type' }} />
      <FlatList
        style={{ backgroundColor: t.surface }}
        contentContainerStyle={{ padding: 16 }}
        data={[null, ...CUISINES]}
        keyExtractor={(k) => k ?? 'auto'}
        renderItem={({ item }) => (
          <Pressable disabled={saving} onPress={() => pick(item)} style={[styles.row, { borderBottomColor: t.line }]}>
            <FoodBadge type={item} size={34} />
            <Text style={{ flex: 1, color: t.ink, fontSize: 16, fontWeight: item === current ? '800' : '500' }}>
              {item ?? 'Let the app decide'}
            </Text>
            {item === current ? <Text style={{ color: t.accent, fontWeight: '800' }}>✓</Text> : null}
          </Pressable>
        )}
        ListHeaderComponent={<View style={{ marginBottom: 4 }}><Text style={{ color: t.muted }}>Shown next to the name and on the map.</Text></View>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
