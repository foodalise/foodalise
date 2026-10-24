import { router } from 'expo-router';

import { ReviewForm } from '@/components/ReviewForm';

export default function Review() {
  return <ReviewForm onPosted={(id) => router.push({ pathname: '/dish/[id]', params: { id } })} />;
}
