// Someone's recommendations, ranked by their own scores: shown on the profile's Top 10
// tab and on the picture made to share it (app/top-list.tsx), so both always agree.

export const TOP = 10;
export const LIKED = 7; // only dishes scored this or more count as recommendations

type Reviewed = {
  rating: number | string;
  created_at: string;
  review_photos: { storage_path: string; position: number }[];
  dishes: { id: string; name: string; restaurants: { id: string; name: string } | null } | null;
};

export type RankedPlace<T> = { id: string; name: string; avg: number; picks: T[] };

export function coverPhoto(r: Reviewed) {
  return [...r.review_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;
}

// Each dish once, at their best score for it; a tie goes to the newer review.
function bestPerDish<T extends Reviewed>(reviews: T[]) {
  const best = new Map<string, T>();
  for (const r of reviews) {
    if (!r.dishes) continue;
    const kept = best.get(r.dishes.id);
    const better = !kept || Number(r.rating) > Number(kept.rating)
      || (Number(r.rating) === Number(kept.rating) && r.created_at > kept.created_at);
    if (better) best.set(r.dishes.id, r);
  }
  return [...best.values()];
}

// The dishes they scored highest (7 or more), the more recent first on a tie.
export function rankDishes<T extends Reviewed>(reviews: T[], top = TOP): T[] {
  return bestPerDish(reviews)
    .filter((r) => Number(r.rating) >= LIKED)
    .sort((a, b) => Number(b.rating) - Number(a.rating) || b.created_at.localeCompare(a.created_at))
    .slice(0, top);
}

// The restaurants where their dishes averaged highest (7 or more); on a tie, the one
// where they've tried more dishes, then the more recent visit. Picks are best first.
export function rankRestaurants<T extends Reviewed>(reviews: T[], top = TOP): RankedPlace<T>[] {
  const places = new Map<string, { id: string; name: string; picks: T[] }>();
  for (const r of bestPerDish(reviews)) {
    const p = r.dishes?.restaurants;
    if (!p) continue;
    const place = places.get(p.id) ?? { id: p.id, name: p.name, picks: [] };
    place.picks.push(r);
    places.set(p.id, place);
  }
  return [...places.values()]
    .map((p) => {
      const picks = [...p.picks].sort((a, b) => Number(b.rating) - Number(a.rating));
      const avg = picks.reduce((s, r) => s + Number(r.rating), 0) / picks.length;
      const latest = picks.reduce((at, r) => (r.created_at > at ? r.created_at : at), '');
      return { id: p.id, name: p.name, avg, picks, latest };
    })
    .filter((p) => p.avg >= LIKED)
    .sort((a, b) => b.avg - a.avg || b.picks.length - a.picks.length || b.latest.localeCompare(a.latest))
    .slice(0, top)
    .map(({ id, name, avg, picks }) => ({ id, name, avg, picks }));
}

// The line under a restaurant: what they had there.
export function placeDetail(picks: Reviewed[]) {
  return picks.length === 1 ? `Had the ${picks[0].dishes!.name}` : `${picks.length} dishes · best: ${picks[0].dishes!.name}`;
}
