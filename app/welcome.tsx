import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { CUISINES } from '@/lib/cuisines';
import { supabase } from '@/lib/supabase';

type Person = { id: string; username: string; avatar_path: string | null; review_count: number; matching: number };

// Shown once, right after someone creates an account: favourite cuisines, a few
// people to follow so the Feed isn't empty, then location for what's nearby.
export default function Welcome() {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const [step, setStep] = useState<'cuisines' | 'people' | 'location'>('cuisines');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Person[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== 'people') return;
    supabase.rpc('suggested_people', { cuisines: [...picked] }).then(({ data }) => {
      const list = (data as Person[] | null) ?? [];
      if (!list.length) setStep('location');
      else setPeople(list);
    });
  }, [step, picked]);

  function toggleCuisine(c: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  async function toggleFollow(p: Person) {
    if (!me) return;
    const on = followed.has(p.id);
    const { error } = on
      ? await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', p.id)
      : await supabase.from('follows').insert({ follower_id: me, following_id: p.id });
    if (error) return;
    setFollowed((prev) => {
      const next = new Set(prev);
      if (on) next.delete(p.id); else next.add(p.id);
      return next;
    });
  }

  async function finish(askLocation: boolean) {
    if (!me) return;
    setBusy(true);
    if (askLocation) await Location.requestForegroundPermissionsAsync().catch(() => null);
    await supabase.from('profiles').update({ favourite_cuisines: [...picked], onboarded_at: new Date().toISOString() }).eq('id', me);
    setBusy(false);
    router.replace('/');
  }

  const dots = (
    <View style={styles.dots}>
      {(['cuisines', 'people', 'location'] as const).map((s) => (
        <View key={s} style={[styles.dot, { backgroundColor: s === step ? t.accent : t.line }]} />
      ))}
    </View>
  );

  if (step === 'cuisines') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
        <ScrollView contentContainerStyle={styles.wrap}>
          {dots}
          <Text style={[styles.title, { color: t.ink }]}>What do you love to eat?</Text>
          <Text style={[styles.body, { color: t.muted }]}>Pick a few. We'll use them to find foodies with your taste.</Text>
          <View style={styles.grid}>
            {CUISINES.filter((c) => c !== 'Other').map((c) => {
              const on = picked.has(c);
              return (
                <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => toggleCuisine(c)}
                  style={[styles.chip, on ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.card, borderColor: t.line }]}>
                  <Text style={{ color: on ? t.accentInk : t.ink, fontWeight: '600' }}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Button title={picked.size ? 'Continue' : 'Skip'} onPress={() => setStep('people')} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'people') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
        <ScrollView contentContainerStyle={styles.wrap}>
          {dots}
          <Text style={[styles.title, { color: t.ink }]}>Follow a few foodies</Text>
          <Text style={[styles.body, { color: t.muted }]}>Their dish reviews will fill your Feed.</Text>
          <View style={{ gap: 4 }}>
            {people.map((p) => {
              const on = followed.has(p.id);
              return (
                <View key={p.id} style={[styles.person, { borderBottomColor: t.line }]}>
                  <Avatar username={p.username} path={p.avatar_path} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>@{p.username}</Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>
                      {p.review_count} {p.review_count === 1 ? 'dish' : 'dishes'} reviewed
                      {p.matching ? ` · ${p.matching} you'd like` : ''}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => toggleFollow(p)}
                    style={[styles.follow, on ? { borderColor: t.line } : { backgroundColor: t.accent, borderColor: t.accent }]}>
                    <Text style={{ color: on ? t.ink : t.accentInk, fontWeight: '700', fontSize: 13 }}>{on ? 'Following' : 'Follow'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Button title={followed.size ? 'Continue' : 'Skip'} onPress={() => setStep('location')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={[styles.wrap, { flex: 1 }]}>
        {dots}
        <Text style={{ fontSize: 56 }}>📍</Text>
        <Text style={[styles.title, { color: t.ink }]}>Find the best dishes near you</Text>
        <Text style={[styles.body, { color: t.muted }]}>
          Foodalise uses your location to show restaurants on the map and the top-rated dishes around you. It's never shown to anyone else.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button title="Allow location" onPress={() => finish(true)} busy={busy} />
        <Button variant="ghost" title="Not now" onPress={() => finish(false)} disabled={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 12 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  dot: { width: 24, height: 4, borderRadius: 2 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  body: { fontSize: 16, lineHeight: 22, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  follow: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  footer: { padding: 24, paddingTop: 8, gap: 8 },
});
