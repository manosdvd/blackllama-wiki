import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequestUser } from '@/lib/server/auth';
import { canModerateCommunity, cleanCommunityText } from '@/lib/server/community';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { ForumPostFlag } from '@/types/community';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canModerateCommunity(currentUser)) {
      return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = (await request.json()) as {
      status?: unknown;
      removePost?: unknown;
      removalReason?: unknown;
    };
    const status = String(payload.status ?? 'resolved');
    if (!['resolved', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'Flag status is not valid.' }, { status: 400 });
    }

    const db = getAdminDb();
    const flagRef = db.collection('forumPostFlags').doc(id);
    const flagSnapshot = await flagRef.get();
    if (!flagSnapshot.exists) return NextResponse.json({ error: 'Flag not found.' }, { status: 404 });
    const flag = { id: flagSnapshot.id, ...flagSnapshot.data() } as ForumPostFlag;

    await db.runTransaction(async (transaction) => {
      transaction.update(flagRef, {
        status,
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedByUid: currentUser!.decodedToken.uid,
      });

      if (payload.removePost) {
        const postRef = db.collection('forumPosts').doc(flag.postId);
        transaction.set(postRef, {
          isRemoved: true,
          removalReason: cleanCommunityText(payload.removalReason, 300) || 'Removed after moderator review.',
          removedAt: FieldValue.serverTimestamp(),
          removedByUid: currentUser!.decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    await writeAuditLog({
      actorUid: currentUser!.decodedToken.uid,
      action: payload.removePost ? 'RESOLVED_FORUM_FLAG_AND_REMOVED_POST' : 'RESOLVED_FORUM_FLAG',
      targetType: 'forumPostFlag',
      targetId: id,
      before: { status: flag.status, postId: flag.postId, topicId: flag.topicId },
      after: { status, postRemoved: Boolean(payload.removePost) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.flags.resolve',
      message: 'Failed to resolve forum flag.',
      error,
      request,
      metadata: { flagId: params.id },
    });
    return NextResponse.json({ error: 'Failed to resolve moderation flag.' }, { status: 500 });
  }
}
