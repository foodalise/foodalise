// Puts a restaurant's menu sections in the order people read a menu:
// starters, mains, sides, desserts, then drinks. Section names come from
// menus as written ("Small plates", "From the grill"), so they're matched by keyword.

export const COURSES = ['Starters', 'Mains', 'Sides', 'Desserts', 'Drinks'] as const;
export type Course = (typeof COURSES)[number];

const KEYWORDS: [Course, RegExp][] = [
  ['Drinks', /drink|beverage|wine|beer|lager|ale\b|cider|cocktail|mocktail|spirit|gin\b|vodka|whisk|rum\b|coffee|tea\b|teas\b|juice|smoothie|shake|soft|soda|bubbles|champagne|prosecco/i],
  ['Desserts', /dessert|pudding|sweet|cake|ice cream|gelato|afters/i],
  ['Sides', /side|extra|add[- ]?on|sauce|dip\b|dips\b|accompaniment/i],
  // Sharing platters are a meal, not a starter.
  ['Mains', /platter|\bmains?\b/i],
  ['Starters', /starter|appeti[sz]er|small plate|small bite|to start|to share|sharing|sharer|nibble|snack|soup|mezze|meze|tapas|antipast|entr[ée]e?s?$|bites/i],
];

export function courseOf(section: string | null): Course {
  if (!section) return 'Mains';
  for (const [course, pattern] of KEYWORDS) if (pattern.test(section)) return course;
  return 'Mains';
}
