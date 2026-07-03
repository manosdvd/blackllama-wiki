import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { CURRENT_SEASON_ID, type StaffApplication } from '@/types/applications';
import { DEFAULT_ONBOARDING_TASKS } from '@/types/onboarding';

export async function createOnboardingForApplication(application: StaffApplication) {
  if (!application.uid) return null;

  const db = getAdminDb();
  const onboardingId = `${application.uid}_${application.seasonId || CURRENT_SEASON_ID}`;
  const onboardingRef = db.collection('userOnboarding').doc(onboardingId);

  await onboardingRef.set(
    {
      id: onboardingId,
      uid: application.uid,
      seasonId: application.seasonId || CURRENT_SEASON_ID,
      templateId: application.roleType === 'paid' ? 'paid-staff-2026' : 'volunteer-staff-2026',
      status: 'in_progress',
      percentComplete: 0,
      applicationId: application.id,
      roleType: application.roleType,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const batch = db.batch();
  const applicableTasks = DEFAULT_ONBOARDING_TASKS.filter(
    (task) => task.requiredFor === 'all' || task.requiredFor === application.roleType,
  );

  for (const task of applicableTasks) {
    const taskRef = onboardingRef.collection('taskStatus').doc(task.id);
    batch.set(
      taskRef,
      {
        id: task.id,
        uid: application.uid,
        seasonId: application.seasonId || CURRENT_SEASON_ID,
        status: task.id === 'staff-application' ? 'verified' : 'not_started',
        updatedAt: FieldValue.serverTimestamp(),
        verifiedAt: task.id === 'staff-application' ? FieldValue.serverTimestamp() : null,
      },
      { merge: true },
    );
  }

  await batch.commit();
  return onboardingId;
}
