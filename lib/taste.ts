import { supabase } from '@/lib/supabase';
import type { FeedReview } from '@/lib/types';

export type TasteMatch = { percent: number; shared: number; by: 'dishes' | 'restaurants' } | null;

type Mine = { rating: number; dishes: { id: string; restaurant_id: string } | null };

// Each key's average score.
function averages(rows: { key: string; rating: number }[]) {
  const sums = new Map<string, { total: number; n: number }>();
  for (const { key, rating } of rows) {
    const s = sums.get(key) ?? { total: 0, n: 0 };
    sums.set(key, { total: s.total + rating, n: s.n + 1 });
  }
  return new Map([...sums].map(([k, s]) => [k, s.total / s.n]));
}

// How alike two people's scores are where they've eaten the same thing: 100% if they
// gave the same scores, 0% if they're 10 points apart on average. Compares dishes
// you've both reviewed; with none in common, it compares restaurants instead.
export function compareTaste(mine: Mine[], theirs: FeedReview[]): TasteMatch {
  for (const by of ['dishes', 'restaurants'] as const) {
    const key = (dish: { id: string; restaurant_id?: string; restaurants?: { id: string } | null } | null) =>
      by === 'dishes' ? dish?.id : (dish?.restaurant_id ?? dish?.restaurants?.id);
    const a = averages(mine.flatMap((r) => (key(r.dishes) ? [{ key: key(r.dishes)!, rating: Number(r.rating) }] : [])));
    const b = averages(theirs.flatMap((r) => (key(r.dishes) ? [{ key: key(r.dishes)!, rating: Number(r.rating) }] : [])));
    const both = [...a.keys()].filter((k) => b.has(k));
    if (!both.length) continue;
    const gap = both.reduce((sum, k) => sum + Math.abs(a.get(k)! - b.get(k)!), 0) / both.length;
    return { percent: Math.max(0, Math.round(100 - gap * 10)), shared: both.length, by };
  }
  return null;
}

// Your own scores, to compare with someone else's.
export async function myScores(me: string): Promise<Mine[]> {
  const { data } = await supabase.from('reviews').select('rating, dishes(id, restaurant_id)').eq('user_id', me).returns<Mine[]>();
  return data ?? [];
}
