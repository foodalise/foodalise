import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

// A review photo you can pinch to zoom (it springs back when you let go),
// double-tap to like, and press and hold to comment on.
export function ReviewPhoto({ uri, width, height, background, onDoubleTap, onHold }: {
  uri: string; width: number; height: number; background: string; onDoubleTap: () => void; onHold: () => void;
}) {
  const scale = useSharedValue(1);
  // Where the pinch started (from the photo's centre), and how far the fingers have moved since.
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const moveX = useSharedValue(0);
  const moveY = useSharedValue(0);
  const heart = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      focusX.value = e.focalX - width / 2;
      focusY.value = e.focalY - height / 2;
      startX.value = e.focalX;
      startY.value = e.focalY;
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(e.scale, 1), 4);
      moveX.value = e.focalX - startX.value;
      moveY.value = e.focalY - startY.value;
    })
    .onFinalize(() => {
      scale.value = withTiming(1, { duration: 220 });
      moveX.value = withTiming(0, { duration: 220 });
      moveY.value = withTiming(0, { duration: 220 });
    });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDelay(250).runOnJS(true).onEnd((_e, ok) => {
    if (!ok) return;
    heart.value = withSequence(withSpring(1, { damping: 9 }), withDelay(450, withTiming(0, { duration: 200 })));
    onDoubleTap();
  });
  const hold = Gesture.LongPress().minDuration(450).runOnJS(true).onStart(() => onHold());
  // A pinch wins over a hold or tap that started at the same time.
  const gesture = Gesture.Race(pinch, Gesture.Exclusive(doubleTap, hold));

  const zoomed = useAnimatedStyle(() => ({
    transform: [
      { translateX: moveX.value }, { translateY: moveY.value },
      { translateX: focusX.value }, { translateY: focusY.value },
      { scale: scale.value },
      { translateX: -focusX.value }, { translateY: -focusY.value },
    ],
  }));
  const pop = useAnimatedStyle(() => ({ opacity: heart.value, transform: [{ scale: 0.6 + heart.value * 0.4 }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.frame, { width, height, backgroundColor: background }]}>
        <Animated.View style={[{ width, height }, zoomed]}>
          <Image source={{ uri }} contentFit="cover" style={{ width, height }} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, pop]}>
          <SymbolView name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} tintColor="#FFFFFF" size={96}
            fallback={<Text style={{ fontSize: 96, color: '#FFFFFF' }}>♥</Text>} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Lists that show cards have 16pt side padding; the photo reaches past it to the screen edges.
  frame: { marginHorizontal: -16, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
