import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Empty, timeAgo } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { describe, loadNotifications, markAllRead, type Notice } from '@/lib/notifications';

// Yums, comments and new followers, newest first. Opening this marks them all read.
export default function NotificationsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Notice[] | null>(null);

  useFocusEffect(useCallback(() => {
    loadNotifications().then((list) => {
      setItems(list);
      if (list.some((n) => !n.read_at)) markAllRead();
    });
  }, []));

  function open(n: Notice) {
    if (n.kind === 'follow' && n.actor) router.push({ pathname: '/user/[id]', params: { id: n.actor.id } });
    else if (n.review_id) router.push({ pathname: '/comments/[id]', params: { id: n.review_id } });
  }

  return (
    <FlatList
      style={{ backgroundColor: t.surface }}
      data={items ?? []}
      keyExtractor={(n) => n.id}
      ListEmptyComponent={items ? <Empty title="Nothing yet" body="When people give you a yum, comment or follow you, you'll see it here." /> : undefined}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n)} style={({ pressed }) => [styles.row, { borderBottomColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
          <Avatar username={n.actor?.username} path={n.actor?.avatar_path} size={40} />
          <Text style={[styles.text, { color: t.ink }]} numberOfLines={3}>
            <Text style={{ fontWeight: '700' }}>@{n.actor?.username ?? 'someone'}</Text> {describe(n)}
            <Text style={{ color: t.muted }}>  {timeAgo(n.created_at)}</Text>
          </Text>
          {!n.read_at ? <View style={[styles.dot, { backgroundColor: t.accent }]} /> : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, fontSize: 15, lineHeight: 21 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
