import { NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { upsertUserProfileFromToken } from '@/lib/server/auth';
import { ADMIN_PERMISSIONS, type AdminPermission } from '@/types/permissions';
import type { UserProfile } from '@/types/users';

const SESSION_COOKIE_NAME = 'campLawtonSession';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function fallbackProfileFromToken(decodedToken: DecodedIdToken): UserProfile {
  const isTokenAdmin = decodedToken.admin === true;
  const permissions = new Set<AdminPermission>();

  if (isTokenAdmin) {
    ADMIN_PERMISSIONS.forEach((permission) => permissions.add(permission));
  }
  if (decodedToken.moderator === true) permissions.add('canModerateCommunity');
  if (decodedToken.editor === true) {
    permissions.add('canDraftWiki');
    permissions.add('canEditWiki');
  }

  return {
    uid: decodedToken.uid,
    email: typeof decodedToken.email === 'string' ? decodedToken.email : null,
    displayName: typeof decodedToken.name === 'string' ? decodedToken.name : null,
    photoURL: typeof decodedToken.picture === 'string' ? decodedToken.picture : null,
    portalMode: isTokenAdmin ? 'admin' : 'guest',
    accountStatus: 'active',
    currentSeasonId: null,
    primarySeasonRole: null,
    isAdmin: isTokenAdmin,
    adminPreset: isTokenAdmin ? 'owner' : null,
    adminPermissions: [...permissions],
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idToken?: string };
    if (!body.idToken) {
      return NextResponse.json({ error: 'Missing Firebase ID token.' }, { status: 400 });
    }

    const decodedToken = await getAdminAuth().verifyIdToken(body.idToken);
    let profile: UserProfile;
    let warning: string | undefined;

    try {
      profile = await upsertUserProfileFromToken(decodedToken);
    } catch (profileError) {
      console.error('Session profile upsert failed; using token-derived profile:', profileError);
      profile = fallbackProfileFromToken(decodedToken);
      warning = 'profile-upsert-failed';
    }

    const sessionCookie = await getAdminAuth().createSessionCookie(body.idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const response = NextResponse.json({ profile, warning });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Session creation failed:', error);
    return NextResponse.json(
      {
        error: 'Unable to create session.',
        detail: process.env.NODE_ENV === 'production' ? undefined : String(error),
      },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
