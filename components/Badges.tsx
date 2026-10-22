import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Badge = { key: string; emoji: string; name: string; detail: string; progress: number; goal: number; earned: boolean };

// A row of badges on a profile. Your own page also shows the ones still to win,
// faded, with how close you are; other people's show only what they've earned.
export function Badges({ userId, isMe }: { userId: string; isMe: boolean }) {
  const t = useTheme();
  const [badges, setBadges] = useState<Badge[]>([]);

  useFocusEffect(useCallback(() => {
    supabase.rpc('user_badges', { uid: userId }).then(({ data }) => setBadges((data as Badge[] | null) ?? []));
  }, [userId]));

  const shown = isMe ? badges : badges.filter((b) => b.earned);
  if (!shown.length) return null;
  const won = badges.filter((b) => b.earned).length;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>
        Badges <Text style={{ color: t.muted, fontWeight: '400' }}>{won}</Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {shown.map((b) => (
          <Pressable key={b.key} accessibilityRole="button" accessibilityLabel={`${b.name}${b.earned ? '' : `, ${b.progress} of ${b.goal}`}`}
            onPress={() => Alert.alert(`${b.emoji} ${b.name}`, b.earned ? `${b.detail}. Earned!` : `${b.detail}. ${b.progress} of ${b.goal} so far.`)}
            style={[styles.badge, { backgroundColor: t.card, borderColor: b.earned ? t.accent : t.line, opacity: b.earned ? 1 : 0.55 }]}>
            <Text style={styles.emoji}>{b.emoji}</Text>
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 12, textAlign: 'center' }} numberOfLines={2}>{b.name}</Text>
            {b.earned ? null : (
              <View style={[styles.track, { backgroundColor: t.line }]}>
                <View style={{ width: `${Math.round((100 * b.progress) / b.goal)}%`, height: '100%', borderRadius: 2, backgroundColor: t.accent }} />
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 96, borderWidth: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  emoji: { fontSize: 28 },
  track: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
});
