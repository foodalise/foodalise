export type FeedReview = {
  id: string;
  rating: number;
  taste: number | null;
  presentation: number | null;
  value: number | null;
  body: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
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
  website?: string | null;
};

// Select string shared by the feed and profile so both get the same shape.
// The author is named by its foreign key: likes and comments also link reviews to profiles.
export const REVIEW_SELECT =
  'id, rating, taste, presentation, value, body, created_at, like_count, comment_count, liked_by_me, profiles!reviews_user_id_fkey(id, username), dishes(id, name, restaurants(id, name)), review_photos(storage_path, position)';

export function firstPhoto(r: FeedReview) {
  return [...r.review_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;
}
