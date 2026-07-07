import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import { ADMIN_PRESETS, type AdminPresetKey } from '@/types/permissions';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';

type Context = { params: Promise<{ uid: string }> };
type UserUpdatePayload = Omit<Partial<UserProfile>, 'adminPreset'> & {
  adminPreset?: AdminPresetKey | '' | null;
};

const PORTAL_MODES: PortalMode[] = ['guest', 'candidate', 'onboarding', 'staff', 'alumni', 'admin'];
const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'disabled', 'removed'];

function validPortalMode(value: unknown): value is PortalMode {
  return PORTAL_MODES.includes(value as PortalMode);
}

function validAccountStatus(value: unknown): value is AccountStatus {
  return ACCOUNT_STATUSES.includes(value as AccountStatus);
}

function validPreset(value: unknown): value is AdminPresetKey | null {
  return value === null || value === '' || Object.keys(ADMIN_PRESETS).includes(String(value));
}

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const { uid } = await context.params;
    const payload = (await request.json()) as UserUpdatePayload;
    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const before = snapshot.data() as UserProfile;
    const updates: Partial<UserProfile> & { updatedAt: unknown } = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (payload.portalMode !== undefined) {
      if (!currentUserHasPermission(currentUser, 'canManageUsers')) {
        return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
      }
      if (!validPortalMode(payload.portalMode)) return NextResponse.json({ error: 'Portal mode is not valid.' }, { status: 400 });
      updates.portalMode = payload.portalMode;
    }

    if (payload.accountStatus !== undefined) {
      if (!currentUserHasPermission(currentUser, 'canManageUsers')) {
        return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
      }
      if (!validAccountStatus(payload.accountStatus)) return NextResponse.json({ error: 'Account status is not valid.' }, { status: 400 });
      updates.accountStatus = payload.accountStatus;
    }

    if (payload.primarySeasonRole !== undefined) {
      if (!currentUserHasPermission(currentUser, 'canManageUsers')) {
        return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
      }
      updates.primarySeasonRole = payload.primarySeasonRole;
    }

    if (payload.isAdmin !== undefined || payload.adminPreset !== undefined || payload.adminPermissions !== undefined) {
      if (!currentUserHasPermission(currentUser, 'canManageRoles')) {
        return NextResponse.json({ error: 'Role management access is required.' }, { status: 403 });
      }
      if (payload.adminPreset !== undefined && !validPreset(payload.adminPreset)) {
        return NextResponse.json({ error: 'Admin preset is not valid.' }, { status: 400 });
      }
      updates.isAdmin = payload.isAdmin ?? (payload.adminPreset ? true : before.isAdmin);
      updates.adminPreset = payload.adminPreset ? payload.adminPreset : null;
      updates.adminPermissions = Array.isArray(payload.adminPermissions) ? payload.adminPermissions : before.adminPermissions ?? [];
    }

    await userRef.set(updates, { merge: true });
    const updated = (await userRef.get()).data() as UserProfile;

    if (payload.isAdmin !== undefined || payload.adminPreset !== undefined || payload.adminPermissions !== undefined) {
      const permissions = updated.adminPermissions ?? [];
      const adminAuth = await getAdminAuth();
      await adminAuth.setCustomUserClaims(uid, {
        admin: !!updated.isAdmin,
        editor: permissions.includes('canEditWiki') || permissions.includes('canPublishWiki'),
        moderator: permissions.includes('canModerateCommunity'),
      });
    }

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'UPDATED_USER_PROFILE',
      targetType: 'user',
      targetId: uid,
      before: {
        portalMode: before.portalMode,
        accountStatus: before.accountStatus,
        isAdmin: before.isAdmin,
        adminPreset: before.adminPreset,
      },
      after: {
        portalMode: updated.portalMode,
        accountStatus: updated.accountStatus,
        isAdmin: updated.isAdmin,
        adminPreset: updated.adminPreset,
      },
    });

    return NextResponse.json({ user: { ...updated, uid } });
  } catch (error) {
    const params = await context.params.catch(() => ({ uid: 'unknown' }));
    await writeServerErrorLog({
      context: 'users.update',
      message: 'Failed to update user.',
      error,
      request,
      metadata: { uid: params.uid },
    });
    return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
  }
}
