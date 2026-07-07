import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  currentUserHasPermission,
  upsertUserProfileFromToken,
  verifyRequestUser,
} from '@/lib/server/auth';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import { writeAuditLog } from '@/lib/server/audit';
import { CURRENT_SEASON_ID, type StaffApplication, type StaffRoleType } from '@/types/applications';

function ageFromDateOfBirth(dateOfBirth: string) {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function validRoleType(value: unknown): value is StaffRoleType {
  return value === 'paid' || value === 'volunteer';
}

export async function GET(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const db = getAdminDb();
    const canReview = currentUserHasPermission(currentUser, 'canReviewApplications');
    const snapshot = canReview
      ? await db.collection('applications').limit(100).get()
      : await db.collection('applications').where('uid', '==', currentUser.decodedToken.uid).limit(10).get();

    const applications = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as StaffApplication)
      .sort((a, b) => {
        const aValue = typeof a.submittedAt === 'object' && a.submittedAt && 'seconds' in a.submittedAt ? Number(a.submittedAt.seconds) : 0;
        const bValue = typeof b.submittedAt === 'object' && b.submittedAt && 'seconds' in b.submittedAt ? Number(b.submittedAt.seconds) : 0;
        return bValue - aValue;
      });
    return NextResponse.json({ applications });
  } catch (error) {
    await writeServerErrorLog({
      context: 'applications.list',
      message: 'Failed to read applications.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to read applications.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request).catch(() => null);
    if (currentUser) {
      await upsertUserProfileFromToken(currentUser.decodedToken);
    }

    const payload = (await request.json()) as Record<string, string>;
    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'roleType', 'areaOfInterest'];
    const missingField = requiredFields.find((field) => !payload[field]?.trim());
    if (missingField) return NextResponse.json({ error: `${missingField} is required.` }, { status: 400 });
    if (!validRoleType(payload.roleType)) return NextResponse.json({ error: 'Role type is not valid.' }, { status: 400 });

    const age = ageFromDateOfBirth(payload.dateOfBirth);
    if (age === null) return NextResponse.json({ error: 'Date of birth is not valid.' }, { status: 400 });

    const db = getAdminDb();
    const appRef = db.collection('applications').doc();
    const uid = currentUser?.decodedToken.uid ?? null;
    const application: Omit<StaffApplication, 'id'> = {
      uid,
      seasonId: CURRENT_SEASON_ID,
      status: 'submitted',
      applicantName: `${payload.firstName.trim()} ${payload.lastName.trim()}`,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim(),
      dateOfBirth: payload.dateOfBirth,
      isMinor: age < 18,
      parentGuardianRequired: age < 18,
      roleType: payload.roleType,
      areaOfInterest: payload.areaOfInterest,
      scoutingExperience: payload.scoutingExperience?.trim() || '',
      bsaId: payload.bsaId?.trim() || '',
      council: payload.council?.trim() || 'Catalina Council',
      submittedAt: FieldValue.serverTimestamp(),
      reviewedByUid: null,
      reviewedAt: null,
      adminNotes: '',
      decisionReason: '',
    };

    await appRef.set(application);

    if (uid) {
      await db.collection('users').doc(uid).set(
        {
          uid,
          email: application.email,
          displayName: application.applicantName,
          preferredName: application.firstName,
          phone: application.phone,
          portalMode: 'candidate',
          accountStatus: 'active',
          currentSeasonId: CURRENT_SEASON_ID,
          primarySeasonRole: application.areaOfInterest,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    await writeAuditLog({
      actorUid: uid ?? `guest:${application.email}`,
      action: 'SUBMITTED_APPLICATION',
      targetType: 'application',
      targetId: appRef.id,
      after: { applicantName: application.applicantName, roleType: application.roleType, areaOfInterest: application.areaOfInterest },
    });

    return NextResponse.json({ application: { id: appRef.id, ...application } }, { status: 201 });
  } catch (error) {
    await writeServerErrorLog({
      context: 'applications.create',
      message: 'Failed to submit application.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to submit application.' }, { status: 500 });
  }
}
