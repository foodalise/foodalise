import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/constants/theme';
import { CONTACT_EMAIL } from '@/lib/legal';

// Shown in the app and linked from the App Store listing. Keep it in plain words.
const UPDATED = '21 October 2026';

const SECTIONS: [string, string][] = [
  ['Who we are', 'Foodalise is an app for photographing, scoring and sharing the dishes you eat at restaurants in the UK.'],
  ['What we collect', 'Your email address and password (to sign you in), your username, and what you post: reviews, scores, dish photos, menu photos, who you follow, and any reviews you report or people you block.'],
  ['What is public', 'Your username, reviews, scores, dish photos and follower counts can be seen by anyone using Foodalise. Your email address is never shown.'],
  ['Your location', 'The Map tab uses your location on your phone to show restaurants near you. It is not sent to us or stored.'],
  ['Menus and AI', "When you snap a menu, the photo is sent to Anthropic's Claude AI to read the dish names. Restaurant names and addresses are used to look up their public websites (via OpenStreetMap and Google) so their menus can be read. None of this includes your personal details."],
  ['Where your data is kept', 'Your data is stored with Supabase on servers in London. We do not sell your data or show you adverts.'],
  ['Deleting your data', 'You can delete any review from your profile. To delete everything, go to You > Delete my account. Your account, reviews and photos are then removed for good.'],
  ['Reporting', 'If a review or photo is offensive, tap ⋯ on it to report it or block the person. We check reports and remove content that breaks the rules.'],
];

export default function Privacy() {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Privacy policy' }} />
      <Text style={{ color: t.muted }}>Last updated {UPDATED}</Text>
      {SECTIONS.map(([title, body]) => (
        <Text key={title} style={{ color: t.ink, lineHeight: 21 }}>
          <Text style={styles.title}>{title}{'\n'}</Text>
          {body}
        </Text>
      ))}
      {CONTACT_EMAIL ? <Text style={{ color: t.ink }}>Questions or requests about your data: {CONTACT_EMAIL}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '800', fontSize: 16 },
});
