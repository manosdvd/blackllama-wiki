import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

interface AuditLogInput {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
}

export async function writeAuditLog(input: AuditLogInput) {
  await getAdminDb().collection('auditLogs').add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}
