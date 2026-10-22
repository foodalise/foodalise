import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BestNearMe } from '@/components/BestNearMe';
import { Button, Empty, Field, Segmented } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { inviteFriends } from '@/lib/invite';
import { supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';

type Mode = 'best' | 'restaurants' | 'people';
type Person = { id: string; username: string };

// The best dishes near you, a restaurant search, or people to follow (whose
// reviews then fill your Feed).
export default function Explore() {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const [mode, setMode] = useState<Mode>('best');
  const [q, setQ] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Who you already follow, so each person shows Follow or Following.
  useEffect(() => {
    if (!me) return;
    supabase.from('follows').select('following_id').eq('follower_id', me)
      .then(({ data }) => setFollowing(new Set((data ?? []).map((f) => f.following_id))));
  }, [me, mode]);

  useEffect(() => {
    const term = q.trim().replace(/[%_]/g, '').replace(/^@/, '');
    if (term.length < 2) { setRestaurants([]); setPeople([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (mode === 'best') return;
      if (mode === 'restaurants') {
        const { data, error } = await supabase.from('restaurants')
          .select('id, name, address, postcode, hygiene_rating, menu_source')
          .ilike('name', `%${term}%`).order('name').limit(40);
        if (cancelled) return;
        setError(error ? error.message : null);
        setRestaurants(data ?? []);
      } else {
        const { data, error } = await supabase.from('profiles').select('id, username')
          .ilike('username', `%${term.toLowerCase()}%`).neq('id', me ?? '').order('username').limit(40);
        if (cancelled) return;
        setError(error ? error.message : null);
        setPeople(data ?? []);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, mode, me]);

  async function invite() {
    if (!me) return;
    const { data } = await supabase.from('profiles').select('username').eq('id', me).maybeSingle();
    inviteFriends(me, data?.username ?? null);
  }

  async function toggleFollow(person: Person) {
    if (!me) return;
    const on = following.has(person.id);
    const { error } = on
      ? await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', person.id)
      : await supabase.from('follows').insert({ follower_id: me, following_id: person.id });
    if (error) { setError(error.message); return; }
    setFollowing((prev) => {
      const next = new Set(prev);
      if (on) next.delete(person.id); else next.add(person.id);
      return next;
    });
  }

  const searched = q.trim().replace(/^@/, '').length >= 2;
  const tabs = (
    <Segmented value={mode} onChange={(m) => { setMode(m); setError(null); }}
      options={[{ value: 'best', label: 'Best near me' }, { value: 'restaurants', label: 'Restaurants' }, { value: 'people', label: 'People' }]} />
  );
  const header = (
    <View style={{ gap: 10, marginBottom: 8 }}>
      {tabs}
      <Field placeholder={mode === 'restaurants' ? 'Search a restaurant' : 'Search a username'} value={q} onChangeText={setQ}
        autoCorrect={false} autoCapitalize="none" />
      {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
    </View>
  );

  if (mode === 'best') return <BestNearMe header={tabs} />;

  if (mode === 'people') {
    return (
      <FlatList
        style={{ backgroundColor: t.surface }}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        data={people}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const on = following.has(item.id);
          return (
            <View style={[styles.person, { borderBottomColor: t.line }]}>
              <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
                <View style={[styles.avatar, { backgroundColor: t.accent }]}>
                  <Text style={{ color: t.accentInk, fontWeight: '700' }}>{item.username[0]?.toUpperCase()}</Text>
                </View>
                <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>@{item.username}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => toggleFollow(item)}
                style={[styles.follow, on ? { borderColor: t.line } : { backgroundColor: t.accent, borderColor: t.accent }]}>
                <Text style={{ color: on ? t.ink : t.accentInk, fontWeight: '700', fontSize: 13 }}>{on ? 'Following' : 'Follow'}</Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={searched ? <Empty title="Nobody found" body="Check the spelling of their username." />
          : (
            <View style={{ gap: 12 }}>
              <Empty title="Find your friends" body="Search a username to follow them. Their reviews will show in your Feed." />
              <Button title="Invite friends" onPress={invite} />
            </View>
          )}
      />
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      data={restaurants}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/restaurant/[id]', params: { id: item.id } }} asChild>
          <Pressable style={StyleSheet.flatten([styles.row, { borderBottomColor: t.line }])}>
            <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}>{item.name}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{[item.address, item.postcode].filter(Boolean).join(', ')}</Text>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={searched ? <Empty title="No restaurants found" body="Try a shorter name." /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  follow: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
});
