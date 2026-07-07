import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import { createOnboardingForApplication } from '@/lib/server/onboarding';
import type { ApplicationDecisionPayload, StaffApplication } from '@/types/applications';

type Context = { params: Promise<{ id: string }> };

function validDecision(decision: unknown): decision is ApplicationDecisionPayload['decision'] {
  return ['approved', 'rejected', 'waitlisted', 'needs_info', 'under_review'].includes(String(decision));
}

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (!currentUserHasPermission(currentUser, 'canReviewApplications')) {
      return NextResponse.json({ error: 'Application review access is required.' }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = (await request.json()) as ApplicationDecisionPayload;
    if (!validDecision(payload.decision)) {
      return NextResponse.json({ error: 'Decision is not valid.' }, { status: 400 });
    }

    const db = getAdminDb();
    const appRef = db.collection('applications').doc(id);
    const snapshot = await appRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as StaffApplication;
    await appRef.set(
      {
        status: payload.decision,
        reviewedByUid: currentUser.decodedToken.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        adminNotes: payload.adminNotes ?? before.adminNotes ?? '',
      },
      { merge: true },
    );

    if (payload.decision === 'approved' && before.uid) {
      await db.collection('users').doc(before.uid).set(
        {
          portalMode: 'onboarding',
          accountStatus: 'active',
          currentSeasonId: before.seasonId,
          primarySeasonRole: before.areaOfInterest,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      await db.collection('seasonMemberships').doc(`${before.seasonId}_${before.uid}`).set(
        {
          uid: before.uid,
          seasonId: before.seasonId,
          relationshipStatus: 'onboarding',
          staffType: before.roleType,
          area: before.areaOfInterest,
          positionTitle: null,
          isYouthStaff: before.isMinor,
          isAdultStaff: !before.isMinor,
          onboardingStatus: 'in_progress',
          applicationId: before.id,
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      await createOnboardingForApplication(before);
    }

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: `APPLICATION_${payload.decision.toUpperCase()}`,
      targetType: 'application',
      targetId: id,
      before: { status: before.status, applicantName: before.applicantName },
      after: { status: payload.decision, adminNotes: payload.adminNotes ?? '' },
    });

    const updated = await appRef.get();
    return NextResponse.json({ application: { id: updated.id, ...updated.data() } });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'applications.decision',
      message: 'Failed to update application decision.',
      error,
      request,
      metadata: { applicationId: params.id },
    });
    return NextResponse.json({ error: 'Failed to update application decision.' }, { status: 500 });
  }
}
