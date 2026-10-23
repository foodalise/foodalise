import { LegalPageView } from '@/components/LegalPageView';
import { REVIEWS_POLICY } from '@/lib/legal';

// How Foodalise keeps reviews honest, also on foodalise.com/reviews-policy. The words live in lib/legal.ts.
export default function ReviewsPolicy() {
  return <LegalPageView page={REVIEWS_POLICY} />;
}
