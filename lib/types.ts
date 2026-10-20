export type FeedReview = {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  profiles: { id: string; username: string } | null;
  dishes: { id: string; name: string; restaurants: { id: string; name: string } | null } | null;
  review_photos: { storage_path: string; position: number }[];
};

export type Restaurant = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  hygiene_rating: string | null;
  menu_source: 'none' | 'chain' | 'website' | 'users';
};

// Select string shared by the feed and profile so both get the same shape.
export const REVIEW_SELECT =
  'id, rating, body, created_at, profiles(id, username), dishes(id, name, restaurants(id, name)), review_photos(storage_path, position)';

export function firstPhoto(r: FeedReview) {
  return [...r.review_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;
}
