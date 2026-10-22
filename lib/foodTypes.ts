import type { CUISINES } from '@/lib/cuisines';

// The little picture shown next to a restaurant's name and on its map pin, for the
// kind of food it serves. A place's food type comes from (in order) an admin's fix,
// its menu, OpenStreetMap, words in its name, or its hygiene listing (see the
// food_types migration); places we can't place get a knife and fork.
const EMOJI: Record<(typeof CUISINES)[number], string> = {
  African: '🫘', American: '🌭', Bakery: '🥐', British: '🍳', Burgers: '🍔', Cafe: '☕', Caribbean: '🥥',
  Chicken: '🍗', Chinese: '🥡', Desserts: '🍨', 'Fish & Chips': '🐟', French: '🥖', Greek: '🫒', Healthy: '🥗',
  Indian: '🍛', Italian: '🍝', Japanese: '🍣', Kebab: '🥙', Korean: '🍲', 'Latin American': '🌯',
  Mediterranean: '🍅', Mexican: '🌮', 'Middle Eastern': '🧆', 'Pan-Asian': '🥢', Pizza: '🍕', Portuguese: '🥧',
  Pub: '🍺', Sandwiches: '🥪', Seafood: '🦞', Spanish: '🥘', Steak: '🥩', Thai: '🌶️', Turkish: '🍢',
  Vietnamese: '🍜', Other: '🍴',
};

export function foodEmoji(foodType: string | null | undefined) {
  return (foodType && EMOJI[foodType as keyof typeof EMOJI]) || '🍴';
}
