import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GalleryPhoto } from '@/components/PhotoGallery';
import { useTheme } from '@/constants/theme';
import { photoUrl } from '@/lib/supabase';

// A row of small food photos you can swipe through. Tapping one opens that post.
// Photos of dishes in `highlight` get the dish name on them.
export function PhotoStrip({ photos, highlight }: { photos: GalleryPhoto[]; highlight?: Set<string> }) {
  const t = useTheme();
  if (!photos.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {photos.map((p) => (
        <Pressable key={p.path} accessibilityLabel={p.dish}
          onPress={() => router.push({ pathname: '/comments/[id]', params: { id: p.reviewId } })}>
          <Image source={{ uri: photoUrl(p.path) }} style={[styles.photo, { backgroundColor: t.line }]} contentFit="cover" />
          {p.dishId && highlight?.has(p.dishId) ? (
            <View style={styles.tag}>
              <Text numberOfLines={1} style={styles.tagText}>{p.dish}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photo: { width: 84, height: 84, borderRadius: 10 },
  tag: { position: 'absolute', left: 4, right: 4, bottom: 4, backgroundColor: 'rgba(20,20,20,0.75)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  tagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
