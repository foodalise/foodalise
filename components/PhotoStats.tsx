import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';

const SIZE = 28;

// Likes in a heart, comments in a speech bubble and the score in a circle, for the
// bottom-right corner of a photo tile.
export function PhotoStats({ likes, comments, rating }: { likes: number; comments: number; rating: number }) {
  const t = useTheme();
  return (
    <View style={styles.row} accessibilityLabel={`${likes} likes, ${comments} comments, scored ${formatScore(rating)}`}>
      <Shape symbol="heart.fill" color="#E0245E" fallback={<View style={[styles.circle, { backgroundColor: '#E0245E' }]} />}>{likes}</Shape>
      <Shape symbol="bubble.left.fill" color="rgba(10,12,10,0.8)" fallback={<View style={[styles.bubble]} />}>{comments}</Shape>
      <View style={[styles.circle, { backgroundColor: scoreColor(t, rating) }]}>
        <Text style={styles.num} numberOfLines={1} adjustsFontSizeToFit>{formatScore(rating)}</Text>
      </View>
    </View>
  );
}

function Shape({ symbol, color, fallback, children }: { symbol: 'heart.fill' | 'bubble.left.fill'; color: string; fallback: ReactNode; children: number }) {
  return (
    <View style={styles.shape}>
      <SymbolView name={symbol} size={SIZE} tintColor={color} fallback={fallback} style={StyleSheet.absoluteFill} />
      <Text style={[styles.num, symbol === 'bubble.left.fill' && { marginTop: -3 }]} numberOfLines={1} adjustsFontSizeToFit>
        {children > 99 ? '99+' : children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', right: 4, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  shape: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  circle: { width: SIZE - 2, height: SIZE - 2, borderRadius: SIZE, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  bubble: { width: SIZE, height: SIZE - 6, borderRadius: 8, backgroundColor: 'rgba(10,12,10,0.8)' },
  num: { color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 2, fontVariant: ['tabular-nums'] },
});
