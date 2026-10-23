import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ScorePill, Segmented } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { coverPhoto, LIKED, placeDetail, rankDishes, rankRestaurants, TOP } from '@/lib/recommendations';
import { photoUrl } from '@/lib/supabase';
import type { FeedReview } from '@/lib/types';

type Ranked = { id: string; title: string; detail: string; score: number; photo: string | null; href: () => void };

// Someone's top 10, ranked by their own scores (lib/recommendations.ts): the dishes they
// rated highest, and the restaurants where their dishes averaged highest. On your own
// page the share icon makes the list into a picture to post.
export function Recommendations({ reviews, isMe, username }: { reviews: FeedReview[]; isMe: boolean; username: string | null }) {
  const t = useTheme();
  const [kind, setKind] = useState<'dishes' | 'restaurants'>('dishes');

  const dishes: Ranked[] = rankDishes(reviews).map((r) => ({
    id: r.id, title: r.dishes!.name, detail: r.dishes!.restaurants?.name ?? '', score: Number(r.rating), photo: coverPhoto(r),
    href: () => router.push({ pathname: '/dish/[id]', params: { id: r.dishes!.id } }),
  }));
  const restaurants: Ranked[] = rankRestaurants(reviews).map((p) => ({
    id: p.id, title: p.name, detail: placeDetail(p.picks), score: p.avg, photo: coverPhoto(p.picks[0]),
    href: () => router.push({ pathname: '/restaurant/[id]', params: { id: p.id } }),
  }));

  const list = kind === 'dishes' ? dishes : restaurants;
  const who = isMe ? 'My' : username ? `@${username}'s` : 'Their';
  return (
    <View style={{ gap: 12 }}>
      <Segmented value={kind} onChange={setKind}
        options={[{ value: 'dishes', label: 'Dishes' }, { value: 'restaurants', label: 'Restaurants' }]} />
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.ink, fontSize: 18, fontWeight: '800' }}>{who} recommendations</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {kind === 'dishes' ? `Top ${TOP} dishes by ${isMe ? 'your' : 'their'} own scores.` : `Top ${TOP} restaurants by ${isMe ? 'your' : 'their'} average score there.`}
          </Text>
        </View>
        {isMe && list.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Share your top ${kind}`} hitSlop={8}
            onPress={() => router.push({ pathname: '/top-list', params: { kind } })}
            style={[styles.share, { borderColor: t.line }]}>
            <SymbolView name="square.and.arrow.up" size={18} tintColor={t.ink} />
          </Pressable>
        ) : null}
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  share: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 26, fontSize: 20, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  photo: { width: 52, height: 52, borderRadius: 8 },
});
