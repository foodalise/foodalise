import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ScorePill, Segmented } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { photoUrl } from '@/lib/supabase';
import { firstPhoto, type FeedReview } from '@/lib/types';

const TOP = 10;
const LIKED = 7; // only dishes scored this or more count as recommendations

type Ranked = { id: string; title: string; detail: string; score: number; photo: string | null; href: () => void };

// Someone's top 10, ranked by their own scores: the dishes they rated highest, and the
// restaurants where their dishes averaged highest. Ties go to the more recent review.
export function Recommendations({ reviews, isMe, username }: { reviews: FeedReview[]; isMe: boolean; username: string | null }) {
  const t = useTheme();
  const [kind, setKind] = useState<'dishes' | 'restaurants'>('dishes');

  // Each dish once, at their best score for it (reviews arrive newest first, so the newer wins a tie).
  const best = new Map<string, FeedReview>();
  for (const r of reviews) {
    if (!r.dishes) continue;
    const kept = best.get(r.dishes.id);
    if (!kept || Number(r.rating) > Number(kept.rating)) best.set(r.dishes.id, r);
  }
  const dishes: Ranked[] = [...best.values()]
    .filter((r) => Number(r.rating) >= LIKED)
    .sort((a, b) => Number(b.rating) - Number(a.rating) || b.created_at.localeCompare(a.created_at))
    .slice(0, TOP)
    .map((r) => ({
      id: r.id, title: r.dishes!.name, detail: r.dishes!.restaurants?.name ?? '', score: Number(r.rating), photo: firstPhoto(r),
      href: () => router.push({ pathname: '/dish/[id]', params: { id: r.dishes!.id } }),
    }));

  const places = new Map<string, { id: string; name: string; picks: FeedReview[] }>();
  for (const r of best.values()) {
    const p = r.dishes?.restaurants;
    if (!p) continue;
    const place = places.get(p.id) ?? { id: p.id, name: p.name, picks: [] };
    place.picks.push(r);
    places.set(p.id, place);
  }
  const restaurants: Ranked[] = [...places.values()]
    .map((p) => {
      const picks = [...p.picks].sort((a, b) => Number(b.rating) - Number(a.rating));
      const avg = picks.reduce((s, r) => s + Number(r.rating), 0) / picks.length;
      const latest = picks.reduce((at, r) => (r.created_at > at ? r.created_at : at), '');
      return { p, picks, avg, latest };
    })
    .filter((x) => x.avg >= LIKED)
    .sort((a, b) => b.avg - a.avg || b.picks.length - a.picks.length || b.latest.localeCompare(a.latest))
    .slice(0, TOP)
    .map(({ p, picks, avg }) => ({
      id: p.id, title: p.name, score: avg, photo: firstPhoto(picks[0]),
      detail: picks.length === 1 ? `Had the ${picks[0].dishes!.name}` : `${picks.length} dishes · best: ${picks[0].dishes!.name}`,
      href: () => router.push({ pathname: '/restaurant/[id]', params: { id: p.id } }),
    }));

  const list = kind === 'dishes' ? dishes : restaurants;
  const who = isMe ? 'My' : username ? `@${username}'s` : 'Their';
  return (
    <View style={{ gap: 12 }}>
      <Segmented value={kind} onChange={setKind}
        options={[{ value: 'dishes', label: 'Dishes' }, { value: 'restaurants', label: 'Restaurants' }]} />
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.ink, fontSize: 18, fontWeight: '800' }}>{who} recommendations</Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {kind === 'dishes' ? `Top ${TOP} dishes by ${isMe ? 'your' : 'their'} own scores.` : `Top ${TOP} restaurants by ${isMe ? 'your' : 'their'} average score there.`}
        </Text>
      </View>
      {list.length ? list.map((item, i) => (
        <Pressable key={item.id} accessibilityRole="link" onPress={item.href} style={[styles.row, { borderBottomColor: t.line }]}>
          <Text style={[styles.rank, { color: i < 3 ? t.accent : t.muted }]}>{i + 1}</Text>
          {item.photo ? <Image source={{ uri: photoUrl(item.photo) }} contentFit="cover" style={[styles.photo, { backgroundColor: t.card }]} />
            : <View style={[styles.photo, { backgroundColor: t.card }]} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{item.title}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{item.detail}</Text>
          </View>
          <ScorePill rating={item.score} />
        </Pressable>
      )) : (
        <Empty title="No recommendations yet"
          body={isMe ? `Dishes you score ${LIKED} or more show up here, best first.` : `Dishes they score ${LIKED} or more will show up here.`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 26, fontSize: 20, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  photo: { width: 52, height: 52, borderRadius: 8 },
});
