import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { currentUserHasPermission, verifyRequestUser } from '@/lib/server/auth';
import { writeServerErrorLog } from '@/lib/server/errorLog';

function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = toJsonSafe(entryValue);
    }
    return output;
  }
  return String(value);
}

export async function GET(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (
      !currentUserHasPermission(currentUser, 'canViewAuditLog') &&
      !currentUserHasPermission(currentUser, 'canManageSystemSettings')
    ) {
      return NextResponse.json({ error: 'Audit log access is required.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25), 1), 100);
    const snapshot = await getAdminDb()
      .collection('errorLogs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return NextResponse.json({
      logs: snapshot.docs.map((doc) => ({ id: doc.id, ...(toJsonSafe(doc.data()) as Record<string, unknown>) })),
    });
  } catch (error) {
    await writeServerErrorLog({
      context: 'admin.error_logs.list',
      message: 'Failed to read server error logs.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to read server error logs.' }, { status: 500 });
  }
}
