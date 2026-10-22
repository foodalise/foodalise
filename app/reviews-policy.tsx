import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/constants/theme';
import { CONTACT_EMAIL } from '@/lib/legal';

// How Foodalise keeps reviews honest. UK law (the DMCC Act 2024) asks any app that
// shows reviews to publish a policy like this and to act on fake reviews.
const UPDATED = '22 October 2026';

const SECTIONS: [string, string][] = [
  ['Real dishes, real opinions', 'Only review a dish you ate yourself, and say what you honestly thought. One review per dish visit.'],
  ['Not allowed', "Fake reviews of any kind: reviewing a dish you didn't eat, reviewing your own restaurant or a rival's, posting for someone else, or swapping or buying reviews. Restaurants must not offer anything in return for a review or for changing one."],
  ['Free food and gifts', 'If you were given the dish free, paid, or given anything else for your review, say so at the start of your review (for example "Free meal from the restaurant"). Reviews that hide this will be removed.'],
  ['What we never do', "We don't pay for reviews, sell positive reviews, or hide bad ones. Restaurants can't remove or edit reviews they don't like. Scores are worked out from every review that follows these rules."],
  ['How we check', 'Each person can post up to 20 reviews a day and review the same dish once a day. Anyone can report a review as "Looks fake or paid for" from the ⋯ menu. Our team checks every report.'],
  ['What happens to fake reviews', "We remove them, which also takes them out of the dish's score. People who post them can lose their account, and restaurants involved may be marked or removed."],
];

export default function ReviewsPolicy() {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Reviews policy' }} />
      <Text style={{ color: t.muted }}>Last updated {UPDATED}</Text>
      {SECTIONS.map(([title, body]) => (
        <Text key={title} style={{ color: t.ink, lineHeight: 21 }}>
          <Text style={styles.title}>{title}{'\n'}</Text>
          {body}
        </Text>
      ))}
      {CONTACT_EMAIL ? <Text style={{ color: t.ink }}>Spotted something suspicious? Email {CONTACT_EMAIL}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '800', fontSize: 16 },
});
