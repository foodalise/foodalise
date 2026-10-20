import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { formatScore, scoreColor, useTheme } from '@/constants/theme';

const MIN = 1;
const MAX = 10;
const STEP = 0.5;

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n / STEP) * STEP));
const fraction = (n: number) => (n - MIN) / (MAX - MIN);

// One criterion (e.g. Taste): drag or tap along the track to set 1-10 in half steps.
export function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const color = scoreColor(t, value);

  function setFromTouch(e: GestureResponderEvent) {
    if (!width) return;
    const next = clamp(MIN + (e.nativeEvent.locationX / width) * (MAX - MIN));
    if (next !== value) onChange(next);
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: t.ink }]}>{label}</Text>
        <Text style={[styles.value, { color }]}>{formatScore(value)}<Text style={{ color: t.muted, fontSize: 12 }}>/10</Text></Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: MIN, max: MAX, now: value, text: `${formatScore(value)} out of 10` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP)))}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={setFromTouch}
        onResponderMove={setFromTouch}
        hitSlop={{ top: 12, bottom: 12 }}
        style={styles.touch}>
        <View pointerEvents="none" style={[styles.track, { backgroundColor: t.line }]}>
          <View style={[styles.fill, { width: `${fraction(value) * 100}%`, backgroundColor: color }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: fraction(value) * width - 13, borderColor: color, backgroundColor: t.surface }]} />
      </View>
    </View>
  );
}

// The overall score: the average of the criteria, with a bar that eases to its new length.
export function OverallBar({ value }: { value: number }) {
  const t = useTheme();
  const color = scoreColor(t, value);
  const anim = useRef(new Animated.Value(value / MAX)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value / MAX, duration: 250, useNativeDriver: false }).start();
  }, [anim, value]);

  return (
    <View style={[styles.overall, { backgroundColor: t.bg }]} accessibilityLabel={`Overall score ${formatScore(value)} out of 10`}>
      <View style={styles.head}>
        <Text style={[styles.overallLabel, { color: t.muted }]}>OVERALL</Text>
        <Text style={[styles.overallNum, { color }]}>{formatScore(value)}<Text style={{ fontSize: 16, color: t.muted }}>/10</Text></Text>
      </View>
      <View style={[styles.overallTrack, { backgroundColor: t.line }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontWeight: '700', fontSize: 15 },
  value: { fontWeight: '800', fontSize: 18, fontVariant: ['tabular-nums'] },
  touch: { height: 30, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  thumb: { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 3 },
  overall: { padding: 14, borderRadius: 14, gap: 10 },
  overallLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  overallNum: { fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] },
  overallTrack: { height: 14, borderRadius: 7, overflow: 'hidden' },
});
