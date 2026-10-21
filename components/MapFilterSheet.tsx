import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { CUISINES, DIETS, PRICE_LEVELS } from '@/lib/cuisines';
import type { MapFilters } from '@/lib/places';

export type FilterKind = 'cuisine' | 'rating' | 'cost' | 'dietary';

const TITLES: Record<FilterKind, string> = { cuisine: 'Cuisine', rating: 'Rating', cost: 'Cost', dietary: 'Dietary' };
const RATINGS = [6, 7, 8, 9];

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// A sheet from the bottom of the map for choosing one kind of filter.
export function MapFilterSheet({ kind, filters, onChange, onClose }: {
  kind: FilterKind | null; filters: MapFilters; onChange: (f: MapFilters) => void; onClose: () => void;
}) {
  const t = useTheme();
  const chip = (label: string, on: boolean, onPress: () => void, hint?: string) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : 'transparent' }]}>
      <Text style={{ color: on ? t.surface : t.ink, fontWeight: '600' }}>{label}</Text>
      {hint ? <Text style={{ color: on ? t.surface : t.muted, fontSize: 11 }}>{hint}</Text> : null}
    </Pressable>
  );

  let options = null;
  let clear: MapFilters = filters;
  if (kind === 'cuisine') {
    options = CUISINES.map((c) => chip(c, filters.cuisines.includes(c), () => onChange({ ...filters, cuisines: toggle(filters.cuisines, c) })));
    clear = { ...filters, cuisines: [] };
  } else if (kind === 'rating') {
    options = [chip('Any', filters.minRating == null, () => onChange({ ...filters, minRating: null })),
      ...RATINGS.map((r) => chip(`${r}+`, filters.minRating === r, () => onChange({ ...filters, minRating: r })))];
    clear = { ...filters, minRating: null };
  } else if (kind === 'cost') {
    options = PRICE_LEVELS.map((p) => chip(p.label, filters.prices.includes(p.level), () => onChange({ ...filters, prices: toggle(filters.prices, p.level) }), p.hint));
    clear = { ...filters, prices: [] };
  } else if (kind === 'dietary') {
    options = DIETS.map((d) => chip(d.label, filters.diets.includes(d.key), () => onChange({ ...filters, diets: toggle(filters.diets, d.key) })));
    clear = { ...filters, diets: [] };
  }

  return (
    <Modal visible={kind != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line }]}>
        <Text style={[styles.title, { color: t.ink }]}>{kind ? TITLES[kind] : ''}</Text>
        {kind === 'rating' ? <Text style={{ color: t.muted }}>Average score of every review there.</Text> : null}
        {kind === 'dietary' ? <Text style={{ color: t.muted }}>Restaurants with dishes marked this way on their menu.</Text> : null}
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.options}>{options}</ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button variant="ghost" title="Clear" onPress={() => onChange(clear)} /></View>
          <View style={{ flex: 1 }}><Button title="Done" onPress={onClose} /></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { padding: 16, paddingBottom: 34, gap: 12, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
});
