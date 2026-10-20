import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';
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
  const photo = firstPhoto(review);
  const dish = review.dishes;
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
});
