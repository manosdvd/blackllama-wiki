import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import {
  ADMIN_PERMISSIONS,
  permissionsForPreset,
  type AdminPermission,
  type AdminPresetKey,
} from '@/types/permissions';
import type { AccountStatus, PortalMode, UserProfile } from '@/types/users';

 type Context = { params: Promise<{ uid: string }> };
 type UserUpdatePayload = Omit<Partial<UserProfile>, 'adminPreset'> & {
  adminPreset?: AdminPresetKey | '' | null;
};

const PORTAL_MODES: PortalMode[] = ['guest', 'candidate', 'onboarding', 'staff', 'alumni', 'admin'];
const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'disabled', 'removed'];
const ADMIN_PERMISSION_SET = new Set<AdminPermission>(ADMIN_PERMISSIONS);

function validPortalMode(value: unknown): value is PortalMode {
  return PORTAL_MODES.includes(value as PortalMode);
}

function validAccountStatus(value: unknown): value is AccountStatus {
  return ACCOUNT_STATUSES.includes(value as AccountStatus);
}

function validPreset(value: unknown): value is AdminPresetKey | null {
  return value === null || value === '' || Object.keys(permissionsForPreset).includes(String(value));
}

function isAdminPreset(value: unknown): value is AdminPresetKey {
  return typeof value === 'string' && value.length > 0 && permissionsForPreset(value as AdminPresetKey).length >= 0;
}

function cleanNullableString(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function validatedPermissions(value: unknown): AdminPermission[] | null {
  if (!Array.isArray(value)) return null;
  const permissions = value.filter((item): item is AdminPermission => ADMIN_PERMISSION_SET.has(item as AdminPermission));
  return permissions.length === value.length ? [...new Set(permissions)] : null;
}

function accountShouldBeDisabled(status: AccountStatus) {
  return status === 'suspended' || status === 'disabled' || status === 'removed';
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
    const isSelf = currentUser.decodedToken.uid === uid;
    const canManageUsers = currentUserHasPermission(currentUser, 'canManageUsers');
    const canManageRoles = currentUserHasPermission(currentUser, 'canManageRoles');
    const updates: Partial<UserProfile> & { updatedAt: unknown } = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    const profileFieldsRequested = [
      payload.displayName,
      payload.preferredName,
      payload.legalName,
      payload.phone,
      payload.photoURL,
    ].some((value) => value !== undefined);

    if (profileFieldsRequested && !isSelf && !canManageUsers) {
      return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
    }

    if (payload.displayName !== undefined) {
      const value = cleanNullableString(payload.displayName, 100);
      if (value === undefined || !value) return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });
      updates.displayName = value;
    }
    if (payload.preferredName !== undefined) updates.preferredName = cleanNullableString(payload.preferredName, 80);
    if (payload.legalName !== undefined) updates.legalName = cleanNullableString(payload.legalName, 120);
    if (payload.phone !== undefined) updates.phone = cleanNullableString(payload.phone, 40);
    if (payload.photoURL !== undefined) updates.photoURL = cleanNullableString(payload.photoURL, 500);

    if (payload.portalMode !== undefined) {
      if (!canManageUsers) return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
      if (!validPortalMode(payload.portalMode)) return NextResponse.json({ error: 'Portal mode is not valid.' }, { status: 400 });
      if (payload.portalMode === 'admin' && !canManageRoles) {
        return NextResponse.json({ error: 'Role management access is required for admin mode.' }, { status: 403 });
      }
      updates.portalMode = payload.portalMode;
    }

    if (payload.accountStatus !== undefined) {
      if (!canManageUsers) return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
      if (!validAccountStatus(payload.accountStatus)) return NextResponse.json({ error: 'Account status is not valid.' }, { status: 400 });
      if (isSelf && accountShouldBeDisabled(payload.accountStatus)) {
        return NextResponse.json({ error: 'You cannot disable or remove your own account.' }, { status: 400 });
      }
      updates.accountStatus = payload.accountStatus;
      if (payload.accountStatus === 'suspended') updates.suspendedAt = FieldValue.serverTimestamp();
      if (payload.accountStatus === 'disabled') updates.disabledAt = FieldValue.serverTimestamp();
    }

    if (payload.primarySeasonRole !== undefined) {
      if (!canManageUsers) return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
      updates.primarySeasonRole = cleanNullableString(payload.primarySeasonRole, 120);
    }

    const roleFieldsRequested = payload.isAdmin !== undefined || payload.adminPreset !== undefined || payload.adminPermissions !== undefined;
    if (roleFieldsRequested) {
      if (!canManageRoles) return NextResponse.json({ error: 'Role management access is required.' }, { status: 403 });
      if (isSelf) return NextResponse.json({ error: 'Use another owner account to change your own administrative role.' }, { status: 400 });

      const presetValue = payload.adminPreset === '' ? null : payload.adminPreset;
      if (presetValue !== undefined && presetValue !== null && !isAdminPreset(presetValue)) {
        return NextResponse.json({ error: 'Admin preset is not valid.' }, { status: 400 });
      }

      let permissions = before.adminPermissions ?? [];
      if (presetValue) {
        permissions = permissionsForPreset(presetValue);
      } else if (payload.adminPermissions !== undefined) {
        const customPermissions = validatedPermissions(payload.adminPermissions);
        if (!customPermissions) return NextResponse.json({ error: 'One or more admin permissions are not valid.' }, { status: 400 });
        permissions = customPermissions;
      } else if (presetValue === null) {
        permissions = [];
      }

      const isAdmin = payload.isAdmin ?? Boolean(presetValue || permissions.length > 0);
      updates.isAdmin = isAdmin;
      updates.adminPreset = isAdmin ? presetValue ?? before.adminPreset ?? null : null;
      updates.adminPermissions = isAdmin ? permissions : [];
      if (isAdmin) updates.portalMode = 'admin';
      if (!isAdmin && before.portalMode === 'admin' && payload.portalMode === undefined) updates.portalMode = 'staff';
    }

    await userRef.set(updates, { merge: true });
    const updated = (await userRef.get()).data() as UserProfile;
    const adminAuth = await getAdminAuth();

    if (updates.displayName !== undefined || updates.photoURL !== undefined) {
      await adminAuth.updateUser(uid, {
        displayName: updated.displayName ?? undefined,
        photoURL: updated.photoURL ?? undefined,
      });
    }

    if (updates.accountStatus !== undefined) {
      await adminAuth.updateUser(uid, { disabled: accountShouldBeDisabled(updated.accountStatus) });
    }

    if (roleFieldsRequested) {
      const permissions = updated.adminPermissions ?? [];
      await adminAuth.setCustomUserClaims(uid, {
        admin: Boolean(updated.isAdmin),
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
        displayName: before.displayName,
        portalMode: before.portalMode,
        accountStatus: before.accountStatus,
        primarySeasonRole: before.primarySeasonRole,
        isAdmin: before.isAdmin,
        adminPreset: before.adminPreset,
      },
      after: {
        displayName: updated.displayName,
        portalMode: updated.portalMode,
        accountStatus: updated.accountStatus,
        primarySeasonRole: updated.primarySeasonRole,
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

export async function DELETE(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!currentUserHasPermission(currentUser, 'canManageUsers')) {
      return NextResponse.json({ error: 'User management access is required.' }, { status: 403 });
    }

    const { uid } = await context.params;
    if (currentUser.decodedToken.uid === uid) {
      return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 400 });
    }

    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const before = snapshot.data() as UserProfile;
    if (before.isAdmin && !currentUserHasPermission(currentUser, 'canManageRoles')) {
      return NextResponse.json({ error: 'Role management access is required to remove an administrator.' }, { status: 403 });
    }

    const adminAuth = await getAdminAuth();
    await adminAuth.updateUser(uid, { disabled: true });
    await adminAuth.setCustomUserClaims(uid, { admin: false, editor: false, moderator: false });
    await userRef.set({
      accountStatus: 'removed',
      portalMode: 'guest',
      isAdmin: false,
      adminPreset: null,
      adminPermissions: [],
      disabledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'REMOVED_USER',
      targetType: 'user',
      targetId: uid,
      before: {
        email: before.email,
        displayName: before.displayName,
        portalMode: before.portalMode,
        accountStatus: before.accountStatus,
        isAdmin: before.isAdmin,
      },
      after: { portalMode: 'guest', accountStatus: 'removed', isAdmin: false },
    });

    return NextResponse.json({ success: true, message: 'User access removed and authentication disabled.' });
  } catch (error) {
    const params = await context.params.catch(() => ({ uid: 'unknown' }));
    await writeServerErrorLog({
      context: 'users.remove',
      message: 'Failed to remove user.',
      error,
      request,
      metadata: { uid: params.uid },
    });
    return NextResponse.json({ error: 'Failed to remove user.' }, { status: 500 });
  }
}
