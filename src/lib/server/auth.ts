import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { ADMIN_PERMISSIONS, type AdminPermission } from '@/types/permissions';
import type { UserProfile } from '@/types/users';
import { isHealthyAccountStatus } from '@/types/users';

const SESSION_COOKIE_NAME = 'campLawtonSession';

export interface CurrentUser {
  decodedToken: DecodedIdToken;
  profile: UserProfile | null;
}

function bearerTokenFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

function firebaseIdTokenFromRequest(request: Request) {
  return request.headers.get('x-firebase-id-token') ?? request.headers.get('X-Firebase-ID-Token');
}

function requestIdTokenFromRequest(request: Request) {
  return bearerTokenFromRequest(request) || firebaseIdTokenFromRequest(request);
}

function sessionCookieFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const sessionPair = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionPair) return null;
  return decodeURIComponent(sessionPair.slice(SESSION_COOKIE_NAME.length + 1));
}



export async function verifyRequestUser(request: Request): Promise<CurrentUser | null> {
  const adminAuth = await getAdminAuth();
  const idToken = requestIdTokenFromRequest(request);
  const sessionCookie = !idToken ? sessionCookieFromRequest(request) : null;

  if (!idToken && !sessionCookie) return null;

  const decodedToken = idToken
    ? await adminAuth.verifyIdToken(idToken)
    : await adminAuth.verifySessionCookie(sessionCookie as string, true);
  const profile = await getUserProfile(decodedToken.uid);

  return { decodedToken, profile };
}

async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getAdminDb().collection('users').doc(uid).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as UserProfile;
}

function tokenPermissions(decodedToken: DecodedIdToken): AdminPermission[] {
  if (decodedToken.admin === true) return [...ADMIN_PERMISSIONS];

  const permissions = new Set<AdminPermission>();
  if (decodedToken.editor === true) {
    permissions.add('canDraftWiki');
    permissions.add('canEditWiki');
  }
  if (decodedToken.moderator === true) permissions.add('canModerateCommunity');
  return [...permissions];
}

export function currentUserHasPermission(currentUser: CurrentUser | null, permission: AdminPermission) {
  if (!currentUser) return false;
  if (currentUser.decodedToken.admin === true) return true;

  const profile = currentUser.profile;
  if (!profile || !isHealthyAccountStatus(profile.accountStatus)) return false;
  if (profile.isAdmin && profile.adminPreset === 'owner') return true;
  return [...(profile.adminPermissions ?? []), ...tokenPermissions(currentUser.decodedToken)].includes(permission);
}

export function currentUserIsHealthy(currentUser: CurrentUser | null) {
  if (!currentUser) return false;
  if (!currentUser.profile) return true;
  return isHealthyAccountStatus(currentUser.profile.accountStatus);
}

export async function upsertUserProfileFromToken(decodedToken: DecodedIdToken, clientDisplayName?: string): Promise<UserProfile> {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(decodedToken.uid);
  const snapshot = await userRef.get();
  const tokenAdminPermissions = tokenPermissions(decodedToken);
  const isTokenAdmin = decodedToken.admin === true;

  const baseProfile = {
    uid: decodedToken.uid,
    email: typeof decodedToken.email === 'string' ? decodedToken.email : null,
    displayName: clientDisplayName || (typeof decodedToken.name === 'string' ? decodedToken.name : null),
    photoURL: typeof decodedToken.picture === 'string' ? decodedToken.picture : null,
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  };

  if (!snapshot.exists) {
    const profile: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastLoginAt'> = {
      ...baseProfile,
      portalMode: isTokenAdmin ? 'admin' : 'staff',
      accountStatus: 'active',
      currentSeasonId: null,
      primarySeasonRole: null,
      isAdmin: isTokenAdmin,
      adminPreset: isTokenAdmin ? 'owner' : null,
      adminPermissions: tokenAdminPermissions,
    };

    await userRef.set({
      ...profile,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    });

    return (await userRef.get()).data() as UserProfile;
  }

  const existing = snapshot.data() as UserProfile;
  const mergedPermissions = [...new Set([...(existing.adminPermissions ?? []), ...tokenAdminPermissions])];

  await userRef.set(
    {
      ...baseProfile,
      isAdmin: existing.isAdmin || isTokenAdmin,
      adminPreset: existing.adminPreset ?? (isTokenAdmin ? 'owner' : null),
      adminPermissions: mergedPermissions,
    },
    { merge: true },
  );

  return (await userRef.get()).data() as UserProfile;
}
