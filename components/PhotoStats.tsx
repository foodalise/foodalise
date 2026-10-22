import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { YumBowl } from '@/components/YumBowl';
import { formatScore } from '@/constants/theme';

const SIZE = 28;
const WHITE = '#fff';

// Yums beside a little bowl, comments in a speech bubble and the score in a circle, all
// in white so they sit lightly on the photo, for its bottom-right corner.
export function PhotoStats({ likes, comments, rating, showRating = true }: { likes: number; comments: number; rating: number; showRating?: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel={`${likes} ${likes === 1 ? 'yum' : 'yums'}, ${comments} comments, scored ${formatScore(rating)}`}>
      <View style={[styles.yums, styles.shadow]}>
        <YumBowl size={20} yummed color={WHITE} />
        <Text style={styles.num} numberOfLines={1}>{likes > 99 ? '99+' : likes}</Text>
      </View>
      <Shape symbol="bubble.left" fallback={<View style={styles.bubble} />}>{comments}</Shape>
      {showRating ? (
        <View style={[styles.ring, styles.shadow]}>
          <Text style={styles.num} numberOfLines={1} adjustsFontSizeToFit>{formatScore(rating)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Shape({ symbol, fallback, children }: { symbol: 'bubble.left'; fallback: ReactNode; children: number }) {
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
  yums: { flexDirection: 'row', alignItems: 'center', marginRight: 2 },
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
