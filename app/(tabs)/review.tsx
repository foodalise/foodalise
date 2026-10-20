import { View } from 'react-native';

import { Empty } from '@/components/ui';
import { useTheme } from '@/constants/theme';

// Posting a review (restaurant → dish → photo + score) lands in the next change.
export default function Review() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, padding: 16 }}>
      <Empty title="Posting reviews is coming next" body="For now, find a restaurant in Explore to see its dishes and scores." />
    </View>
  );
}
