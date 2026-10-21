import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { blockUser, reportReview, REPORT_REASONS } from '@/lib/safety';
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

export function ReviewCard({ review }: { review: FeedReview }) {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const [hidden, setHidden] = useState(false);
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
          <Text style={{ color: t.muted, fontSize: 12 }}>{new Date(review.created_at).toLocaleDateString('en-GB')}</Text>
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
        <Link href={{ pathname: '/dish/[id]', params: { id: dish.id } }} asChild>
          <Pressable>
            <Text style={[styles.dish, { color: t.ink }]}>{dish.name}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>at {dish.restaurants?.name}</Text>
          </Pressable>
        </Link>
      ) : null}
      {review.taste != null && review.presentation != null && review.value != null ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>
          Taste {formatScore(review.taste)} · Presentation {formatScore(review.presentation)} · Value {formatScore(review.value)}
        </Text>
      ) : null}
      {review.body ? <Text style={{ color: t.ink, lineHeight: 21 }}>{review.body}</Text> : null}
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
});
