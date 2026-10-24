import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View, type HostInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { Wordmark } from '@/components/Logo';
import { Button } from '@/components/ui';
import { brand, formatScore, useTheme } from '@/constants/theme';
import { photoUrl, supabase } from '@/lib/supabase';
import { firstPhoto, REVIEW_SELECT, type FeedReview } from '@/lib/types';

// A review as a picture to post on Instagram (or anywhere): the photo, the dish, the
// score and the Foodalise logo. Saved at 1080 x 1350, Instagram's portrait size.
export default function ShareScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [review, setReview] = useState<FeedReview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const card = useRef<HostInstance>(null);
  const cardWidth = Math.min(width - 32, 400);

  useEffect(() => {
    supabase.from('reviews').select(REVIEW_SELECT).eq('id', id).maybeSingle<FeedReview>().then(({ data }) => setReview(data));
  }, [id]);

  async function share() {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'jpg', quality: 0.92, width: 1080, height: 1350, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your review' });
    } catch (e) {
      Alert.alert((e as Error).message || "Couldn't make the picture. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const photo = review ? firstPhoto(review) : null;
  const dish = review?.dishes;
  const place = dish?.restaurants;
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 16, alignItems: 'center' }}>
      {review && photo ? (
        <View ref={card} collapsable={false} style={[styles.card, { width: cardWidth, height: cardWidth * 1.25 }]}>
          <Image source={{ uri: photoUrl(photo) }} style={StyleSheet.absoluteFill} contentFit="cover" onLoad={() => setLoaded(true)} />
          <View style={styles.info}>
            {/* A soft shadow behind the words only, fading out above them so the photo stays clear. */}
            <Svg style={styles.shade} preserveAspectRatio="none" viewBox="0 0 1 1">
              <Defs>
                <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000" stopOpacity="0" />
                  <Stop offset="0.45" stopColor="#000" stopOpacity="0.35" />
                  <Stop offset="1" stopColor="#000" stopOpacity="0.65" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="1" height="1" fill="url(#shade)" />
            </Svg>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.dish} numberOfLines={2}>{dish?.name}</Text>
              {place ? (
                <Text style={styles.place} numberOfLines={1}>
                  {place.name}{place.cuisine ? <Text style={{ fontStyle: 'italic' }}> · {place.cuisine}</Text> : null}
                </Text>
              ) : null}
              {review.profiles ? <Text style={styles.by}>@{review.profiles.username}</Text> : null}
            </View>
            <View style={styles.score}>
              <Text style={styles.scoreNum}>{formatScore(Number(review.rating))}</Text>
              <Text style={styles.scoreOf}>/10</Text>
            </View>
          </View>
          <View style={styles.brandBar}><Wordmark size={18} onDark /></View>
        </View>
      ) : review ? (
        <Text style={{ color: t.muted }}>Only reviews with a photo can be shared as a picture.</Text>
      ) : null}
      {photo ? (
        <View style={{ alignSelf: 'stretch', gap: 8 }}>
          <Button title="Share" onPress={share} busy={busy} disabled={!loaded} />
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>Pick Instagram to post it to your feed or story.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: brand.ink, justifyContent: 'flex-end' },
  // Starts 40pt above the words so the fade has room; the info box itself is only as tall as its text.
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: -40 },
  info: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  dish: { color: brand.white, fontSize: 24, fontWeight: '900', letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  place: { color: brand.white, fontSize: 15, opacity: 0.9 },
  by: { color: brand.white, fontSize: 13, opacity: 0.75, marginTop: 4 },
  score: { width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: brand.white, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  scoreNum: { color: brand.white, fontSize: 19, fontWeight: '900' },
  scoreOf: { color: brand.white, fontSize: 9, opacity: 0.8, marginTop: -2 },
  brandBar: { backgroundColor: brand.ink, paddingVertical: 10, alignItems: 'center' },
});
