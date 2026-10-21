import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { formatScore, scoreColor, tint, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { blockUser, reportReview, REPORT_REASONS } from '@/lib/safety';
import { setLiked } from '@/lib/social';
import { photoUrl } from '@/lib/supabase';
import { firstPhoto, type FeedReview } from '@/lib/types';
import { setWanted, wantedDishIds } from '@/lib/wishlist';

// A score in a softly tinted badge: green 8+, yellow 6+, red below.
export function ScorePill({ rating, size = 'md' }: { rating: number | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const t = useTheme();
  const color = scoreColor(t, rating);
  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 20 : 15;
  return (
    <View style={[styles.pill, { backgroundColor: tint(color, 0.18) }, size === 'sm' && styles.pillSm, size === 'lg' && styles.pillLg]}>
      <Text style={[styles.pillNum, { color, fontSize }]}>{formatScore(rating)}</Text>
    </View>
  );
}

// The same badge for laying over a photo: dark glass behind the coloured score.
export function PhotoScore({ rating, style }: { rating: number | null | undefined; style?: object }) {
  const t = useTheme();
  return (
    <View style={[styles.photoScore, style]}>
      <Text style={[styles.pillNum, { color: scoreColor(t, rating), fontSize: 12 }]}>{formatScore(rating)}</Text>
    </View>
  );
}

// A row of pill buttons you can swipe sideways; the chosen ones are orange.
export function Chips({ items, style }: {
  items: { key: string; label: string; on: boolean; onPress: () => void }[]; style?: object;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: 8 }}>
      {items.map((c) => (
        <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: c.on }} onPress={c.onPress}
          style={[styles.chip, c.on ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.card, borderColor: t.line }]}>
          <Text style={{ color: c.on ? t.accentInk : t.muted, fontWeight: '600', fontSize: 14 }}>{c.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// Text tabs with an orange underline under the chosen one, e.g. Dishes | Places | Saved.
export function UnderlineTabs<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.tabs, { borderBottomColor: t.line }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={[styles.tab, { borderBottomColor: on ? t.accent : 'transparent' }]}>
            <Text style={{ color: on ? t.ink : t.muted, fontWeight: '700', fontSize: 16 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, busy }: {
  title: string; onPress: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean; busy?: boolean;
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: t.accent } : { backgroundColor: t.card, borderColor: t.line, borderWidth: 1 },
        { opacity: disabled ? 0.35 : pressed ? 0.8 : 1 },
      ]}>
      {busy ? <ActivityIndicator color={primary ? t.accentInk : t.ink} /> :
        <Text style={[styles.buttonText, { color: primary ? t.accentInk : t.ink }]}>{title}</Text>}
    </Pressable>
  );
}

// How long ago, e.g. "5m", "2h", "3d"; older posts show the date, e.g. "21 Oct".
export function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Field(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[styles.field, { backgroundColor: t.card, borderColor: t.line, color: t.ink }, props.style]}
    />
  );
}

// Two or three side-by-side tabs, e.g. Items | Restaurant.
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: t.card }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: t.line, borderColor: t.line }]}>
            <Text style={{ color: on ? t.ink : t.muted, fontWeight: on ? '700' : '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.muted }]}>{children}</Text>;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: t.ink }]}>{title}</Text>
      {body ? <Text style={[styles.emptyBody, { color: t.muted }]}>{body}</Text> : null}
    </View>
  );
}

const PHOTO_RATIO = 420 / 390; // height / width, as in the approved mock-up

// onComment replaces opening the comments page (used on that page itself).
export function ReviewCard({ review, onComment }: { review: FeedReview; onComment?: () => void }) {
  const t = useTheme();
  // The photo runs edge to edge: the full screen width, a little taller than wide.
  const width = useWindowDimensions().width;
  const me = useAuth().session?.user.id;
  const [hidden, setHidden] = useState(false);
  const [liked, setLikedState] = useState(review.liked_by_me);
  const [likes, setLikes] = useState(review.like_count);
  const [saved, setSaved] = useState(false);
  const dishId = review.dishes?.id;
  useEffect(() => { if (dishId) wantedDishIds().then((ids) => setSaved(ids.has(dishId))); }, [dishId]);
  // Fresh counts when the list reloads.
  useEffect(() => { setLikedState(review.liked_by_me); setLikes(review.like_count); }, [review.liked_by_me, review.like_count]);
  const photo = firstPhoto(review);
  const dish = review.dishes;
  const author = review.profiles;
  if (hidden) return null;

  // Someone else's review: report it, or block its author. Either hides it from you.
  function openMenu() {
    if (!me || !author) return;
    Alert.alert(`Review by @${author.username}`, undefined, [
      { text: 'Report review', onPress: chooseReason },
      { text: `Block @${author.username}`, style: 'destructive', onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function chooseReason() {
    Alert.alert("What's wrong with it?", 'The Foodalise team will check it, and it will be hidden for you.', [
      ...REPORT_REASONS.map((reason) => ({ text: reason, onPress: () => act(() => reportReview(me!, review.id, reason), 'Thanks, we\'ll take a look.') })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function confirmBlock() {
    Alert.alert(`Block @${author!.username}?`, "You won't see their reviews, and you'll stop following each other. You can unblock them from their profile.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => act(() => blockUser(me!, author!.id), `@${author!.username} is blocked.`) },
    ]);
  }

  // Shows the like straight away, and puts it back if saving fails.
  async function toggleLike() {
    if (!me) return;
    const next = !liked;
    setLikedState(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await setLiked(me, review.id, next);
    } catch (e) {
      setLikedState(!next);
      setLikes((n) => n + (next ? -1 : 1));
      Alert.alert((e as Error).message);
    }
  }

  // The bookmark adds the dish to your Want to try list.
  async function toggleSaved() {
    if (!me || !dishId) return;
    const next = !saved;
    setSaved(next);
    try {
      await setWanted(me, dishId, next);
    } catch (e) {
      setSaved(!next);
      Alert.alert((e as Error).message);
    }
  }

  async function act(run: () => Promise<void>, done: string) {
    try {
      await run();
      setHidden(true);
      Alert.alert(done);
    } catch (e) {
      Alert.alert((e as Error).message);
    }
  }

  const place = dish?.restaurants;
  return (
    <View style={styles.card}>
      <View style={styles.who}>
        <Avatar username={review.profiles?.username} path={review.profiles?.avatar_path} size={36} />
        <Pressable style={{ flex: 1 }} disabled={!review.profiles} hitSlop={4}
          onPress={() => review.profiles && router.push({ pathname: '/user/[id]', params: { id: review.profiles.id } })}>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>@{review.profiles?.username ?? 'someone'}</Text>
        </Pressable>
        <ScorePill rating={review.rating} />
        {me && author && author.id !== me ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Report or block" onPress={openMenu} hitSlop={10} style={styles.more}>
            <Text style={{ color: t.muted, fontSize: 18, fontWeight: '800' }}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
      {photo ? (
        <Image source={{ uri: photoUrl(photo) }} contentFit="cover"
          style={[styles.photo, { width, height: Math.round(width * PHOTO_RATIO), backgroundColor: t.card }]} />
      ) : null}
      {/* Under the photo: the dish, then where it's from; how long ago sits at the photo's bottom right. */}
      <View style={styles.under}>
        <View style={{ flex: 1, gap: 2 }}>
          {dish ? (
            <Pressable onPress={() => router.push({ pathname: '/dish/[id]', params: { id: dish.id } })}>
              <Text style={[styles.dish, { color: t.ink }]}>{dish.name}</Text>
            </Pressable>
          ) : null}
          {place ? (
            <Pressable onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: place.id } })} hitSlop={4}>
              <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>
                {place.name}{place.cuisine ? <Text style={{ fontStyle: 'italic' }}> · {place.cuisine}</Text> : null}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={{ color: t.muted, fontSize: 13, paddingTop: 4 }}>{timeAgo(review.created_at)}</Text>
      </View>
      {review.taste != null && review.presentation != null && review.value != null ? (
        <Text style={{ color: t.muted, fontSize: 14 }}>
          Taste {formatScore(review.taste)} · Looks {formatScore(review.presentation)} · Value {formatScore(review.value)}
        </Text>
      ) : null}
      {review.body ? <Text style={{ color: t.ink, lineHeight: 21, fontSize: 15 }}>“{review.body}”</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} onPress={toggleLike} hitSlop={8} style={styles.action}>
          <SymbolView name={{ ios: liked ? 'heart.fill' : 'heart', android: 'favorite', web: 'favorite' }} tintColor={liked ? t.accent : t.muted} size={20}
            fallback={<Text style={{ fontSize: 20, color: liked ? t.accent : t.muted }}>{liked ? '♥' : '♡'}</Text>} />
          <Text style={{ color: t.muted, fontWeight: '600' }}>{likes}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Comments" hitSlop={8} style={styles.action}
          onPress={onComment ?? (() => router.push({ pathname: '/comments/[id]', params: { id: review.id } }))}>
          <SymbolView name={{ ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' }} tintColor={t.muted} size={19}
            fallback={<Text style={{ fontSize: 17, color: t.muted }}>💬</Text>} />
          <Text style={{ color: t.muted, fontWeight: '600' }}>{review.comment_count}</Text>
        </Pressable>
        {photo ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Share" hitSlop={8} style={styles.action}
            onPress={() => router.push({ pathname: '/share/[id]', params: { id: review.id } })}>
            <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} tintColor={t.muted} size={19} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {dishId ? (
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from Want to try' : 'Save to Want to try'}
            onPress={toggleSaved} hitSlop={8}>
            <SymbolView name={{ ios: saved ? 'bookmark.fill' : 'bookmark', android: 'bookmark', web: 'bookmark' }}
              tintColor={saved ? t.accent : t.muted} size={20} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, alignItems: 'center' },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3 },
  pillLg: { paddingHorizontal: 14, paddingVertical: 7 },
  pillNum: { fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  photoScore: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(10,10,10,0.72)' },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 9 },
  tabs: { flexDirection: 'row', gap: 24, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingBottom: 10, borderBottomWidth: 2.5 },
  button: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontWeight: '700', fontSize: 15 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontWeight: '700', fontSize: 16 },
  emptyBody: { textAlign: 'center', lineHeight: 20 },
  // Lists that show cards have 16pt side padding; the photo reaches past it to the screen edges.
  card: { gap: 10, paddingBottom: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photo: { marginHorizontal: -16 },
  dish: { fontWeight: '700', fontSize: 20, letterSpacing: -0.3 },
  more: { paddingHorizontal: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 2 },
  under: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segments: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
});
