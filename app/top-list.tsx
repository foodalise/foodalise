import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Wordmark } from '@/components/Logo';
import { Button, Chips, Field } from '@/components/ui';
import { brand, formatScore, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { coverPhoto, LIKED, placeDetail, rankDishes, rankRestaurants, TOP } from '@/lib/recommendations';
import { photoUrl, supabase } from '@/lib/supabase';

type Row = {
  id: string;
  rating: number;
  created_at: string;
  review_photos: { storage_path: string; position: number }[];
  dishes: { id: string; name: string; section: string | null;
    restaurants: { id: string; name: string; cuisine: string | null; local_authority: string | null } | null } | null;
};
type Entry = { id: string; title: string; detail: string; rating: number; photo: string | null };

function scoreColor(r: number) {
  return r >= 8 ? brand.basil : r >= 6 ? brand.saffron : brand.tomato;
}

// Your Top 10 dishes or restaurants (the same ranking as the profile's Top 10 tab),
// made into a story-sized picture to share on Instagram. Narrow it to a dish, a
// cuisine or an area for lists like "My top 3 burgers in Brent".
export default function TopList() {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const { kind: asked } = useLocalSearchParams<{ kind?: string }>();
  const kind = asked === 'restaurants' ? 'restaurants' : 'dishes';
  const { width } = useWindowDimensions();
  const [reviews, setReviews] = useState<Row[] | null>(null);
  const [username, setUsername] = useState('');
  const [word, setWord] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const card = useRef<View>(null);
  const cardWidth = Math.min(width - 32, 360);
  const scale = cardWidth / 360;

  useEffect(() => {
    if (!me) return;
    supabase.from('profiles').select('username').eq('id', me).maybeSingle().then(({ data }) => setUsername(data?.username ?? ''));
    supabase.from('reviews')
      .select('id, rating, created_at, review_photos(storage_path, position), dishes(id, name, section, restaurants(id, name, cuisine, local_authority))')
      .eq('user_id', me).order('created_at', { ascending: false }).limit(1000).returns<Row[]>()
      .then(({ data }) => setReviews(data ?? []));
  }, [me]);

  const cuisines = useMemo(() => [...new Set((reviews ?? []).map((r) => r.dishes?.restaurants?.cuisine).filter((c): c is string => !!c))].sort(), [reviews]);
  const areas = useMemo(() => [...new Set((reviews ?? []).map((r) => r.dishes?.restaurants?.local_authority).filter((a): a is string => !!a))].sort(), [reviews]);

  const term = word.trim().toLowerCase();
  const picked = (reviews ?? []).filter((r) => {
    const place = r.dishes?.restaurants;
    return (!cuisine || place?.cuisine === cuisine)
      && (!area || place?.local_authority === area)
      && (!term || [r.dishes?.name, r.dishes?.section, place?.cuisine, place?.name].some((x) => x?.toLowerCase().includes(term)));
  });
  const top: Entry[] = kind === 'dishes'
    ? rankDishes(picked).map((r) => ({ id: r.id, title: r.dishes!.name, detail: r.dishes!.restaurants?.name ?? '', rating: Number(r.rating), photo: coverPhoto(r) }))
    : rankRestaurants(picked).map((p) => ({ id: p.id, title: p.name, detail: placeDetail(p.picks), rating: p.avg, photo: coverPhoto(p.picks[0]) }));

  const what = word.trim() || (cuisine ? `${cuisine} ${kind === 'dishes' ? 'dishes' : 'restaurants'}` : kind);
  const autoTitle = `My top ${top.length || TOP} ${what}${area ? ` in ${area}` : ''}`;
  const shownTitle = title.trim() || autoTitle;
  // Up to 5 rows get big photos; a longer list packs in smaller rows so all 10 fit.
  const roomy = top.length <= 5;

  async function share() {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'jpg', quality: 0.92, width: 1080, height: 1920, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your top list' });
    } catch (e) {
      Alert.alert((e as Error).message || "Couldn't make the picture. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const s = (n: number) => n * scale;
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Field placeholder={kind === 'dishes' ? 'A dish, e.g. burger, curry, pizza' : 'A dish or a name, e.g. curry'} value={word} onChangeText={setWord} autoCorrect={false} autoCapitalize="none" />
      {cuisines.length ? (
        <Chips items={cuisines.map((c) => ({ key: c, label: c, on: cuisine === c, onPress: () => setCuisine(cuisine === c ? null : c) }))} />
      ) : null}
      {areas.length > 1 ? (
        <Chips items={[{ key: '*', label: 'Everywhere', on: !area, onPress: () => setArea(null) },
          ...areas.map((a) => ({ key: a, label: a, on: area === a, onPress: () => setArea(a) }))]} />
      ) : null}
      <Field placeholder={autoTitle} value={title} onChangeText={setTitle} maxLength={60} />

      {reviews && !top.length ? (
        <Text style={{ color: t.muted, textAlign: 'center', marginVertical: 24 }}>
          {picked.length ? `None of those scored ${LIKED} or more yet. Try another word or area.` : reviews.length ? 'None of your reviews match. Try another word or area.' : 'Review a few dishes first, then make your top list.'}
        </Text>
      ) : null}

      {top.length ? (
        <View ref={card} collapsable={false}
          style={{ width: cardWidth, height: cardWidth * (16 / 9), alignSelf: 'center', borderRadius: s(18), overflow: 'hidden',
            backgroundColor: brand.ink, paddingHorizontal: s(20), paddingVertical: s(24) }}>
          <Wordmark size={s(20)} onDark />
          <Text style={{ color: brand.white, fontSize: s(roomy ? 30 : 26), fontWeight: '900', letterSpacing: -0.6, lineHeight: s(roomy ? 34 : 30), marginTop: s(roomy ? 18 : 14), marginBottom: s(roomy ? 16 : 12) }}
            numberOfLines={roomy ? 3 : 2}>{shownTitle}</Text>
          <View style={{ flex: 1, gap: s(roomy ? 10 : 6) }}>
            {top.map((e, i) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
                <Text style={{ color: i === 0 ? brand.paprika : brand.white, fontSize: s(roomy ? 22 : 17), fontWeight: '900', width: s(22), textAlign: 'center' }}>{i + 1}</Text>
                {e.photo
                  ? <Image source={{ uri: photoUrl(e.photo) }} style={{ width: s(roomy ? 64 : 40), height: s(roomy ? 64 : 40), borderRadius: s(roomy ? 12 : 8) }} contentFit="cover" />
                  : <View style={{ width: s(roomy ? 64 : 40), height: s(roomy ? 64 : 40), borderRadius: s(roomy ? 12 : 8), backgroundColor: '#2A2A2A' }} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: brand.white, fontSize: s(roomy ? 16 : 14), fontWeight: '800' }} numberOfLines={roomy ? 2 : 1}>{e.title}</Text>
                  <Text style={{ color: brand.white, opacity: 0.7, fontSize: s(roomy ? 13 : 11.5) }} numberOfLines={1}>{e.detail}</Text>
                </View>
                <View style={{ borderRadius: 999, paddingHorizontal: s(roomy ? 10 : 8), paddingVertical: s(roomy ? 4 : 3), backgroundColor: scoreColor(e.rating) }}>
                  <Text style={{ color: brand.white, fontWeight: '900', fontSize: s(roomy ? 15 : 13) }}>{formatScore(e.rating)}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={{ color: brand.white, opacity: 0.75, fontSize: s(13), textAlign: 'center' }}>
            {username ? `@${username} on Foodalise` : 'Foodalise'}
          </Text>
        </View>
      ) : null}

      {top.length ? (
        <View style={{ gap: 8 }}>
          <Button title="Share" onPress={share} busy={busy} />
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>Pick Instagram to post it to your story.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

