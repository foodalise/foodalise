import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PhotoStats } from '@/components/PhotoStats';
import { useTheme } from '@/constants/theme';
import { photoUrl } from '@/lib/supabase';

export type GalleryPhoto = { path: string; reviewId: string; dishId?: string; dish: string; likes: number; comments: number; rating: number; at?: string };

// Photos in pages of 9 (a 3 x 3 grid); swipe sideways for the next 9.
// Tapping a photo opens that post with its comments.
const PER_PAGE = 9;

export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const pageWidth = width - 32;
  const gap = 4;
  const tile = Math.floor((pageWidth - gap * 2) / 3);
  const [index, setIndex] = useState(0);
  const pages: GalleryPhoto[][] = [];
  for (let i = 0; i < photos.length; i += PER_PAGE) pages.push(photos.slice(i, i + PER_PAGE));

  return (
    <View style={{ gap: 6 }}>
      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={pages}
        keyExtractor={(page) => page[0].path}
        style={{ width: pageWidth }}
        getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
        renderItem={({ item: page }) => (
          <View style={{ width: pageWidth, flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {page.map((p) => (
              <Pressable key={p.path} accessibilityLabel={p.dish}
                onPress={() => router.push({ pathname: '/comments/[id]', params: { id: p.reviewId } })}>
                <Image source={{ uri: photoUrl(p.path) }} style={{ width: tile, height: tile, borderRadius: 8, backgroundColor: t.bg }} contentFit="cover" />
                <PhotoStats likes={p.likes} comments={p.comments} rating={p.rating} />
              </Pressable>
            ))}
          </View>
        )}
      />
      {pages.length > 1 ? (
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === index ? t.ink : t.line }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
