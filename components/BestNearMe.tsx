import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chips, Empty, Field, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { DIETS } from '@/lib/cuisines';
import { photoUrl, supabase } from '@/lib/supabase';

type BestDish = {
  dish_id: string; dish_name: string; restaurant_id: string; restaurant_name: string;
  avg_rating: number; review_count: number; distance_km: number; photo_path: string | null;
};

const DISTANCES = [
  { key: '1', label: '1 mile', km: 1.6 },
  { key: '3', label: '3 miles', km: 4.8 },
  { key: '10', label: '10 miles', km: 16 },
];

function miles(km: number) {
  const m = km / 1.609;
  return m < 0.1 ? 'next door' : `${m < 10 ? m.toFixed(1) : Math.round(m)} mi`;
}

// The top-rated dishes around you, dish first: search "burger" and see the best
// burgers within a mile. `header` is the Explore tabs, shown above the search.
export function BestNearMe({ header }: { header: ReactElement }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [distance, setDistance] = useState(DISTANCES[0]);
  const [diet, setDiet] = useState<string | null>(null);
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const [dishes, setDishes] = useState<BestDish[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) { setNoLocation(true); return; }
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000 }))
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })().catch(() => setNoLocation(true));
  }, []);

  useEffect(() => {
    if (!here) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('best_dishes_near', {
        lat: here.latitude, lng: here.longitude, km: distance.km, term: q.trim() || null, max_rows: 40, diet,
      });
      if (cancelled) return;
      setError(error ? "Couldn't load dishes. Check your connection." : null);
      setDishes((data as BestDish[] | null) ?? []);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [here, distance, q, diet]);

  const top = (
    <View style={{ gap: 10, marginBottom: 8 }}>
      {header}
      <Field placeholder="Try burger, curry, pizza…" value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="none" />
      <Chips items={DISTANCES.map((d) => ({ key: d.key, label: d.label, on: d.key === distance.key, onPress: () => setDistance(d) }))} />
      <Chips items={DIETS.map((d) => ({ key: d.key, label: d.label, on: diet === d.key, onPress: () => setDiet(diet === d.key ? null : d.key) }))} />
      {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
    </View>
  );

  const empty = noLocation
    ? <Empty title="Turn on location" body="Best near me needs your location to find dishes around you. You can switch it on in Settings." />
    : dishes === null ? undefined
    : diet
      ? <Empty title="Nothing reviewed nearby yet" body="Try a bigger distance, or turn off the diet filter. Diets come from restaurant menus, so some places may be missing." />
    : q.trim()
      ? <Empty title={`No ${q.trim()} reviewed nearby yet`} body="Try a bigger distance, or be the first to review one." />
      : <Empty title="No dishes reviewed nearby yet" body="Try a bigger distance, or be the first to review a dish around here." />;

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={top}
      data={dishes ?? []}
      keyExtractor={(d) => d.dish_id}
      renderItem={({ item, index }) => (
        <Pressable onPress={() => router.push({ pathname: '/dish/[id]', params: { id: item.dish_id } })}
          style={({ pressed }) => [styles.row, { borderBottomColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.rank, { color: index < 3 ? t.accent : t.muted }]}>{index + 1}</Text>
          {item.photo_path
            ? <Image source={{ uri: photoUrl(item.photo_path) }} style={[styles.photo, { backgroundColor: t.card }]} contentFit="cover" />
            : <View style={[styles.photo, { backgroundColor: t.card }]} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{item.dish_name}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
              {item.restaurant_name} · {miles(item.distance_km)}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {item.review_count} {item.review_count === 1 ? 'review' : 'reviews'}
            </Text>
          </View>
          <ScorePill rating={Number(item.avg_rating)} />
        </Pressable>
      )}
      ListEmptyComponent={empty}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 20, fontWeight: '800', fontSize: 15, textAlign: 'center' },
  photo: { width: 64, height: 64, borderRadius: 12 },
});
