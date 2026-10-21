import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { photoUrl } from '@/lib/supabase';

export type GalleryPhoto = { path: string; reviewId: string; dish: string; likes: number; comments: number };

// Full-width photos you swipe through, with a "3 / 24" counter.
// Tapping a photo opens that post with its comments.
export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const size = width - 32;
  const [index, setIndex] = useState(0);

  return (
    <View style={{ gap: 6 }}>
      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={photos}
        keyExtractor={(p) => p.path}
        style={{ width: size, borderRadius: 12 }}
        getItemLayout={(_, i) => ({ length: size, offset: size * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / size))}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/comments/[id]', params: { id: item.reviewId } })}>
            <Image source={{ uri: photoUrl(item.path) }} style={{ width: size, height: size, backgroundColor: t.bg }} contentFit="cover" />
            <View style={styles.caption}>
              <Text style={styles.captionText} numberOfLines={1}>{item.dish}</Text>
              <Text style={styles.captionText}>♥ {item.likes}   💬 {item.comments}</Text>
            </View>
          </Pressable>
        )}
      />
      {photos.length > 1 ? (
        <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>{index + 1} / {photos.length} · swipe for more</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  captionText: { color: '#fff', fontWeight: '600', flexShrink: 1 },
});
