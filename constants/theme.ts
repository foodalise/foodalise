import { useColorScheme } from '@/components/useColorScheme';

// The Foodalise brand colours (from the logo sheet). Orange is left out on purpose.
export const brand = {
  ink: '#141414',
  white: '#FFFFFF',
  tomato: '#E5402F',
  basil: '#2FA54F',
  saffron: '#FFC233',
};

// Quiet ink-and-white UI; colour only on scores, from the logo's food. On white,
// basil and saffron are darkened a little so score numbers stay readable.
const light = {
  bg: '#F2F2EF',
  surface: brand.white,
  ink: brand.ink,
  muted: '#6E6E6A',
  line: '#E7E7E3',
  accent: brand.ink,
  accentInk: brand.white,
  hi: '#228A3E',
  mid: '#C98A00',
  lo: brand.tomato,
};

const dark: typeof light = {
  bg: '#0A0A0A',
  surface: brand.ink,
  ink: '#F2F2EF',
  muted: '#9A9A96',
  line: '#2A2A2A',
  accent: '#F2F2EF',
  accentInk: brand.ink,
  hi: brand.basil,
  mid: brand.saffron,
  lo: '#F0604F',
};

export type Theme = typeof light;
export const themes = { light, dark };

export function useTheme(): Theme {
  return themes[useColorScheme()];
}

export function scoreColor(t: Theme, rating: number | null | undefined) {
  if (rating == null) return t.muted;
  if (rating >= 8) return t.hi;
  if (rating >= 6) return t.mid;
  return t.lo;
}

export function formatScore(rating: number | null | undefined) {
  if (rating == null) return '–';
  return (Math.round(rating * 10) / 10).toString();
}
