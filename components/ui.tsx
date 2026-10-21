import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { blockUser, reportReview, REPORT_REASONS } from '@/lib/safety';
import { setLiked } from '@/lib/social';
import { photoUrl } from '@/lib/supabase';
import { firstPhoto, type FeedReview } from '@/lib/types';

export function ScorePill({ rating }: { rating: number | null | undefined }) {
  const t = useTheme();
  const color = scoreColor(t, rating);
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillNum, { color }]}>{formatScore(rating)}</Text>
      <Text style={[styles.pillOf, { color }]}>/10</Text>
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
        primary ? { backgroundColor: t.accent } : { backgroundColor: t.surface, borderColor: t.line, borderWidth: 1 },
        { opacity: disabled ? 0.35 : pressed ? 0.8 : 1 },
      ]}>
      {busy ? <ActivityIndicator color={primary ? t.accentInk : t.ink} /> :
        <Text style={[styles.buttonText, { color: primary ? t.accentInk : t.ink }]}>{title}</Text>}
    </Pressable>
  );
}

// e.g. "21/10/2026 · 17:05" in the phone's own time zone, 24-hour clock.
function postedAt(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${d.toLocaleDateString('en-GB')} · ${time}`;
}

export function Field(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[styles.field, { backgroundColor: t.bg, borderColor: t.line, color: t.ink }, props.style]}
    />
  );
}

// Two or three side-by-side tabs, e.g. Items | Restaurant.
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: t.bg }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: t.surface, borderColor: t.line }]}>
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

// onComment replaces opening the comments page (used on that page itself).
export function ReviewCard({ review, onComment }: { review: FeedReview; onComment?: () => void }) {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const [hidden, setHidden] = useState(false);
  const [liked, setLikedState] = useState(review.liked_by_me);
  const [likes, setLikes] = useState(review.like_count);
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

  async function act(run: () => Promise<void>, done: string) {
    try {
      await run();
      setHidden(true);
      Alert.alert(done);
    } catch (e) {
      Alert.alert((e as Error).message);
    }
  }

  return (
    <View style={[styles.card, { borderBottomColor: t.line }]}>
      <View style={styles.who}>
        <View style={[styles.avatar, { backgroundColor: t.ink }]}>
          <Text style={{ color: t.surface, fontWeight: '700' }}>{review.profiles?.username?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Pressable style={{ flex: 1 }} disabled={!review.profiles}
          onPress={() => review.profiles && router.push({ pathname: '/user/[id]', params: { id: review.profiles.id } })}>
          <Text style={{ color: t.ink, fontWeight: '700' }}>@{review.profiles?.username ?? 'someone'}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{postedAt(review.created_at)}</Text>
        </Pressable>
        <ScorePill rating={review.rating} />
        {me && author && author.id !== me ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Report or block" onPress={openMenu} hitSlop={10} style={styles.more}>
            <Text style={{ color: t.muted, fontSize: 18, fontWeight: '800' }}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
      {photo ? <Image source={{ uri: photoUrl(photo) }} style={[styles.photo, { backgroundColor: t.bg }]} contentFit="cover" /> : null}
      {dish ? (
        <View>
          <Pressable onPress={() => router.push({ pathname: '/dish/[id]', params: { id: dish.id } })}>
            <Text style={[styles.dish, { color: t.ink }]}>{dish.name}</Text>
          </Pressable>
          {dish.restaurants ? (
            <Pressable onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: dish.restaurants!.id } })} hitSlop={6}>
              <Text style={{ color: t.muted, fontSize: 13 }}>at <Text style={{ color: t.ink, fontWeight: '600' }}>{dish.restaurants.name}</Text></Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {review.taste != null && review.presentation != null && review.value != null ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>
          Taste {formatScore(review.taste)} · Presentation {formatScore(review.presentation)} · Value {formatScore(review.value)}
        </Text>
      ) : null}
      {review.body ? <Text style={{ color: t.ink, lineHeight: 21 }}>{review.body}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} onPress={toggleLike} hitSlop={8} style={styles.action}>
          <Text style={{ fontSize: 20, color: liked ? t.lo : t.muted }}>{liked ? '♥' : '♡'}</Text>
          {likes > 0 ? <Text style={{ color: t.muted, fontWeight: '600' }}>{likes}</Text> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Comments" hitSlop={8} style={styles.action}
          onPress={onComment ?? (() => router.push({ pathname: '/comments/[id]', params: { id: review.id } }))}>
          <Text style={{ fontSize: 17, color: t.muted }}>💬</Text>
          <Text style={{ color: t.muted, fontWeight: '600' }}>
            {review.comment_count > 0 ? review.comment_count : 'Comment'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'baseline', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillNum: { fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  pillOf: { fontWeight: '600', fontSize: 10, opacity: 0.75 },
  button: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontWeight: '700', fontSize: 15 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontWeight: '700', fontSize: 16 },
  emptyBody: { textAlign: 'center', lineHeight: 20 },
  card: { gap: 10, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  dish: { fontWeight: '700', fontSize: 16 },
  more: { paddingHorizontal: 4 },
  actions: { flexDirection: 'row', gap: 22, paddingTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segments: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
});
