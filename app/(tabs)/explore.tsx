import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, Field } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';

export default function Explore() {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.from('restaurants')
        .select('id, name, address, postcode, hygiene_rating, menu_source')
        .ilike('name', `%${term.replace(/[%_]/g, '')}%`).order('name').limit(40);
      if (cancelled) return;
      setError(error ? error.message : null);
      setResults(data ?? []);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q]);

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 8 }}>
          <Field placeholder="Search a restaurant" value={q} onChangeText={setQ} autoCorrect={false} />
          {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
        </View>
      }
      data={results}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/restaurant/[id]', params: { id: item.id } }} asChild>
          <Pressable style={StyleSheet.flatten([styles.row, { borderBottomColor: t.line }])}>
            <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}>{item.name}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{[item.address, item.postcode].filter(Boolean).join(', ')}</Text>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={q.trim().length >= 2 ? <Empty title="No restaurants found" body="Try a shorter name." /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
});
