import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { unreadCount } from '@/lib/notifications';

// The bell at the top right of the Feed, with a count of unread notifications.
export function NotificationBell() {
  const t = useTheme();
  const [count, setCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let live = true;
    const check = () => unreadCount().then((n) => { if (live) setCount(n); });
    check();
    const timer = setInterval(check, 60_000);
    return () => { live = false; clearInterval(timer); };
  }, []));

  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={10} accessibilityRole="button"
      accessibilityLabel={count ? `Notifications, ${count} new` : 'Notifications'} style={{ marginRight: 16 }}>
      <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} tintColor={t.ink} size={24} />
      {count > 0 ? (
        <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
          backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.accentInk, fontSize: 11, fontWeight: '800' }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
