import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/constants/theme';
import { CONTACT_EMAIL } from '@/lib/legal';

// The rules for using Foodalise, in plain words. Agreed to when creating an account.
const UPDATED = '22 October 2026';

const SECTIONS: [string, string][] = [
  ['Using Foodalise', 'Foodalise lets you photograph, score and share the dishes you eat at restaurants. You need to be 13 or older to make an account. Keep your password safe; you are responsible for what is posted from your account.'],
  ['Your posts', 'You own the photos, scores and reviews you post. By posting them you let Foodalise store, show and share them in the app, and use them to promote Foodalise, without paying you. This stops when you delete the post or your account, apart from copies other people already shared or short-lived backups.'],
  ['Be fair and honest', "Only review dishes you actually ate, and give your honest opinion. Don't post fake reviews, including reviews of your own restaurant or a rival's. Only post photos you took or have permission to use. If you got the dish free or were paid, say so in your review. Our Reviews policy (in Settings) has the details."],
  ['Not allowed', "Nothing offensive, hateful, sexual, violent or illegal. No harassing or threatening anyone, no sharing other people's personal details, no spam or adverts, and no photos that aren't about food or the restaurant."],
  ['Reports and removal', 'You can report any review or block any person. We check reports and may remove posts or close accounts that break these rules, without warning if needed.'],
  ['Menus and restaurant details', 'Menus are collected from restaurant websites, menu photos and diners, and restaurant details come from public records. They can be wrong or out of date, so check prices with the restaurant. Never rely on Foodalise for allergy or dietary information: always ask the restaurant.'],
  ['Our responsibility', "We work to keep Foodalise running and accurate, but it is provided as it is, and we can't promise it will always be available or error free. As far as the law allows, we aren't responsible for losses from using it. Nothing here affects your legal rights as a consumer."],
  ['Changes', 'We may update these terms. If the changes are important, we will tell you in the app. Carrying on using Foodalise means you accept the new terms.'],
  ['The law', 'These terms are governed by the law of England and Wales.'],
];

export default function Terms() {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Terms of Use' }} />
      <Text style={{ color: t.muted }}>Last updated {UPDATED}</Text>
      {SECTIONS.map(([title, body]) => (
        <Text key={title} style={{ color: t.ink, lineHeight: 21 }}>
          <Text style={styles.title}>{title}{'\n'}</Text>
          {body}
        </Text>
      ))}
      {CONTACT_EMAIL ? <Text style={{ color: t.ink }}>Questions or a post to report: {CONTACT_EMAIL}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '800', fontSize: 16 },
});
