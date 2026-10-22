import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Wordmark } from '@/components/Logo';
import { Button, Chips, Field } from '@/components/ui';
import { brand, formatScore, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { photoUrl, supabase } from '@/lib/supabase';

type Row = {
  rating: number;
  review_photos: { storage_path: string; position: number }[];
  dishes: { id: string; name: string; section: string | null;
    restaurants: { name: string; cuisine: string | null; local_authority: string | null } | null } | null;
};
type Entry = { dishId: string; dish: string; place: string; cuisine: string | null; area: string | null; section: string | null; rating: number; photo: string | null };

const SIZE = 5;

function scoreColor(r: number) {
  return r >= 8 ? brand.basil : r >= 6 ? brand.saffron : brand.tomato;
}

// "My top 5 burgers in Brent": your best-rated dishes, filtered by a word or
// cuisine and an area, made into a story-sized picture to share on Instagram.
export default function TopList() {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const { width } = useWindowDimensions();
  const [entries, setEntries] = useState<Entry[] | null>(null);
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
      .select('rating, review_photos(storage_path, position), dishes(id, name, section, restaurants(name, cuisine, local_authority))')
      .eq('user_id', me).order('rating', { ascending: false }).limit(500).returns<Row[]>()
      .then(({ data }) => {
        // One entry per dish: your best score for it.
        const best = new Map<string, Entry>();
        for (const r of data ?? []) {
          if (!r.dishes) continue;
          const prev = best.get(r.dishes.id);
          if (prev && prev.rating >= Number(r.rating)) continue;
          const photo = [...r.review_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? prev?.photo ?? null;
          best.set(r.dishes.id, {
            dishId: r.dishes.id, dish: r.dishes.name, section: r.dishes.section, rating: Number(r.rating), photo,
            place: r.dishes.restaurants?.name ?? '', cuisine: r.dishes.restaurants?.cuisine ?? null, area: r.dishes.restaurants?.local_authority ?? null,
          });
        }
        setEntries([...best.values()].sort((a, b) => b.rating - a.rating));
      });
  }, [me]);

  const cuisines = useMemo(() => [...new Set((entries ?? []).map((e) => e.cuisine).filter((c): c is string => !!c))].sort(), [entries]);
  const areas = useMemo(() => [...new Set((entries ?? []).map((e) => e.area).filter((a): a is string => !!a))].sort(), [entries]);

  const term = word.trim().toLowerCase();
  const top = (entries ?? []).filter((e) =>
    (!cuisine || e.cuisine === cuisine)
    && (!area || e.area === area)
    && (!term || [e.dish, e.section, e.cuisine].some((s) => s?.toLowerCase().includes(term))),
  ).slice(0, SIZE);

  const what = word.trim() || (cuisine ? `${cuisine} dishes` : 'dishes');
  const autoTitle = `My top ${top.length || SIZE} ${what}${area ? ` in ${area}` : ''}`;
  const shownTitle = title.trim() || autoTitle;

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
      <Field placeholder="A dish, e.g. burger, curry, pizza" value={word} onChangeText={setWord} autoCorrect={false} autoCapitalize="none" />
      {cuisines.length ? (
        <Chips items={cuisines.map((c) => ({ key: c, label: c, on: cuisine === c, onPress: () => setCuisine(cuisine === c ? null : c) }))} />
      ) : null}
      {areas.length > 1 ? (
        <Chips items={[{ key: '*', label: 'Everywhere', on: !area, onPress: () => setArea(null) },
          ...areas.map((a) => ({ key: a, label: a, on: area === a, onPress: () => setArea(a) }))]} />
      ) : null}
      <Field placeholder={autoTitle} value={title} onChangeText={setTitle} maxLength={60} />

      {entries && !top.length ? (
        <Text style={{ color: t.muted, textAlign: 'center', marginVertical: 24 }}>
          {entries.length ? 'None of your reviews match. Try another word or area.' : 'Review a few dishes first, then make your top list.'}
        </Text>
      ) : null}

      {top.length ? (
        <View ref={card} collapsable={false}
          style={{ width: cardWidth, height: cardWidth * (16 / 9), alignSelf: 'center', borderRadius: s(18), overflow: 'hidden',
            backgroundColor: brand.ink, paddingHorizontal: s(20), paddingVertical: s(24) }}>
          <Wordmark size={s(20)} onDark />
          <Text style={{ color: brand.white, fontSize: s(30), fontWeight: '900', letterSpacing: -0.6, lineHeight: s(34), marginTop: s(18), marginBottom: s(16) }}
            numberOfLines={3}>{shownTitle}</Text>
          <View style={{ flex: 1, gap: s(10) }}>
            {top.map((e, i) => (
              <View key={e.dishId} style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
                <Text style={{ color: i === 0 ? brand.paprika : brand.white, fontSize: s(22), fontWeight: '900', width: s(22), textAlign: 'center' }}>{i + 1}</Text>
                {e.photo
                  ? <Image source={{ uri: photoUrl(e.photo) }} style={{ width: s(64), height: s(64), borderRadius: s(12) }} contentFit="cover" />
                  : <View style={{ width: s(64), height: s(64), borderRadius: s(12), backgroundColor: '#2A2A2A' }} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: brand.white, fontSize: s(16), fontWeight: '800' }} numberOfLines={2}>{e.dish}</Text>
                  <Text style={{ color: brand.white, opacity: 0.7, fontSize: s(13) }} numberOfLines={1}>{e.place}</Text>
                </View>
                <View style={{ borderRadius: 999, paddingHorizontal: s(10), paddingVertical: s(4), backgroundColor: scoreColor(e.rating) }}>
                  <Text style={{ color: brand.white, fontWeight: '900', fontSize: s(15) }}>{formatScore(e.rating)}</Text>
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

