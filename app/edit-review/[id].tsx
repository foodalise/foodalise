import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { OverallBar, ScoreSlider } from '@/components/ScoreSlider';
import { Button, Empty, Field, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { choosePhoto, editReview, type PickedPhoto } from '@/lib/reviews';
import { photoUrl, supabase } from '@/lib/supabase';
import { firstPhoto, REVIEW_SELECT, type FeedReview } from '@/lib/types';

type Scores = { taste: number; presentation: number; ingredients: number; value: number };
const CRITERIA: { key: keyof Scores; label: string }[] = [
  { key: 'taste', label: 'Taste' },
  { key: 'presentation', label: 'Presentation' },
  { key: 'ingredients', label: 'Quality of ingredients' },
  { key: 'value', label: 'Value for money' },
];

// Change the scores, photo or words of one of your own reviews.
export default function EditReview() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth().session?.user.id;
  const [review, setReview] = useState<FeedReview | null | undefined>(undefined);
  const [scores, setScores] = useState<Scores | null>(null);
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    supabase.from('reviews').select(REVIEW_SELECT).eq('id', id).maybeSingle<FeedReview>().then(({ data }) => {
      setReview(data);
      if (!data) return;
      // Scores a review doesn't have yet (older reviews) start at its overall score.
      const start = Number(data.rating);
      setScores({
        taste: Number(data.taste ?? start), presentation: Number(data.presentation ?? start),
        ingredients: Number(data.ingredients ?? start), value: Number(data.value ?? start),
      });
      setBody(data.body ?? '');
    });
  }, [id]);

  async function pickPhoto(fromCamera: boolean) {
    setError(null);
    try {
      const picked = await choosePhoto(fromCamera);
      if (picked) setPhoto(picked);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    if (!me || !scores) return;
    setBusy(true); setError(null);
    try {
      await editReview({ reviewId: id, userId: me, ...scores, body, photo });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (review === null || (review && review.profiles?.id !== me)) {
    return <View style={{ flex: 1, backgroundColor: t.surface }}><Empty title="Review not found" body="It may have been deleted." /></View>;
  }
  if (!review || !scores) return <View style={{ flex: 1, backgroundColor: t.surface }} />;

  const current = firstPhoto(review);
  const shown = photo?.uri ?? (current ? photoUrl(current) : null);
  return (
    <ScrollView ref={scroll} style={{ backgroundColor: t.surface }} contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <View>
        <Text style={[styles.h, { color: t.ink }]}>{review.dishes?.name ?? 'Your review'}</Text>
        {review.dishes?.restaurants ? <Text style={{ color: t.muted }}>at {review.dishes.restaurants.name}</Text> : null}
      </View>
      <OverallBar value={(scores.taste + scores.presentation + scores.ingredients + scores.value) / 4} />
      {CRITERIA.map(({ key, label }) => (
        <ScoreSlider key={key} label={label} value={scores[key]} onChange={(n) => setScores((sc) => sc && ({ ...sc, [key]: n }))} />
      ))}

      {shown ? <Image source={{ uri: shown }} style={[styles.photo, { backgroundColor: t.bg }]} contentFit="cover" /> : null}
      <View style={styles.pair}>
        <View style={{ flex: 1 }}><Button variant="ghost" title="Take photo" onPress={() => pickPhoto(true)} /></View>
        <View style={{ flex: 1 }}><Button variant="ghost" title="Change photo" onPress={() => pickPhoto(false)} /></View>
      </View>

      <Label>Your review</Label>
      <Field multiline placeholder="How was it? Portion, flavour, would you order it again?" value={body} onChangeText={setBody}
        onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
        maxLength={2000} style={{ minHeight: 100, textAlignVertical: 'top' }} />

      <Button title="Save changes" onPress={save} busy={busy} />
      <Button variant="ghost" title="Cancel" onPress={() => router.back()} />
      {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  h: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  pair: { flexDirection: 'row', gap: 8 },
});
