import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Field, ReviewCard } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { blockUser, REPORT_REASONS } from '@/lib/safety';
import { addComment, deleteComment, loadComments, reportComment, type Comment } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { REVIEW_SELECT, type FeedReview } from '@/lib/types';

// One review with its comments, and a box to add yours.
export default function CommentsScreen() {
  const t = useTheme();
  const { id, write } = useLocalSearchParams<{ id: string; write?: string }>();
  const me = useAuth().session?.user.id;
  const [review, setReview] = useState<FeedReview | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const refresh = useCallback(async () => {
    const [{ data }, list] = await Promise.all([
      supabase.from('reviews').select(REVIEW_SELECT).eq('id', id).maybeSingle<FeedReview>(),
      loadComments(id),
    ]);
    setReview(data);
    setComments(list);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  async function post() {
    if (!me || !text.trim()) return;
    setBusy(true);
    try {
      await addComment(me, id, text);
      setText('');
      await refresh();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Yours, or on your review: delete it. Someone else's: report it or block them.
  function openMenu(c: Comment) {
    const who = c.profiles?.username ?? 'someone';
    const canDelete = c.user_id === me || review?.profiles?.id === me;
    const options = [
      ...(canDelete ? [{ text: 'Delete comment', style: 'destructive' as const, onPress: () => run(() => deleteComment(c.id)) }] : []),
      ...(c.user_id !== me ? [
        { text: 'Report comment', onPress: () => chooseReason(c) },
        { text: `Block @${who}`, style: 'destructive' as const, onPress: () => run(() => blockUser(me!, c.user_id), `@${who} is blocked.`) },
      ] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(`Comment by @${who}`, undefined, options);
  }

  function chooseReason(c: Comment) {
    Alert.alert("What's wrong with it?", 'The Foodalise team will check it, and it will be hidden for you.', [
      ...REPORT_REASONS.map((reason) => ({ text: reason, onPress: () => run(() => reportComment(me!, c.id, reason), "Thanks, we'll take a look.") })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function run(action: () => Promise<void>, done?: string) {
    try {
      await action();
      await refresh();
      if (done) Alert.alert(done);
    } catch (e) {
      Alert.alert((e as Error).message);
    }
  }

  if (review === null && comments !== null) {
    return <View style={{ flex: 1, backgroundColor: t.surface }}><Empty title="Review not found" body="It may have been deleted." /></View>;
  }

  return (
    <ScrollView ref={scroll} style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {review ? <ReviewCard review={review} onComment={() => scroll.current?.scrollToEnd({ animated: true })} /> : null}
      {comments?.length === 0 ? <Text style={{ color: t.muted }}>No comments yet. Start the conversation.</Text> : null}
      {comments?.map((c) => (
        <Pressable key={c.id} onLongPress={() => openMenu(c)} style={[styles.comment, { borderBottomColor: t.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.user_id } })}>
              <Text style={{ color: t.ink, fontWeight: '700' }}>@{c.profiles?.username ?? 'someone'}</Text>
            </Pressable>
            <Text style={{ color: t.ink, lineHeight: 20 }}>{c.body}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Comment options" onPress={() => openMenu(c)} hitSlop={10}>
            <Text style={{ color: t.muted, fontSize: 18, fontWeight: '800' }}>⋯</Text>
          </Pressable>
        </Pressable>
      ))}
      <Field placeholder="Add a comment" autoFocus={write === '1'} value={text} onChangeText={setText} maxLength={500} multiline
        onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)} />
      <Button title="Post comment" onPress={post} busy={busy} disabled={!text.trim()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
