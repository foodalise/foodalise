import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/constants/theme';
import type { LegalPage } from '@/lib/legal';

// One of the legal pages from lib/legal.ts, as shown in the app.
export function LegalPageView({ page }: { page: LegalPage }) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: page.title }} />
      <Text style={{ color: t.muted }}>Last updated {page.updated}</Text>
      {page.sections.map(([title, body]) => (
        <Text key={title} style={{ color: t.ink, lineHeight: 21 }}>
          <Text style={styles.title}>{title}{'\n'}</Text>
          {body}
        </Text>
      ))}
      <Text style={{ color: t.ink }}>{page.footer}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '800', fontSize: 16 },
});
