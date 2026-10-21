import { useColorScheme } from '@/components/useColorScheme';

// The Foodalise brand colours: the logo's ink, food colours, and paprika orange
// for buttons and highlights ("Ink & Paprika").
export const brand = {
  ink: '#141414',
  white: '#FFFFFF',
  paprika: '#FF6B2C',
  tomato: '#E5402F',
  basil: '#2FA54F',
  saffron: '#FFC233',
};

// Kept for reference; the app always uses the dark theme below.
const light = {
  bg: '#F2F2EF',
  surface: brand.white,
  card: brand.white,
  ink: brand.ink,
  muted: '#6E6E6A',
  line: '#E7E7E3',
  accent: brand.paprika,
  accentInk: brand.white,
  hi: '#228A3E',
  mid: '#C98A00',
  lo: brand.tomato,
};

// Dark and premium: near-black screens, slightly lighter cards, paprika for actions.
const dark: typeof light = {
  bg: '#0A0A0A',
  surface: '#111111',
  card: '#1B1B1B',
  ink: '#F5F5F2',
  muted: '#9A9A96',
  line: '#2A2A2A',
  accent: brand.paprika,
  accentInk: brand.white,
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

// A colour at some opacity, e.g. tint('#2FA54F', 0.2) for a score badge's background.
export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
