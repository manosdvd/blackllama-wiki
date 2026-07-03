import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import type { UserProfile } from '@/types/users';

export async function GET(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!currentUserHasPermission(currentUser, 'canManageUsers') && !currentUserHasPermission(currentUser, 'canViewAuditLog')) {
      return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
    }

    const snapshot = await getAdminDb().collection('users').limit(200).get();
    const users = snapshot.docs
      .map((doc) => ({ uid: doc.id, ...doc.data() }) as UserProfile)
      .sort((a, b) => String(a.displayName ?? a.email ?? '').localeCompare(String(b.displayName ?? b.email ?? '')));

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Failed to read users:', error);
    return NextResponse.json({ error: 'Failed to read users.' }, { status: 500 });
  }
}
