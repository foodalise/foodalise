import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { session } = useAuth();
  return session ? <ProfileView userId={session.user.id} /> : null;
}
