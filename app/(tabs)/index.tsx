import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text } from 'react-native';

import { Empty, ReviewCard } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { REVIEW_SELECT, type FeedReview } from '@/lib/types';

export default function Feed() {
  const t = useTheme();
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('reviews').select(REVIEW_SELECT)
      .order('created_at', { ascending: false }).limit(30).returns<FeedReview[]>();
    setError(error ? error.message : null);
    setReviews(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      data={reviews}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <ReviewCard review={item} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={error ? <Text style={{ color: t.lo }}>Couldn't load the feed: {error}</Text> : undefined}
      ListEmptyComponent={loading ? undefined : <Empty title="No reviews yet" body="Review a dish and it will show up here." />}
    />
  );
}
