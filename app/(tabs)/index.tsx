import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { Empty, ReviewCard, Segmented } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { REVIEW_SELECT, type FeedReview } from '@/lib/types';

type Mode = 'following' | 'everyone';

// Reviews from people you follow (and your own), or from everyone.
export default function Feed() {
  const t = useTheme();
  const me = useAuth().session?.user.id;
  const [mode, setMode] = useState<Mode>('following');
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followsAnyone, setFollowsAnyone] = useState(true);
  const firstLoad = useRef(true);

  const load = useCallback(async (quiet = false) => {
    if (!me) return;
    if (!quiet) setLoading(true);
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', me);
    const ids = (follows ?? []).map((f) => f.following_id);
    setFollowsAnyone(ids.length > 0);
    // Someone new who follows nobody yet starts on Everyone, so the feed isn't empty.
    let show = mode;
    if (firstLoad.current) {
      firstLoad.current = false;
      if (!ids.length) { show = 'everyone'; setMode('everyone'); }
    }
    let query = supabase.from('reviews').select(REVIEW_SELECT);
    if (show === 'following') query = query.in('user_id', [me, ...ids]);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(30).returns<FeedReview[]>();
    setError(error ? error.message : null);
    setReviews(data ?? []);
    setLoading(false);
  }, [me, mode]);

  // Reload whenever the screen comes back into view, so new follows and reviews show up.
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      data={reviews}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <ReviewCard review={item} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Segmented value={mode} onChange={setMode}
            options={[{ value: 'following', label: 'Following' }, { value: 'everyone', label: 'Everyone' }]} />
          {error ? <Text style={{ color: t.lo }}>Couldn't load the feed: {error}</Text> : null}
        </View>
      }
      ListEmptyComponent={loading ? undefined : mode === 'following' && !followsAnyone
        ? <Empty title="Follow some foodies" body="Search for friends in Explore > People. Their reviews will show up here." />
        : <Empty title="No reviews yet" body="Review a dish and it will show up here." />}
    />
  );
}
