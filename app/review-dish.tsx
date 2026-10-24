import { router, useLocalSearchParams } from 'expo-router';

import { ReviewForm } from '@/components/ReviewForm';

// "Review this dish" / "Review a dish here": the form as its own page on top of the
// one you came from, so going back steps through the pages in reverse.
export default function ReviewDish() {
  const { dishId } = useLocalSearchParams<{ dishId?: string }>();
  return (
    <ReviewForm onPosted={(id) => {
      // Came from that dish's page: go back to it (it reloads and shows the review).
      if (dishId === id && router.canGoBack()) router.back();
      // Otherwise show the dish in place of this form, so back goes to the page before.
      else router.replace({ pathname: '/dish/[id]', params: { id } });
    }} />
  );
}
