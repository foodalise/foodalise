import { Image } from 'expo-image';
import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty } from '@/components/ui';
import { formatScore, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { photoUrl, supabase } from '@/lib/supabase';
import { firstPhoto, REVIEW_SELECT, type FeedReview } from '@/lib/types';

// One person's food diary: follower counts, stats and a photo grid of their reviews.
// Shows Sign out on your own profile and Follow / Following on everyone else's.
export function ProfileView({ userId }: { userId: string }) {
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const isMe = me === userId;
  const [username, setUsername] = useState<string | null>(null);
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [profile, theirs, followerCount, followingCount, mine] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', userId).single(),
      supabase.from('reviews').select(REVIEW_SELECT).eq('user_id', userId)
        .order('created_at', { ascending: false }).returns<FeedReview[]>(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      me && !isMe
        ? supabase.from('follows').select('follower_id').eq('follower_id', me).eq('following_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setUsername(profile.data?.username ?? null);
    setReviews(theirs.data ?? []);
    setFollowers(followerCount.count ?? 0);
    setFollowing(followingCount.count ?? 0);
    setIFollow(!!mine.data);
    setLoading(false);
  }, [userId, me, isMe]);

  useEffect(() => { load(); }, [load]);

  async function toggleFollow() {
    if (!me) return;
    setBusy(true); setError(null);
    const { error } = iFollow
      ? await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', userId)
      : await supabase.from('follows').insert({ follower_id: me, following_id: userId });
    if (error) setError(error.message);
    else { setIFollow(!iFollow); setFollowers((n) => n + (iFollow ? -1 : 1)); }
    setBusy(false);
  }

  const restaurants = new Set(reviews.map((r) => r.dishes?.restaurants?.id).filter(Boolean)).size;
  const avg = reviews.length ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length : null;

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!isMe ? <Stack.Screen options={{ title: username ? `@${username}` : '' }} /> : null}
      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: t.ink }]}>
          <Text style={{ color: t.surface, fontSize: 24, fontWeight: '800' }}>{username?.[0]?.toUpperCase() ?? ''}</Text>
        </View>
        <Text style={[styles.name, { color: t.ink }]}>@{username ?? '…'}</Text>
      </View>
      <View style={styles.stats}>
        {([[followers, followers === 1 ? 'follower' : 'followers'], [following, 'following']] as const).map(([n, l]) => (
          <View key={l} style={[styles.stat, { borderColor: t.line }]}>
            <Text style={[styles.statNum, { color: t.ink }]}>{n}</Text>
            <Text style={{ color: t.muted, fontSize: 11, fontWeight: '600' }}>{l}</Text>
          </View>
        ))}
      </View>
      <View style={styles.stats}>
        {[[reviews.length, 'dishes'], [restaurants, 'restaurants'], [formatScore(avg), 'avg score']].map(([n, l]) => (
          <View key={l} style={[styles.stat, { borderColor: t.line }]}>
            <Text style={[styles.statNum, { color: t.ink }]}>{n}</Text>
            <Text style={{ color: t.muted, fontSize: 11, fontWeight: '600' }}>{l}</Text>
          </View>
        ))}
      </View>
      {!isMe && me ? (
        <Button variant={iFollow ? 'ghost' : 'primary'} title={iFollow ? 'Following' : 'Follow'} onPress={toggleFollow} busy={busy} />
      ) : null}
      {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
      {reviews.length ? (
        <View style={styles.grid}>
          {reviews.map((r) => {
            const p = firstPhoto(r);
            return (
              <Link key={r.id} href={{ pathname: '/dish/[id]', params: { id: r.dishes?.id ?? '' } }} asChild>
                <Pressable style={StyleSheet.flatten([styles.cell, { backgroundColor: t.bg }])}>
                  {p ? <Image source={{ uri: photoUrl(p) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                  <Text style={styles.badge}>{formatScore(r.rating)}</Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      ) : loading ? null : (
        <Empty title={isMe ? 'Your food diary is empty' : 'No reviews yet'}
          body={isMe ? 'Every dish you review will appear here.' : undefined} />
      )}
      {isMe ? <Button variant="ghost" title="Sign out" onPress={() => supabase.auth.signOut()} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '32.6%', aspectRatio: 1, borderRadius: 6, overflow: 'hidden' },
  badge: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(10,12,10,0.72)', color: '#fff', fontWeight: '800', fontSize: 11, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
});
