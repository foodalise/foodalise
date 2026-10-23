import { LegalPageView } from '@/components/LegalPageView';
import { PRIVACY } from '@/lib/legal';

// Shown in the app and on foodalise.com/privacy (the App Store links there). The words live in lib/legal.ts.
export default function Privacy() {
  return <LegalPageView page={PRIVACY} />;
}
