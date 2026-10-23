import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GalleryPhoto } from '@/components/PhotoGallery';
import { PhotoStrip } from '@/components/PhotoStrip';
import { Empty, ScorePill, Segmented } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { dishPhotos, restaurantPhotos } from '@/lib/photos';
import { loadWishlist, type WishPlace } from '@/lib/wishlist';

const STRIP_PHOTOS = 9;

// The best food photos from a restaurant on your list, every dish included.
function PlacePhotos({ restaurantId }: { restaurantId: string }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  useEffect(() => {
    let live = true;
    restaurantPhotos(restaurantId, 80).then((all) => { if (live) setPhotos(all.slice(0, STRIP_PHOTOS)); });
    return () => { live = false; };
  }, [restaurantId]);
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

// A "Want to try" list, yours or someone else's, as Dishes or Restaurants. Restaurants
// include any place where a dish was saved, with how many; Dishes are newest first.
export function WishlistList({ userId, isMe, username }: { userId: string; isMe: boolean; username: string | null }) {
  const t = useTheme();
  const [places, setPlaces] = useState<WishPlace[] | null>(null);
  const [kind, setKind] = useState<'dishes' | 'restaurants'>('dishes');
  useFocusEffect(useCallback(() => { loadWishlist(userId).then(setPlaces); }, [userId]));

  if (places === null) return null;
  const dishes = places.flatMap((p) => p.dishes.map((d) => ({ ...d, place: p.restaurant })))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const who = isMe ? 'You haven\'t' : `${username ? `@${username}` : 'They'} hasn't`;
  const openPlace = (id: string) => router.push({ pathname: '/restaurant/[id]', params: { id } });
  return (
    <View style={{ gap: 12 }}>
      <Segmented value={kind} onChange={setKind}
        options={[{ value: 'dishes', label: `Dishes${dishes.length ? ` (${dishes.length})` : ''}` }, { value: 'restaurants', label: `Restaurants${places.length ? ` (${places.length})` : ''}` }]} />
      {kind === 'dishes' ? (
        dishes.length ? dishes.map((d) => (
          <View key={d.id} style={[styles.card, { borderColor: t.line }]}>
            <Pressable onPress={() => router.push({ pathname: '/dish/[id]', params: { id: d.id } })} style={styles.head}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.ink, fontSize: 16, fontWeight: '800' }}>{d.name}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }} onPress={() => openPlace(d.place.id)}>at {d.place.name}</Text>
              </View>
              {d.review_count ? <ScorePill rating={Number(d.avg_rating)} /> : null}
            </Pressable>
            <DishPhotos dishId={d.id} />
          </View>
        )) : (
          <Empty title="No dishes saved yet"
            body={isMe ? 'Tap the bookmark on a dish to keep a list of what to order next.' : `${who} saved any dishes yet.`} />
        )
      ) : places.length ? places.map(({ restaurant: r, dishes: picked }) => (
        <View key={r.id} style={[styles.card, { borderColor: t.line }]}>
          <Pressable onPress={() => openPlace(r.id)} style={styles.head}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.ink, fontWeight: '800', fontSize: 16 }}>
                {r.name}
                {r.cuisine ? <Text style={{ color: t.muted, fontStyle: 'italic', fontWeight: '400', fontSize: 13 }}>  {r.cuisine}</Text> : null}
              </Text>
              {picked.length ? (
                <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                  {`${picked.length} ${picked.length === 1 ? 'dish' : 'dishes'} saved: ${picked.map((d) => d.name).join(', ')}`}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: t.muted, fontSize: 16 }}>›</Text>
          </Pressable>
          <PlacePhotos restaurantId={r.id} />
        </View>
      )) : (
        <Empty title="No restaurants saved yet"
          body={isMe ? 'Tap Want to try on a restaurant or a dish to keep a list of where to eat next.' : `${who} saved any restaurants yet.`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
});
