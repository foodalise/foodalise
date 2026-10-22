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
  profiles: { id: string; username: string; avatar_path: string | null } | null;
  dishes: { id: string; name: string; restaurants: { id: string; name: string; cuisine: string | null } | null } | null;
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
  chain_slug?: string | null;
  menu_checked_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cuisine?: string | null;
  food_type?: string | null;
  price_level?: number | null;
  diets?: string[];
};

// Select string shared by the feed and profile so both get the same shape.
// The author is named by its foreign key: likes and comments also link reviews to profiles.
export const REVIEW_SELECT =
  'id, rating, taste, presentation, value, body, created_at, like_count, comment_count, liked_by_me, profiles!reviews_user_id_fkey(id, username, avatar_path), dishes(id, name, restaurants(id, name, cuisine)), review_photos(storage_path, position)';

export function firstPhoto(r: FeedReview) {
  return [...r.review_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;
}
