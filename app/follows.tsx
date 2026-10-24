import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Empty, Segmented } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Tab = 'followers' | 'following';
type Person = { id: string; username: string; avatar_path: string | null };

// Who follows someone, and who they follow, newest first. Tap a person to open
// their profile, or follow them back from here.
export default function FollowsScreen() {
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const params = useLocalSearchParams<{ id: string; tab?: Tab; username?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'following' ? 'following' : 'followers');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    let live = true;
    setPeople(null);
    (async () => {
      const query = tab === 'followers'
        ? supabase.from('follows').select('person:profiles!follows_follower_id_fkey(id, username, avatar_path)').eq('following_id', params.id)
        : supabase.from('follows').select('person:profiles!follows_following_id_fkey(id, username, avatar_path)').eq('follower_id', params.id);
      const [{ data }, iFollow] = await Promise.all([
        query.order('created_at', { ascending: false }).limit(500),
        me ? supabase.from('follows').select('following_id').eq('follower_id', me) : Promise.resolve({ data: [] }),
      ]);
      if (!live) return;
      setPeople(((data ?? []) as unknown as { person: Person | null }[]).flatMap((r) => (r.person ? [r.person] : [])));
      setMine(new Set((iFollow.data ?? []).map((r: { following_id: string }) => r.following_id)));
    })();
    return () => { live = false; };
  }, [tab, params.id, me]));

  async function toggleFollow(p: Person) {
    if (!me) return;
    const on = mine.has(p.id);
    const next = new Set(mine);
    if (on) next.delete(p.id); else next.add(p.id);
    setMine(next);
    const { error } = on
      ? await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', p.id)
      : await supabase.from('follows').insert({ follower_id: me, following_id: p.id });
    if (error) setMine(mine);
  }

  return (
    <>
      <Stack.Screen options={{ title: params.username ? `@${params.username}` : '' }} />
      <FlatList
        style={{ backgroundColor: t.surface }}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <Segmented value={tab} onChange={setTab}
              options={[{ value: 'followers', label: 'Followers' }, { value: 'following', label: 'Following' }]} />
          </View>
        }
        data={people ?? []}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={people ? (
          <Empty title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            body={tab === 'followers' ? 'When people follow, they will show here.' : 'People they follow will show here.'} />
        ) : undefined}
        renderItem={({ item }) => {
          const on = mine.has(item.id);
          return (
            <View style={[styles.row, { borderBottomColor: t.line }]}>
              <Pressable style={styles.who} onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
                <Avatar username={item.username} path={item.avatar_path} size={40} />
                <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>@{item.username}</Text>
              </Pressable>
              {me && item.id !== me ? (
                <Pressable accessibilityRole="button" onPress={() => toggleFollow(item)}
                  style={[styles.follow, on ? { borderColor: t.line } : { backgroundColor: t.accent, borderColor: t.accent }]}>
                  <Text style={{ color: on ? t.ink : t.accentInk, fontWeight: '700', fontSize: 13 }}>{on ? 'Following' : 'Follow'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  follow: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
