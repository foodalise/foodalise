import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatScore } from '@/constants/theme';

const SIZE = 28;
const WHITE = '#fff';

// Likes in a heart, comments in a speech bubble and the score in a circle, all as
// white outlines so they sit lightly on the photo, for its bottom-right corner.
export function PhotoStats({ likes, comments, rating }: { likes: number; comments: number; rating: number }) {
  return (
    <View style={styles.row} accessibilityLabel={`${likes} likes, ${comments} comments, scored ${formatScore(rating)}`}>
      <Shape symbol="heart" fallback={<View style={styles.ring} />}>{likes}</Shape>
      <Shape symbol="bubble.left" fallback={<View style={styles.bubble} />}>{comments}</Shape>
      <View style={[styles.ring, styles.shadow]}>
        <Text style={styles.num} numberOfLines={1} adjustsFontSizeToFit>{formatScore(rating)}</Text>
      </View>
    </View>
  );
}

function Shape({ symbol, fallback, children }: { symbol: 'heart' | 'bubble.left'; fallback: ReactNode; children: number }) {
  return (
    <View style={styles.shape}>
      <SymbolView name={symbol} size={SIZE} tintColor={WHITE} fallback={fallback} style={[StyleSheet.absoluteFill, styles.shadow]} />
      <Text style={[styles.num, symbol === 'bubble.left' && { marginTop: -3 }]} numberOfLines={1} adjustsFontSizeToFit>
        {children > 99 ? '99+' : children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', right: 4, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  shape: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { width: SIZE - 2, height: SIZE - 2, borderRadius: SIZE, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: WHITE },
  bubble: { width: SIZE, height: SIZE - 6, borderRadius: 8, borderWidth: 1.5, borderColor: WHITE },
  // A soft shadow keeps white readable on pale photos without darkening them.
  shadow: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } },
  num: {
    color: WHITE, fontSize: 10, fontWeight: '800', paddingHorizontal: 2, fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 },
  },
});
