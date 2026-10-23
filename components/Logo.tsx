import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useColorScheme } from '@/components/useColorScheme';
import { brand } from '@/constants/theme';

// The Foodalise symbol: a loop with an eye on one side and a bowl of food on the other.
// Drawn around the loop's crossing; the same shapes make the app icon.
const LOBES = 'M0,0 C-30,-40 -52,-63 -95,-63 C-135,-63 -161,-35 -161,0 C-161,35 -135,63 -95,63 C-52,63 -30,40 0,0 '
  + 'C30,-40 52,-63 95,-63 C135,-63 161,-35 161,0 C161,35 135,63 95,63 C52,63 30,40 0,0';
const LEAF = 'M94,-7 Q116,-14.5 122,-37 Q100,-29.5 94,-7 Z';
const SAFFRON = 'M84.5,7.5 A17.5,17.5 0 0 1 119.5,7.5 Z';
const BOWL = 'M55,7.5 L130,7.5 A37.5,31 0 0 1 55,7.5 Z';
const RATIO = 346 / 150;

// White loop on dark backgrounds, ink loop on light ones (as in the brand sheet).
export function LogoSymbol({ height, onDark }: { height: number; onDark?: boolean }) {
  const scheme = useColorScheme();
  const dark = onDark ?? scheme === 'dark';
  const line = dark ? brand.white : brand.ink;
  return (
    <Svg width={height * RATIO} height={height} viewBox="-173 -75 346 150" accessibilityLabel="Foodalise">
      <Path d={LOBES} fill="none" stroke={line} strokeWidth={22} strokeLinejoin="round" />
      {dark ? (
        <>
          <Circle cx={-82} cy={0} r={26} fill={brand.white} />
          <Circle cx={-71} cy={0} r={13.5} fill={brand.ink} />
        </>
      ) : (
        <>
          <Circle cx={-80} cy={0} r={22} fill={brand.ink} />
          <Circle cx={-72} cy={-7} r={6} fill={brand.white} />
        </>
      )}
      <Circle cx={75.5} cy={-8} r={15.5} fill={brand.tomato} />
      <Path d={LEAF} fill={brand.basil} />
      <Path d={SAFFRON} fill={brand.saffron} />
      <Path d={BOWL} fill={line} />
    </Svg>
  );
}

// "F∞dalise": the symbol stands in for the two o's.
export function Wordmark({ size = 28, onDark }: { size?: number; onDark?: boolean }) {
  const scheme = useColorScheme();
  const dark = onDark ?? scheme === 'dark';
  const color = dark ? brand.white : brand.ink;
  // Letters a little larger than `size`; the symbol's loops sit on the baseline,
  // a touch taller than the lowercase letters, like a pair of o's.
  const font = size * 1.15;
  const text = [styles.word, { color, fontSize: font, lineHeight: font * 1.2 }];
  return (
    <View style={styles.row} accessible accessibilityLabel="Foodalise">
      <Text style={text}>F</Text>
      <View style={{ marginHorizontal: font * 0.03, transform: [{ translateY: font * 0.055 }] }}>
        <LogoSymbol height={font * 0.63} onDark={dark} />
      </View>
      <Text style={text}>dalise</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  word: { fontWeight: '900', letterSpacing: -0.5 },
});
