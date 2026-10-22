import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { brand } from '@/constants/theme';

// The bowl of food from the Foodalise logo, used for "yums" (our likes).
// Empty bowl: not yummed yet. Yummed: the tomato, saffron and leaf drop in with a bounce.
// Same shapes and coordinates as the logo (components/Logo.tsx), framed around the bowl.
const VIEW = '50 -44 86 86';
const LEAF = 'M94,-7 Q116,-14.5 122,-37 Q100,-29.5 94,-7 Z';
const SAFFRON = 'M84.5,7.5 A17.5,17.5 0 0 1 119.5,7.5 Z';
const BOWL = 'M55,7.5 L130,7.5 A37.5,31 0 0 1 55,7.5 Z';

// oneBounce: the food drops, bounces up once and lands for good (the big double-tap bowl);
// otherwise it springs in with a few small bounces (the bowl under each post).
export function YumBowl({ size, yummed, color, playOnMount = false, oneBounce = false }: {
  size: number; yummed: boolean; color: string; playOnMount?: boolean; oneBounce?: boolean;
}) {
  const tomato = useSharedValue(0);
  const saffron = useSharedValue(0);
  const leaf = useSharedValue(0);
  const shown = useSharedValue(yummed && !playOnMount ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    const animate = !first.current || playOnMount;
    first.current = false;
    if (!yummed) { shown.value = 0; return; }
    shown.value = 1;
    if (!animate) return;
    // Each piece starts above the bowl and falls in, one after another.
    [tomato, saffron, leaf].forEach((v, i) => {
      v.value = -size;
      v.value = withDelay(i * 90, oneBounce
        ? withSequence(
          withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
          withTiming(-size * 0.16, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) }))
        : withSpring(0, { damping: 7, stiffness: 170 }));
    });
  }, [yummed, playOnMount, oneBounce, size, tomato, saffron, leaf, shown]);

  const box = { width: size, height: size, position: 'absolute' as const };
  return (
    <View style={{ width: size, height: size }}>
      <Piece style={box} y={tomato} shown={shown}>
        <Circle cx={75.5} cy={-8} r={15.5} fill={brand.tomato} />
      </Piece>
      <Piece style={box} y={leaf} shown={shown}>
        <Path d={LEAF} fill={brand.basil} />
      </Piece>
      <Piece style={box} y={saffron} shown={shown}>
        <Path d={SAFFRON} fill={brand.saffron} />
      </Piece>
      {/* The bowl sits in front, so the food lands in it. Empty, it's an outline. */}
      <Svg style={box} width={size} height={size} viewBox={VIEW}>
        <Path d={BOWL} fill={yummed ? color : 'none'} stroke={color} strokeWidth={7} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function Piece({ style, y, shown, children }: {
  style: object; y: SharedValue<number>; shown: SharedValue<number>; children: ReactNode;
}) {
  const move = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[style, move]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={VIEW}>{children}</Svg>
    </Animated.View>
  );
}
