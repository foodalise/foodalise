import { useColorScheme } from '@/components/useColorScheme';

// Matches the approved prototype: quiet monochrome UI, colour only on scores.
const light = {
  bg: '#F2F2EF',
  surface: '#FFFFFF',
  ink: '#141614',
  muted: '#6E726C',
  line: '#E7E7E3',
  accent: '#141614',
  accentInk: '#FFFFFF',
  hi: '#17784F',
  mid: '#B7791F',
  lo: '#C2412D',
};

const dark: typeof light = {
  bg: '#0E0F0E',
  surface: '#171917',
  ink: '#F1F2EE',
  muted: '#9A9E97',
  line: '#272A26',
  accent: '#F1F2EE',
  accentInk: '#141614',
  hi: '#4CC28A',
  mid: '#E0A84A',
  lo: '#EE7A62',
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
