import { LegalPageView } from '@/components/LegalPageView';
import { TERMS } from '@/lib/legal';

// The rules for using Foodalise, also on foodalise.com/terms. The words live in lib/legal.ts.
export default function Terms() {
  return <LegalPageView page={TERMS} />;
}
