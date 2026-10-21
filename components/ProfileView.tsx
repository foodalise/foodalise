import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PhotoStats } from '@/components/PhotoStats';
import { Button, Empty, Field, PhotoScore, ReviewCard, UnderlineTabs } from '@/components/ui';
import { WishlistList } from '@/components/WishlistList';
import { formatScore, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { changeAvatar, saveBio } from '@/lib/profile';
import { compareTaste, myScores, type TasteMatch } from '@/lib/taste';
import { deleteReview } from '@/lib/reviews';
import { blockUser, deleteAccount, unblockUser } from '@/lib/safety';
import { photoUrl, supabase } from '@/lib/supabase';
import { firstPhoto, REVIEW_SELECT, type FeedReview } from '@/lib/types';

// One person's food diary: follower counts, stats and a photo grid of their reviews.
// Shows Sign out, Privacy and Delete account on your own profile, and Follow and
// Block on everyone else's.
export function ProfileView({ userId }: { userId: string }) {
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const isMe = me === userId;
  const insets = useSafeAreaInsets();
  // Three photos per row: screen width minus the 16pt page padding and two 4pt gaps.
  const cell = Math.floor((useWindowDimensions().width - 32 - 8) / 3);
  const [username, setUsername] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editingBio, setEditingBio] = useState<string | null>(null); // the draft while editing
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [iBlocked, setIBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'items' | 'restaurants' | 'wishlist'>('items');
  const [loading, setLoading] = useState(true);
  const [taste, setTaste] = useState<TasteMatch>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [profile, theirs, followerCount, followingCount, mine, blocked] = await Promise.all([
      supabase.from('profiles').select('username, bio, avatar_path').eq('id', userId).single(),
      supabase.from('reviews').select(REVIEW_SELECT).eq('user_id', userId)
        .order('created_at', { ascending: false }).returns<FeedReview[]>(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      me && !isMe
        ? supabase.from('follows').select('follower_id').eq('follower_id', me).eq('following_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      me && !isMe
        ? supabase.from('blocks').select('blocked_id').eq('blocker_id', me).eq('blocked_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setUsername(profile.data?.username ?? null);
    setBio(profile.data?.bio ?? null);
    setAvatar(profile.data?.avatar_path ?? null);
    setReviews(theirs.data ?? []);
    setFollowers(followerCount.count ?? 0);
    setFollowing(followingCount.count ?? 0);
    setIFollow(!!mine.data);
    setIBlocked(!!blocked.data);
    setTaste(me && !isMe ? compareTaste(await myScores(me), theirs.data ?? []) : null);
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

  function toggleBlock() {
    if (!me) return;
    const name = username ? `@${username}` : 'them';
    const run = async () => {
      setError(null);
      try {
        if (iBlocked) await unblockUser(me, userId);
        else await blockUser(me, userId);
        await load(true);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    if (iBlocked) return run();
    Alert.alert(`Block ${name}?`, "You won't see their reviews, and you'll stop following each other.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: run },
    ]);
  }

  async function pickAvatar() {
    if (!me) return;
    setError(null);
    try {
      const path = await changeAvatar(me, avatar);
      if (path) setAvatar(path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function finishBio() {
    if (!me || editingBio === null) return;
    setBusy(true); setError(null);
    try {
      setBio(await saveBio(me, editingBio));
      setEditingBio(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  function confirmDeleteAccount() {
    Alert.alert('Delete your account?', 'Your reviews, photos and followers will be deleted for good. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account', style: 'destructive', onPress: async () => {
          setBusy(true); setError(null);
          try {
            await deleteAccount();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        },
      },
    ]);
  }

  // The gear on your own page: legal pages, signing out and deleting your account.
  function openSettings() {
    Alert.alert('Settings', undefined, [
      { text: 'Terms of Use', onPress: () => router.push('/terms') },
      { text: 'Privacy policy', onPress: () => router.push('/privacy') },
      { text: 'Data credits', onPress: () => router.push('/credits') },
      { text: 'Sign out', onPress: () => supabase.auth.signOut() },
      { text: 'Delete my account', style: 'destructive', onPress: confirmDeleteAccount },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function editProfile() {
    Alert.alert('Edit profile', undefined, [
      { text: 'Change profile photo', onPress: pickAvatar },
      { text: bio ? 'Edit bio' : 'Add a bio', onPress: () => setEditingBio(bio ?? '') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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

  // Reviews grouped by restaurant, most recent visit first (reviews are newest first).
  const byRestaurant: { id: string; name: string; reviews: FeedReview[] }[] = [];
  for (const r of reviews) {
    const place = r.dishes?.restaurants;
    if (!place) continue;
    const group = byRestaurant.find((g) => g.id === place.id);
    if (group) group.reviews.push(r);
    else byRestaurant.push({ id: place.id, name: place.name, reviews: [r] });
  }
  const restaurants = byRestaurant.length;

  const tile = (r: FeedReview) => {
    const p = firstPhoto(r);
    return (
      <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.dishes?.name ?? 'Review photo'}
        onPress={() => onTile(r)}
        style={{ width: cell, height: cell, borderRadius: 6, overflow: 'hidden', backgroundColor: t.card }}>
        {p ? <Image source={{ uri: photoUrl(p) }} style={{ width: cell, height: cell }} contentFit="cover" /> : null}
        <PhotoScore rating={Number(r.rating)} style={{ position: 'absolute', left: 6, bottom: 6 }} />
        <PhotoStats likes={r.like_count} comments={r.comment_count} rating={Number(r.rating)} showRating={false} />
      </Pressable>
    );
  };
  const avg = reviews.length ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length : null;
  // The last square on your own grid: a shortcut to review another dish.
  const addTile = (
    <Pressable key="add" accessibilityRole="button" onPress={() => router.push('/review')}
      style={{ width: cell, height: cell, borderRadius: 6, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 30, fontWeight: '300' }}>+</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>Add a dish</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}>
      {!isMe ? <Stack.Screen options={{ title: username ? `@${username}` : '' }} /> : null}
      {isMe ? (
        <View style={[styles.titleRow, { paddingTop: insets.top }]}>
          <Text style={[styles.title, { color: t.ink }]}>You</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={openSettings}
            style={[styles.gear, { backgroundColor: t.card, borderColor: t.line }]}>
            <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={t.ink} size={20} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.head}>
        <Pressable disabled={!isMe} onPress={pickAvatar} accessibilityRole={isMe ? 'button' : undefined}
          accessibilityLabel={isMe ? 'Change profile photo' : undefined}
          style={[styles.ring, { borderColor: t.accent }]}>
          <Avatar username={username} path={avatar} size={84} />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.name, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            @{username ?? '…'}
          </Text>
          {editingBio !== null ? null : bio ? (
            <Pressable disabled={!isMe} onPress={() => setEditingBio(bio)}>
              <Text style={{ color: t.muted, fontSize: 14, lineHeight: 19 }} numberOfLines={4}>{bio}</Text>
            </Pressable>
          ) : isMe ? (
            <Pressable onPress={() => setEditingBio('')} hitSlop={6}>
              <Text style={{ color: t.muted, fontSize: 14 }}>+ Add a bio</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {editingBio !== null ? (
        <View style={{ gap: 8 }}>
          <Field value={editingBio} onChangeText={setEditingBio} multiline maxLength={300} autoFocus
            placeholder="Tell people about you: favourite food, where you eat, anything you like."
            style={{ minHeight: 70, textAlignVertical: 'top' }} />
          <Text style={{ color: t.muted, fontSize: 11, textAlign: 'right' }}>{editingBio.length}/300</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button variant="ghost" title="Cancel" onPress={() => setEditingBio(null)} /></View>
            <View style={{ flex: 1 }}><Button title="Save" onPress={finishBio} busy={busy} /></View>
          </View>
        </View>
      ) : null}
      <View style={[styles.stats, { backgroundColor: t.card, borderColor: t.line }]}>
        {([[reviews.length, reviews.length === 1 ? 'dish' : 'dishes'], [restaurants, restaurants === 1 ? 'place' : 'places'],
          [formatScore(avg), 'avg'], [followers, followers === 1 ? 'follower' : 'followers'], [following, 'following']] as const).map(([n, l]) => (
          <View key={l} style={styles.stat}>
            <Text style={[styles.statNum, { color: t.ink }]}>{n}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{l}</Text>
          </View>
        ))}
      </View>
      {isMe && editingBio === null ? <Button variant="ghost" title="Edit profile" onPress={editProfile} /> : null}
      {!isMe && me && !iBlocked && reviews.length ? (
        <View style={[styles.taste, { borderColor: t.line }]}>
          {taste ? (
            <>
              <Text style={[styles.tasteNum, { color: t.ink }]}>{taste.percent}%</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontWeight: '700' }}>taste match</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  {taste.by === 'dishes'
                    ? `From ${taste.shared} ${taste.shared === 1 ? 'dish' : 'dishes'} you've both reviewed`
                    : `From ${taste.shared} ${taste.shared === 1 ? 'restaurant' : 'restaurants'} you've both reviewed`}
                </Text>
              </View>
            </>
          ) : (
            <Text style={{ color: t.muted, flex: 1 }}>Review a dish they've had to see your taste match.</Text>
          )}
        </View>
      ) : null}
      {!isMe && me && !iBlocked ? (
        <Button variant={iFollow ? 'ghost' : 'primary'} title={iFollow ? 'Following' : 'Follow'} onPress={toggleFollow} busy={busy} />
      ) : null}
      {iBlocked ? <Text style={{ color: t.muted }}>You've blocked this person, so you can't see their reviews.</Text> : null}
      {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
      {reviews.length || isMe ? (
        <UnderlineTabs value={view} onChange={setView}
          options={[{ value: 'items', label: 'Dishes' }, { value: 'restaurants', label: 'Places' },
            ...(isMe ? [{ value: 'wishlist' as const, label: 'Want to try' }] : [])]} />
      ) : null}
      {view === 'wishlist' && isMe ? <WishlistList /> : null}
      {view !== 'wishlist' && reviews.length && isMe ? <Text style={{ color: t.muted, fontSize: 12 }}>Tap a photo to open or delete it.</Text> : null}
      {view === 'wishlist' ? null : reviews.length && view === 'items' ? (
        // Your own page is a photo grid; anyone else's reads like the Feed.
        isMe ? <View style={styles.grid}>{reviews.map(tile)}{addTile}</View> : <View style={{ gap: 16 }}>{reviews.map((r) => <ReviewCard key={r.id} review={r} />)}</View>
      ) : reviews.length ? (
        <View style={{ gap: 18 }}>
          {byRestaurant.map((g) => {
            const avgHere = g.reviews.reduce((s, r) => s + Number(r.rating), 0) / g.reviews.length;
            return (
              <View key={g.id} style={{ gap: 8 }}>
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: g.id } })}>
                  <Text style={{ color: t.ink, fontWeight: '800', fontSize: 16 }}>{g.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    {g.reviews.length} {g.reviews.length === 1 ? 'dish' : 'dishes'} · avg {formatScore(avgHere)}
                  </Text>
                </Pressable>
                <View style={styles.grid}>{g.reviews.map(tile)}</View>
              </View>
            );
          })}
        </View>
      ) : loading ? null : isMe ? (
        <View style={styles.grid}>{addTile}</View>
      ) : (
        <Empty title={isMe ? 'Your food diary is empty' : 'No reviews yet'}
          body={isMe ? 'Every dish you review will appear here.' : undefined} />
      )}
      {!isMe && me ? (
        <Pressable accessibilityRole="button" onPress={toggleBlock} style={styles.link}>
          <Text style={{ color: iBlocked ? t.muted : t.lo }}>{iBlocked ? `Unblock @${username ?? ''}` : `Block @${username ?? ''}`}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  taste: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  tasteNum: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  gear: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { borderWidth: 3, borderRadius: 999, padding: 3 },
  name: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  stats: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  link: { alignItems: 'center', paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
