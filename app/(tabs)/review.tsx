import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Field, Label } from '@/components/ui';
import { formatScore, scoreColor, useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { addDish, postReview } from '@/lib/reviews';
import { supabase } from '@/lib/supabase';
import type { Restaurant } from '@/lib/types';

type Dish = { id: string; name: string; section: string | null };
type Photo = { uri: string; mimeType?: string | null };

export default function Review() {
  const t = useTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ restaurantId?: string; dishId?: string }>();

  const [restaurant, setRestaurant] = useState<Pick<Restaurant, 'id' | 'name' | 'address'> | null>(null);
  const [dish, setDish] = useState<Dish | null>(null);
  const [q, setQ] = useState('');
  const [restaurants, setRestaurants] = useState<Pick<Restaurant, 'id' | 'name' | 'address'>[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [rating, setRating] = useState(8);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opened from a restaurant or dish page: jump straight to the right step.
  useEffect(() => {
    if (params.dishId) {
      supabase.from('dishes').select('id, name, section, restaurants(id, name, address)').eq('id', params.dishId).single()
        .then(({ data }) => {
          if (!data) return;
          const { restaurants: r, ...d } = data as unknown as Dish & { restaurants: Restaurant };
          setRestaurant(r); setDish(d);
        });
    } else if (params.restaurantId) {
      supabase.from('restaurants').select('id, name, address').eq('id', params.restaurantId).single()
        .then(({ data }) => { if (data) { setRestaurant(data); setDish(null); } });
    }
  }, [params.dishId, params.restaurantId]);

  // Step 1: restaurant search.
  useEffect(() => {
    if (restaurant) return;
    const term = q.trim().replace(/[%_]/g, '');
    if (term.length < 2) { setRestaurants([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('restaurants').select('id, name, address')
        .ilike('name', `%${term}%`).order('name').limit(30);
      if (!cancelled) setRestaurants(data ?? []);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, restaurant]);

  // Step 2: that restaurant's menu.
  useEffect(() => {
    if (!restaurant) return;
    supabase.from('dishes').select('id, name, section').eq('restaurant_id', restaurant.id).order('name')
      .then(({ data }) => setDishes(data ?? []));
  }, [restaurant]);

  function reset() {
    setRestaurant(null); setDish(null); setQ(''); setPhoto(null); setRating(8); setBody(''); setError(null);
    router.setParams({ restaurantId: undefined, dishId: undefined });
  }

  async function pickPhoto(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError(fromCamera ? 'Camera access is off. Turn it on in Settings to take a photo.' : 'Photo access is off. Turn it on in Settings to choose a photo.'); return; }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  }

  async function addMissingDish() {
    if (!restaurant || !session || q.trim().length < 2) return;
    setBusy(true); setError(null);
    try { setDish({ ...(await addDish(restaurant.id, q, session.user.id)), section: null }); setQ(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!dish || !session || !photo) return;
    setBusy(true); setError(null);
    try {
      await postReview({ userId: session.user.id, dishId: dish.id, rating, body, photo });
      const id = dish.id;
      reset();
      router.push({ pathname: '/dish/[id]', params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const step = !restaurant ? 1 : !dish ? 2 : 3;
  const term = q.trim().toLowerCase();
  const shownDishes = dishes.filter((d) => !term || d.name.toLowerCase().includes(term));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.steps} accessibilityLabel={`Step ${step} of 3`}>
          {[1, 2, 3].map((i) => <View key={i} style={[styles.step, { backgroundColor: i <= step ? t.ink : t.line }]} />)}
        </View>

        {step === 1 ? (
          <>
            <Text style={[styles.h, { color: t.ink }]}>Where did you eat?</Text>
            <Field placeholder="Search restaurants" value={q} onChangeText={setQ} autoCorrect={false} />
            {restaurants.map((r) => (
              <Pressable key={r.id} style={[styles.row, { borderBottomColor: t.line }]} onPress={() => { setRestaurant(r); setQ(''); }}>
                <Text style={[styles.rowTitle, { color: t.ink }]}>{r.name}</Text>
                {r.address ? <Text style={{ color: t.muted, fontSize: 12 }}>{r.address}</Text> : null}
              </Pressable>
            ))}
            {q.trim().length >= 2 && !restaurants.length ? <Empty title="No restaurants found" body="Try a shorter name." /> : null}
          </>
        ) : null}

        {step === 2 && restaurant ? (
          <>
            <Text style={[styles.h, { color: t.ink }]}>What did you have at {restaurant.name}?</Text>
            <Field placeholder="Search the menu, or type a new dish" value={q} onChangeText={setQ} />
            {shownDishes.map((d) => (
              <Pressable key={d.id} style={[styles.row, { borderBottomColor: t.line }]} onPress={() => { setDish(d); setQ(''); }}>
                <Text style={[styles.rowTitle, { color: t.ink }]}>{d.name}</Text>
                {d.section ? <Text style={{ color: t.muted, fontSize: 12 }}>{d.section}</Text> : null}
              </Pressable>
            ))}
            {!dishes.length ? <Text style={{ color: t.muted }}>No menu for {restaurant.name} yet. Type the dish you ate above and add it.</Text> : null}
            {term.length >= 2 && !dishes.some((d) => d.name.toLowerCase() === term) ? (
              <Button variant="ghost" title={`Add "${q.trim()}" to the menu`} onPress={addMissingDish} busy={busy} />
            ) : null}
            <Button variant="ghost" title="Change restaurant" onPress={reset} />
          </>
        ) : null}

        {step === 3 && restaurant && dish ? (
          <>
            <View>
              <Text style={[styles.h, { color: t.ink }]}>{dish.name}</Text>
              <Text style={{ color: t.muted }}>at {restaurant.name}</Text>
            </View>
            {photo ? <Image source={{ uri: photo.uri }} style={[styles.photo, { backgroundColor: t.bg }]} contentFit="cover" /> : null}
            <View style={styles.pair}>
              <View style={{ flex: 1 }}><Button variant="ghost" title="Take photo" onPress={() => pickPhoto(true)} /></View>
              <View style={{ flex: 1 }}><Button variant="ghost" title={photo ? 'Change photo' : 'Choose photo'} onPress={() => pickPhoto(false)} /></View>
            </View>

            <Label>Your score</Label>
            <View style={styles.scoreRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Lower score" onPress={() => setRating((r) => Math.max(1, r - 0.5))}
                style={[styles.stepBtn, { borderColor: t.line }]}><Text style={[styles.stepTxt, { color: t.ink }]}>−</Text></Pressable>
              <Text style={[styles.score, { color: scoreColor(t, rating) }]}>{formatScore(rating)}<Text style={{ fontSize: 16, color: t.muted }}>/10</Text></Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Raise score" onPress={() => setRating((r) => Math.min(10, r + 0.5))}
                style={[styles.stepBtn, { borderColor: t.line }]}><Text style={[styles.stepTxt, { color: t.ink }]}>+</Text></Pressable>
            </View>

            <Label>Your review</Label>
            <Field multiline placeholder="How was it? Portion, flavour, would you order it again?" value={body} onChangeText={setBody}
              maxLength={2000} style={{ minHeight: 100, textAlignVertical: 'top' }} />

            <Button title="Post review" onPress={submit} busy={busy} disabled={!photo} />
            {!photo ? <Text style={{ color: t.muted, textAlign: 'center', fontSize: 12 }}>Add a photo to post.</Text> : null}
            <Button variant="ghost" title="Change dish" onPress={() => setDish(null)} />
          </>
        ) : null}

        {error ? <Text style={{ color: t.lo }}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  h: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  row: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontWeight: '600', fontSize: 15 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 26, fontWeight: '500' },
  score: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
