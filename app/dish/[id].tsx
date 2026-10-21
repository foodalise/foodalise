import { Image } from 'expo-image';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Label, ReviewCard, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { photoUrl, supabase } from '@/lib/supabase';
import { firstPhoto, REVIEW_SELECT, type FeedReview } from '@/lib/types';
import { isWanted, setWanted } from '@/lib/wishlist';

type Dish = { id: string; name: string; section: string | null; restaurants: { id: string; name: string } | null };

export default function DishScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dish, setDish] = useState<Dish | null>(null);
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const me = useAuth().session?.user.id;
  const [wanted, setWantedState] = useState(false);

  useEffect(() => {
    supabase.from('dishes').select('id, name, section, restaurants(id, name)').eq('id', id).single<Dish>()
      .then(({ data }) => setDish(data));
    supabase.from('reviews').select(REVIEW_SELECT).eq('dish_id', id).order('created_at', { ascending: false })
      .returns<FeedReview[]>().then(({ data }) => setReviews(data ?? []));
    isWanted(id).then(setWantedState);
  }, [id]);

  async function toggleWanted() {
    if (!me) return;
    const next = !wanted;
    setWantedState(next);
    try {
      await setWanted(me, id, next);
    } catch (e) {
      setWantedState(!next);
      Alert.alert((e as Error).message);
    }
  }

  const photos = reviews.map(firstPhoto).filter((p): p is string => !!p);
  const avg = reviews.length ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length : null;

  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: dish?.name ?? '' }} />
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((p) => <Image key={p} source={{ uri: photoUrl(p) }} style={[styles.photo, { backgroundColor: t.bg }]} contentFit="cover" />)}
        </ScrollView>
      ) : null}
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.title, { color: t.ink }]}>{dish?.name}</Text>
          {dish?.restaurants ? (
            <Link href={{ pathname: '/restaurant/[id]', params: { id: dish.restaurants.id } }} asChild>
              <Pressable><Text style={{ color: t.muted, textDecorationLine: 'underline' }}>at {dish.restaurants.name}</Text></Pressable>
            </Link>
          ) : null}
        </View>
        <ScorePill rating={avg} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Review this dish" onPress={() => router.push({ pathname: '/review', params: { dishId: id } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" title={wanted ? '✓ Want to try' : '+ Want to try'} onPress={toggleWanted} />
        </View>
      </View>
      <Label>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</Label>
      {reviews.length ? reviews.map((r) => <ReviewCard key={r.id} review={r} />) : <Empty title="No reviews yet" body="Yours could be the first." />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photo: { width: 280, height: 280, borderRadius: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6 },
});
