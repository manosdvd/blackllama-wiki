import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';

const CREATABLE_PORTAL_MODES: PortalMode[] = ['candidate', 'onboarding', 'staff', 'alumni'];
const CREATABLE_ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'disabled'];

type CreateUserPayload = {
  email?: string;
  displayName?: string;
  password?: string;
  portalMode?: PortalMode;
  accountStatus?: AccountStatus;
  primarySeasonRole?: string | null;
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!currentUserHasPermission(currentUser, 'canManageUsers') && !currentUserHasPermission(currentUser, 'canViewAuditLog')) {
      return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
    }

    const snapshot = await getAdminDb().collection('users').limit(500).get();
    const users = snapshot.docs
      .map((doc) => ({ uid: doc.id, ...doc.data() }) as UserProfile)
      .sort((a, b) => String(a.displayName ?? a.email ?? '').localeCompare(String(b.displayName ?? b.email ?? '')));

    return NextResponse.json({ users });
  } catch (error) {
    await writeServerErrorLog({
      context: 'users.list',
      message: 'Failed to read users.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to read users.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let createdUid: string | null = null;

  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!currentUserHasPermission(currentUser, 'canManageUsers')) {
      return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
    }

    const payload = (await request.json()) as CreateUserPayload;
    const email = payload.email?.trim().toLowerCase() ?? '';
    const displayName = payload.displayName?.trim() ?? '';
    const portalMode = payload.portalMode ?? 'candidate';
    const accountStatus = payload.accountStatus ?? 'pending';
    const password = payload.password?.trim() || undefined;

    if (!validEmail(email)) return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    if (!displayName) return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });
    if (password && password.length < 8) return NextResponse.json({ error: 'Temporary passwords must be at least 8 characters.' }, { status: 400 });
    if (!CREATABLE_PORTAL_MODES.includes(portalMode)) {
      return NextResponse.json({ error: 'Create a normal account first, then assign administrative roles separately.' }, { status: 400 });
    }
    if (!CREATABLE_ACCOUNT_STATUSES.includes(accountStatus)) {
      return NextResponse.json({ error: 'Account status is not valid for a new user.' }, { status: 400 });
    }

    const adminAuth = await getAdminAuth();
    const authUser = await adminAuth.createUser({
      email,
      displayName,
      password,
      disabled: accountStatus === 'suspended' || accountStatus === 'disabled',
      emailVerified: false,
    });
    createdUid = authUser.uid;

    const profile: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastLoginAt'> = {
      uid: authUser.uid,
      email,
      displayName,
      preferredName: displayName,
      legalName: null,
      phone: null,
      photoURL: authUser.photoURL,
      portalMode,
      accountStatus,
      currentSeasonId: null,
      primarySeasonRole: payload.primarySeasonRole?.trim() || null,
      isAdmin: false,
      adminPreset: null,
      adminPermissions: [],
    };

    const userRef = getAdminDb().collection('users').doc(authUser.uid);
    await userRef.set({
      ...profile,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: null,
    });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'CREATED_USER',
      targetType: 'user',
      targetId: authUser.uid,
      after: {
        email,
        displayName,
        portalMode,
        accountStatus,
        primarySeasonRole: profile.primarySeasonRole,
      },
    });

    const saved = (await userRef.get()).data() as UserProfile;
    return NextResponse.json({ user: { ...saved, uid: authUser.uid }, hasTemporaryPassword: Boolean(password) }, { status: 201 });
  } catch (error) {
    if (createdUid) {
      try {
        const adminAuth = await getAdminAuth();
        await adminAuth.deleteUser(createdUid);
      } catch {
        // Preserve the original creation error; cleanup failure is recorded below.
      }
    }

    await writeServerErrorLog({
      context: 'users.create',
      message: 'Failed to create user.',
      error,
      request,
      metadata: { createdUid },
    });

    const errorCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (errorCode.includes('email-already-exists')) {
      return NextResponse.json({ error: 'A user with that email address already exists.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to create user.' }, { status: 500 });
  }
}
