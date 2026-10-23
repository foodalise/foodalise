import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/constants/theme';

// Data sources that require a credit wherever their data is used.
const CREDITS: [string, string][] = [
  ['Restaurants and hygiene ratings', 'Food Standards Agency food hygiene rating data. Contains public sector information licensed under the Open Government Licence v3.0.'],
  ['Restaurants, food types and websites', 'Partly from OpenStreetMap. © OpenStreetMap contributors, available under the Open Database Licence (ODbL). Ask us at foodalise.app@gmail.com for a copy of the OpenStreetMap-based data we use, under the same licence.'],
  ['Menus', "Read from restaurants' own websites and from menu photos taken by diners, with the help of Claude AI by Anthropic."],
  ['Maps', 'Apple Maps.'],
];

export default function Credits() {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Data credits' }} />
      {CREDITS.map(([title, body]) => (
        <Text key={title} style={{ color: t.ink, lineHeight: 21 }}>
          <Text style={styles.title}>{title}{'\n'}</Text>
          {body}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '800', fontSize: 16 },
});
