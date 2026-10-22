import * as Linking from 'expo-linking';
import { Share } from 'react-native';

// Shares a message with a link that opens Foodalise straight on your profile.
// In the real app the link starts foodalise://; in Expo Go it's an exp:// link
// that only works for people testing through Expo Go. Your @username is in the
// message too, so anyone can find you in Explore → People.
export async function inviteFriends(userId: string, username: string | null) {
  const link = Linking.createURL(`/user/${userId}`);
  const who = username ? `@${username}` : 'me';
  await Share.share({
    message: `I'm reviewing every dish I eat on Foodalise. Follow ${who} to see what's worth ordering: ${link}`,
  }).catch(() => null);
}
