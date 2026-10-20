import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Empty, Label } from '@/components/ui';
import { formatScore, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { deleteReview } from '@/lib/reviews';
import { photoUrl, supabase } from '@/lib/supabase';
import { firstPhoto, REVIEW_SELECT, type FeedReview } from '@/lib/types';

// One person's food diary: follower counts, stats and a photo grid of their reviews.
// Shows Sign out on your own profile and Follow / Following on everyone else's.
export function ProfileView({ userId }: { userId: string }) {
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const isMe = me === userId;
  // Three photos per row: screen width minus the 16pt page padding and two 4pt gaps.
  const cell = Math.floor((useWindowDimensions().width - 32 - 8) / 3);
  const [username, setUsername] = useState<string | null>(null);
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
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

  // Reload whenever the screen comes back into view, so new and deleted reviews show up.
  useFocusEffect(useCallback(() => { load(true); }, [load]));

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

  function openDish(r: FeedReview) {
    if (r.dishes) router.push({ pathname: '/dish/[id]', params: { id: r.dishes.id } });
  }

  // On your own page a photo offers Open or Delete; elsewhere it just opens the dish.
  function onTile(r: FeedReview) {
    if (!isMe) return openDish(r);
    Alert.alert(r.dishes?.name ?? 'Your review', r.dishes?.restaurants?.name, [
      { text: 'Open dish', onPress: () => openDish(r) },
      { text: 'Delete review', style: 'destructive', onPress: () => confirmDelete(r) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmDelete(r: FeedReview) {
    Alert.alert('Delete this review?', 'It will be removed from your page, the feed and the dish page. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setError(null);
          try {
            await deleteReview(r.id);
            setReviews((list) => list.filter((x) => x.id !== r.id));
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);
  }

  const restaurants = new Set(reviews.map((r) => r.dishes?.restaurants?.id).filter(Boolean)).size;
  const avg = reviews.length ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length : null;

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}>
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
      {reviews.length ? <View style={{ gap: 2 }}>
        <Label>{isMe ? "Dishes I've tried" : 'Dishes tried'}</Label>
        {isMe ? <Text style={{ color: t.muted, fontSize: 12 }}>Tap a photo to open or delete it.</Text> : null}
      </View> : null}
      {reviews.length ? (
        <View style={styles.grid}>
          {reviews.map((r) => {
            const p = firstPhoto(r);
            return (
              <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.dishes?.name ?? 'Review photo'}
                onPress={() => onTile(r)}
                style={{ width: cell, height: cell, borderRadius: 6, overflow: 'hidden', backgroundColor: t.bg }}>
                {p ? <Image source={{ uri: photoUrl(p) }} style={{ width: cell, height: cell }} contentFit="cover" /> : null}
                <Text style={styles.badge}>{formatScore(r.rating)}</Text>
              </Pressable>
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
  badge: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(10,12,10,0.72)', color: '#fff', fontWeight: '800', fontSize: 11, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
});
