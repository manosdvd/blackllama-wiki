import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { UserProfile } from '@/types/users';
import type { AdminPresetKey, AdminPermission } from '@/types/permissions';

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
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!currentUserHasPermission(currentUser, 'canManageUsers')) {
      return NextResponse.json({ error: 'User management access is required to create users.' }, { status: 403 });
    }

    const { email, password, displayName, portalMode, adminPreset } = await request.json();

    if (!email || !password || !displayName || !portalMode) {
      return NextResponse.json({ error: 'Missing required fields: email, password, displayName, portalMode' }, { status: 400 });
    }

    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const adminAuth = await getAdminAuth();
    
    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    const { ADMIN_PRESETS } = await import('@/types/permissions');
    
    let isAdmin = false;
    let finalAdminPreset: AdminPresetKey | null = null;
    let adminPermissions: AdminPermission[] = [];
    
    if (adminPreset && ADMIN_PRESETS[adminPreset as keyof typeof ADMIN_PRESETS]) {
      isAdmin = true;
      finalAdminPreset = adminPreset as AdminPresetKey;
      adminPermissions = ADMIN_PRESETS[adminPreset as keyof typeof ADMIN_PRESETS].permissions;
    } else if (portalMode === 'admin') {
      isAdmin = true;
      finalAdminPreset = 'owner' as AdminPresetKey;
      adminPermissions = ADMIN_PRESETS['owner'].permissions;
    }

    // Create user profile in Firestore
    const newProfile: Partial<UserProfile> = {
      email,
      displayName,
      portalMode: portalMode || (isAdmin ? 'admin' : 'staff'),
      accountStatus: 'active',
      isAdmin,
      adminPreset: finalAdminPreset,
      adminPermissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await getAdminDb().collection('users').doc(userRecord.uid).set(newProfile);
    
    if (isAdmin) {
      await adminAuth.setCustomUserClaims(userRecord.uid, {
        admin: true,
        editor: adminPermissions.includes('canEditWiki') || adminPermissions.includes('canPublishWiki'),
        moderator: adminPermissions.includes('canModerateCommunity'),
      });
    }

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error) {
    await writeServerErrorLog({
      context: 'users.create',
      message: 'Failed to create user.',
      error,
      request,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create user.' }, { status: 500 });
  }
}

