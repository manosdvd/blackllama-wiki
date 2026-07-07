import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import { CURRENT_SEASON_ID } from '@/types/applications';
import type { OnboardingTaskStatus } from '@/types/onboarding';

type Context = { params: Promise<{ uid: string; taskId: string }> };

function validStatus(status: unknown): status is OnboardingTaskStatus {
  return ['not_started', 'in_progress', 'submitted', 'verified', 'needs_correction', 'waived'].includes(String(status));
}

async function recalculateProgress(uid: string, seasonId: string) {
  const db = getAdminDb();
  const onboardingRef = db.collection('userOnboarding').doc(`${uid}_${seasonId}`);
  const taskSnap = await onboardingRef.collection('taskStatus').get();
  const statuses = taskSnap.docs.map((doc) => doc.data().status as OnboardingTaskStatus);
  const completeCount = statuses.filter((status) => status === 'verified' || status === 'waived').length;
  const percentComplete = statuses.length ? Math.round((completeCount / statuses.length) * 100) : 0;
  const status = percentComplete === 100 ? 'complete' : statuses.includes('needs_correction') ? 'blocked' : 'in_progress';

  await onboardingRef.set(
    {
      percentComplete,
      status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const { uid, taskId } = await context.params;
    const payload = (await request.json()) as {
      seasonId?: string;
      status?: OnboardingTaskStatus;
      userNote?: string;
      adminNote?: string;
    };

    if (!validStatus(payload.status)) return NextResponse.json({ error: 'Task status is not valid.' }, { status: 400 });

    const seasonId = payload.seasonId || CURRENT_SEASON_ID;
    const isSelf = uid === currentUser.decodedToken.uid;
    const isAdmin = currentUserHasPermission(currentUser, 'canManageOnboarding') || currentUserHasPermission(currentUser, 'canVerifyPaperwork');

    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: 'Onboarding access is required.' }, { status: 403 });
    }

    const adminOnlyStatuses: OnboardingTaskStatus[] = ['verified', 'needs_correction', 'waived'];
    if (adminOnlyStatuses.includes(payload.status) && !isAdmin) {
      return NextResponse.json({ error: 'Admin verification is required for that status.' }, { status: 403 });
    }

    const selfAllowedStatuses: OnboardingTaskStatus[] = ['not_started', 'in_progress', 'submitted'];
    if (isSelf && !isAdmin && !selfAllowedStatuses.includes(payload.status)) {
      return NextResponse.json({ error: 'That task status is reserved for admins.' }, { status: 403 });
    }

    const db = getAdminDb();
    const taskRef = db.collection('userOnboarding').doc(`${uid}_${seasonId}`).collection('taskStatus').doc(taskId);
    const before = await taskRef.get();
    await taskRef.set(
      {
        id: taskId,
        uid,
        seasonId,
        status: payload.status,
        userNote: payload.userNote ?? before.data()?.userNote ?? '',
        adminNote: isAdmin ? payload.adminNote ?? before.data()?.adminNote ?? '' : before.data()?.adminNote ?? '',
        verifiedByUid: adminOnlyStatuses.includes(payload.status) ? currentUser.decodedToken.uid : before.data()?.verifiedByUid ?? null,
        verifiedAt: adminOnlyStatuses.includes(payload.status) ? FieldValue.serverTimestamp() : before.data()?.verifiedAt ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await recalculateProgress(uid, seasonId);

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: isAdmin ? 'UPDATED_ONBOARDING_TASK' : 'SUBMITTED_ONBOARDING_TASK',
      targetType: 'onboardingTask',
      targetId: `${uid}_${seasonId}_${taskId}`,
      before: before.exists ? before.data() : null,
      after: { status: payload.status },
    });

    const updated = await taskRef.get();
    return NextResponse.json({ taskStatus: { id: updated.id, ...updated.data() } });
  } catch (error) {
    const params = await context.params.catch(() => ({ uid: 'unknown', taskId: 'unknown' }));
    await writeServerErrorLog({
      context: 'onboarding.task.update',
      message: 'Failed to update onboarding task.',
      error,
      request,
      metadata: { uid: params.uid, taskId: params.taskId },
    });
    return NextResponse.json({ error: 'Failed to update onboarding task.' }, { status: 500 });
  }
}
