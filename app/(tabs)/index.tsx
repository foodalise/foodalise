import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { Chips, Empty, ReviewCard } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { restaurantsNear } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import { REVIEW_SELECT, type FeedReview } from '@/lib/types';
import { wantedDishIds } from '@/lib/wishlist';

type Mode = 'following' | 'near' | 'top' | 'new';
const MODES: { key: Mode; label: string }[] = [
  { key: 'following', label: 'Following' },
  { key: 'near', label: 'Near you' },
  { key: 'top', label: 'Top rated' },
  { key: 'new', label: 'New' },
];
const TOP_RATED_DAYS = 30;
// The same reviews, but only those whose dish is at one of a set of restaurants.
const AT_RESTAURANTS = REVIEW_SELECT.replace('dishes(id, name,', 'dishes!inner(id, name, restaurant_id,');

// Reviews from people you follow (and your own), from places near you, the
// best-scored this month, or the newest from everyone.
export default function Feed() {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const [mode, setMode] = useState<Mode>('following');
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followsAnyone, setFollowsAnyone] = useState(true);
  const [locationOff, setLocationOff] = useState(false);
  const firstLoad = useRef(true);
  // Tapping the Feed tab, from any tab, starts you at the top.
  const list = useRef<FlatList<FeedReview>>(null);
  const navigation = useNavigation();
  useEffect(() => (navigation as unknown as { addListener: (e: 'tabPress', cb: () => void) => () => void })
    .addListener('tabPress', () => list.current?.scrollToOffset({ offset: 0, animated: true })), [navigation]);

  const load = useCallback(async (quiet = false) => {
    if (!me) return;
    if (!quiet) setLoading(true);
    wantedDishIds(true);
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', me);
    const ids = (follows ?? []).map((f) => f.following_id);
    setFollowsAnyone(ids.length > 0);
    // Someone new who follows nobody yet starts on New, so the feed isn't empty.
    let show = mode;
    if (firstLoad.current) {
      firstLoad.current = false;
      if (!ids.length) { show = 'new'; setMode('new'); }
    }
    let near: string[] | null = null;
    if (show === 'near') {
      near = await nearbyRestaurantIds();
      setLocationOff(near === null);
      if (!near?.length) { setReviews([]); setError(null); setLoading(false); return; }
    }
    const select: string = near ? AT_RESTAURANTS : REVIEW_SELECT;
    let query = supabase.from('reviews').select(select);
    if (near) query = query.in('dishes.restaurant_id', near);
    if (show === 'following') query = query.in('user_id', [me, ...ids]);
    if (show === 'top') {
      query = query.gte('created_at', new Date(Date.now() - TOP_RATED_DAYS * 86_400_000).toISOString())
        .order('rating', { ascending: false });
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(30).returns<FeedReview[]>();
    setError(error ? error.message : null);
    setReviews(data ?? []);
    setLoading(false);
  }, [me, mode]);

  // Reload whenever the screen comes back into view, so new follows and reviews show up.
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const empty = mode === 'following' && !followsAnyone
    ? <Empty title="Follow some foodies" body="Search for friends in Explore > People. Their reviews will show up here." />
    : mode === 'near' && locationOff
      ? <Empty title="Location is off" body="Turn on location for Foodalise in your phone's Settings to see reviews near you." />
      : mode === 'near'
        ? <Empty title="Nothing near you yet" body="Be the first to review a dish around here." />
        : <Empty title="No reviews yet" body="Review a dish and it will show up here." />;

  return (
    <FlatList
      ref={list}
      style={{ backgroundColor: t.surface }}
      contentContainerStyle={{ padding: 16, gap: 28 }}
      data={reviews}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <ReviewCard review={item} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={t.muted} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Chips style={{ marginHorizontal: -16, paddingHorizontal: 16 }}
            items={MODES.map((m) => ({ key: m.key, label: m.label, on: mode === m.key, onPress: () => setMode(m.key) }))} />
          {error ? <Text style={{ color: t.lo }}>Couldn't load the feed: {error}</Text> : null}
        </View>
      }
      ListEmptyComponent={loading ? undefined : empty}
    />
  );
}

// The restaurants closest to you, or null if location is off.
async function nearbyRestaurantIds() {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) return null;
  const pos = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000 }))
    ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return (await restaurantsNear(pos.coords, 80)).map((r) => r.id);
}
