import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import type { UserProfile } from '@/types/users';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 1. Get session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('campLawtonSession')?.value;

  if (!sessionCookie) {
    redirect('/');
  }

  try {
    // 2. Verify token
    const adminAuth = await getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    // 3. Look up profile to check portalMode/permissions
    const db = getAdminDb();
    const snapshot = await db.collection('users').doc(decoded.uid).get();
    
    if (!snapshot.exists) {
      redirect('/');
    }

    const profile = snapshot.data() as UserProfile;
    
    // 4. Deny access if they don't have admin portalMode
    if (profile.portalMode !== 'admin') {
      redirect('/');
    }
  } catch (error) {
    console.error('Admin layout auth error:', error);
    redirect('/');
  }

  return <>{children}</>;
}
