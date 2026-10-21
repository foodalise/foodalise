// The cuisines a restaurant can be filed under. The fetch-menu function keeps its own
// copy of this list (supabase/functions/fetch-menu), so change both together.
export const CUISINES = [
  'African', 'American', 'Bakery', 'British', 'Burgers', 'Cafe', 'Caribbean', 'Chicken', 'Chinese', 'Desserts',
  'Fish & Chips', 'French', 'Greek', 'Healthy', 'Indian', 'Italian', 'Japanese', 'Kebab', 'Korean', 'Latin American',
  'Mediterranean', 'Mexican', 'Middle Eastern', 'Pan-Asian', 'Pizza', 'Portuguese', 'Pub', 'Sandwiches', 'Seafood',
  'Spanish', 'Steak', 'Thai', 'Turkish', 'Vietnamese', 'Other',
] as const;

export const DIETS = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten_free', label: 'Gluten free' },
  { key: 'halal', label: 'Halal' },
] as const;

export const PRICE_LEVELS = [
  { level: 1, label: '£', hint: 'under £10' },
  { level: 2, label: '££', hint: '£10–18' },
  { level: 3, label: '£££', hint: '£18–28' },
  { level: 4, label: '££££', hint: '£28+' },
] as const;
