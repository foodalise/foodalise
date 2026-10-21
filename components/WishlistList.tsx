import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GalleryPhoto } from '@/components/PhotoGallery';
import { PhotoStrip } from '@/components/PhotoStrip';
import { Empty, ScorePill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { dishPhotos, restaurantPhotos } from '@/lib/photos';
import { loadWishlist, type WishPlace } from '@/lib/wishlist';

const STRIP_PHOTOS = 9;

// Food photos from a restaurant on your list. Dishes you picked get their own row
// further down, so their photos are left out here.
function PlacePhotos({ place }: { place: WishPlace }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const picked = useMemo(() => new Set(place.dishes.map((d) => d.id)), [place.dishes]);
  const id = place.restaurant.id;
  useEffect(() => {
    let live = true;
    restaurantPhotos(id, 80).then((all) => {
      if (live) setPhotos(all.filter((p) => !(p.dishId && picked.has(p.dishId))).slice(0, STRIP_PHOTOS));
    });
    return () => { live = false; };
  }, [id, picked]);
  if (!photos.length) return null;
  return <View style={{ paddingBottom: 10 }}><PhotoStrip photos={photos} /></View>;
}

// Photos of one dish you want to try.
function DishPhotos({ dishId }: { dishId: string }) {
  const t = useTheme();
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  useEffect(() => {
    let live = true;
    dishPhotos(dishId).then((p) => { if (live) setPhotos(p.slice(0, STRIP_PHOTOS)); });
    return () => { live = false; };
  }, [dishId]);
  if (photos === null) return null;
  if (!photos.length) return <Text style={{ color: t.muted, fontSize: 13, paddingBottom: 10 }}>No photos of this dish yet.</Text>;
  return <View style={{ paddingBottom: 10 }}><PhotoStrip photos={photos} /></View>;
}

// Your "Want to try" list, grouped by restaurant: where to go, and what to order there.
export function WishlistList() {
  const t = useTheme();
  const [places, setPlaces] = useState<WishPlace[] | null>(null);
  useFocusEffect(useCallback(() => { loadWishlist().then(setPlaces); }, []));

  if (places === null) return null;
  if (!places.length) {
    return <Empty title="Nothing saved yet" body="Tap Want to try on a restaurant or a dish to keep a list of where to eat next." />;
  }
  return (
    <View style={{ gap: 10 }}>
      {places.map((place) => { const { restaurant: r, dishes } = place; return (
        <View key={r.id} style={[styles.card, { borderColor: t.line }]}>
          <Pressable onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })} style={styles.head}>
            <Text style={{ color: t.ink, fontWeight: '800', fontSize: 16, flex: 1 }}>
              {r.name}
              {r.cuisine ? <Text style={{ color: t.muted, fontStyle: 'italic', fontWeight: '400', fontSize: 13 }}>  {r.cuisine}</Text> : null}
            </Text>
            <Text style={{ color: t.muted, fontSize: 16 }}>›</Text>
          </Pressable>
          <PlacePhotos place={place} />
          {dishes.length ? dishes.map((d) => (
            <View key={d.id} style={[styles.dish, { borderTopColor: t.line }]}>
              <Pressable onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })} style={styles.dishHead}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>{d.name}</Text>
                {d.review_count ? <ScorePill rating={Number(d.avg_rating)} /> : null}
              </Pressable>
              <DishPhotos dishId={d.id} />
            </View>
          )) : (
            <Pressable onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
              style={[styles.row, { borderTopColor: t.line }]}>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>No dishes picked yet. See what to order</Text>
            </Pressable>
          )}
        </View>
      ); })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  dish: { borderTopWidth: StyleSheet.hairlineWidth },
  dishHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
