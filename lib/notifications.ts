import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type Notice = {
  id: string;
  kind: 'like' | 'comment' | 'follow';
  review_id: string | null;
  created_at: string;
  read_at: string | null;
  actor: { id: string; username: string; avatar_path: string | null } | null;
  review: { dishes: { name: string } | null } | null;
  comment: { body: string } | null;
};

const SELECT = `id, kind, review_id, created_at, read_at,
  actor:profiles!notifications_actor_id_fkey(id, username, avatar_path),
  review:reviews(dishes(name)),
  comment:review_comments(body)`;

export async function loadNotifications() {
  const { data } = await supabase.from('notifications').select(SELECT)
    .order('created_at', { ascending: false }).limit(100).returns<Notice[]>();
  return data ?? [];
}

export async function unreadCount() {
  const { data } = await supabase.rpc('unread_notifications');
  return typeof data === 'number' ? data : 0;
}

export async function markAllRead() {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
}

export function describe(n: Notice) {
  const dish = n.review?.dishes?.name ?? 'review';
  if (n.kind === 'like') return `gave your ${dish} a yum`;
  if (n.kind === 'comment') return `commented on your ${dish}: ${n.comment?.body ?? ''}`;
  return 'started following you';
}

// Show pushes as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Asks once for permission, then saves this phone's push address for the signed-in
// person. Push needs the app's Expo project id, which comes with the TestFlight
// setup; until then this quietly does nothing and the bell still works.
export async function registerForPush() {
  if (Platform.OS === 'web') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('register_push_token', { push_token: token });
  } catch {
    // No push on this device (a simulator, or Expo Go without push): the bell still works.
  }
}
