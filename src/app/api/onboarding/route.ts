import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import { CURRENT_SEASON_ID } from '@/types/applications';
import { DEFAULT_ONBOARDING_TASKS } from '@/types/onboarding';

export async function GET(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const url = new URL(request.url);
    const requestedUid = url.searchParams.get('uid') || currentUser.decodedToken.uid;
    const seasonId = url.searchParams.get('seasonId') || CURRENT_SEASON_ID;
    const isSelf = requestedUid === currentUser.decodedToken.uid;

    if (!isSelf && !currentUserHasPermission(currentUser, 'canManageOnboarding')) {
      return NextResponse.json({ error: 'Onboarding management access is required.' }, { status: 403 });
    }

    const db = getAdminDb();
    const onboardingId = `${requestedUid}_${seasonId}`;
    const onboardingRef = db.collection('userOnboarding').doc(onboardingId);
    const onboardingSnap = await onboardingRef.get();
    const taskSnap = await onboardingRef.collection('taskStatus').get();
    const onboarding = onboardingSnap.exists ? { id: onboardingSnap.id, ...onboardingSnap.data() } : null;
    const taskStatus = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      onboarding,
      tasks: DEFAULT_ONBOARDING_TASKS,
      taskStatus,
      seasonId,
      uid: requestedUid,
    });
  } catch (error) {
    await writeServerErrorLog({
      context: 'onboarding.read',
      message: 'Failed to read onboarding.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to read onboarding.' }, { status: 500 });
  }
}
