import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/constants/theme';
import { CONTACT_EMAIL, OPERATOR } from '@/lib/legal';

// Shown in the app and linked from the App Store listing. Keep it in plain words.
const UPDATED = '22 October 2026';

const SECTIONS: [string, string][] = [
  ['Who we are', `Foodalise is an app for photographing, scoring and sharing the dishes you eat at restaurants in the UK. It is run by ${OPERATOR}, who is responsible for your data (the "data controller"). Contact: ${CONTACT_EMAIL}.`],
  ['What we collect', 'Your email address and password (to sign you in), your username, profile photo, bio and favourite cuisines, and what you post: reviews, scores, dish photos, menu photos, comments, likes, who you follow, dishes and restaurants you save, and any posts you report or people you block. If you allow notifications, we keep a code for your phone so we can send them.'],
  ['Why we use it', 'To run the app for you, as our agreement with you (the Terms of Use). We also use reports, blocks and posting limits to keep Foodalise safe and stop fake reviews, which is in everyone\'s legitimate interest. We do not sell your data, show you adverts or use it to train AI.'],
  ['What is public', 'Your username, profile photo, bio, reviews, scores, dish photos, comments and who you follow can be seen by anyone using Foodalise. Your email address is never shown.'],
  ['Your location', 'With your permission, your phone\'s location is used to show restaurants and dishes near you. It is sent to our database only to find what\'s nearby and is never stored.'],
  ['Who else handles your data', "Supabase stores everything on servers in London. Expo (in the US) delivers notifications to your phone. Google's Gmail sends password reset emails. When you snap a menu, the photo goes to Anthropic's Claude AI (in the US) to read the dish names. Restaurant names and addresses (never your details) are used to find restaurant websites through OpenStreetMap and Google, and Jina Reader helps load those websites. Services outside the UK are covered by the UK's approved data transfer safeguards."],
  ['How long we keep it', 'Your account and posts are kept until you delete them. Notification codes are deleted with your account, or replaced when someone else signs in on that phone. Reports are kept while they are needed to keep the app safe.'],
  ['Deleting your data', 'You can delete any review from your profile. To delete everything, go to You > Delete my account. Your account, reviews and photos are then removed for good.'],
  ['Your rights', `You can ask for a copy of your data, ask us to correct or delete it, or object to how we use it. Email ${CONTACT_EMAIL} and we will reply within a month. If you are unhappy with how we handle your data, you can complain to the Information Commissioner's Office at ico.org.uk.`],
  ['Age', 'You need to be 13 or older to use Foodalise.'],
  ['Reporting', 'If a review or photo is offensive or looks fake, tap ⋯ on it to report it or block the person. We check reports and remove content that breaks the rules.'],
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
