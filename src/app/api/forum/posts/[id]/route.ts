import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequestUser } from '@/lib/server/auth';
import {
  canModerateCommunity,
  canParticipateInCommunity,
  cleanCommunityText,
} from '@/lib/server/community';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { ForumPost } from '@/types/community';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser)) {
      return NextResponse.json({ error: 'An active account is required.' }, { status: 403 });
    }

    const { id } = await context.params;
    const postRef = getAdminDb().collection('forumPosts').doc(id);
    const snapshot = await postRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as ForumPost;
    const payload = (await request.json()) as {
      content?: unknown;
      isRemoved?: unknown;
      removalReason?: unknown;
    };
    const moderator = canModerateCommunity(currentUser);
    const isAuthor = before.authorUid === currentUser?.decodedToken.uid;
    if (!moderator && !isAuthor) return NextResponse.json({ error: 'You cannot edit this post.' }, { status: 403 });
    if (before.isRemoved && !moderator) return NextResponse.json({ error: 'Removed posts cannot be edited.' }, { status: 409 });

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      editedAt: FieldValue.serverTimestamp(),
    };

    if (payload.content !== undefined) {
      const content = cleanCommunityText(payload.content, 6_000);
      if (content.length < 2) return NextResponse.json({ error: 'Post must be at least 2 characters.' }, { status: 400 });
      patch.content = content;
    }

    if (payload.isRemoved !== undefined || payload.removalReason !== undefined) {
      if (!moderator) return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
      const isRemoved = Boolean(payload.isRemoved);
      patch.isRemoved = isRemoved;
      patch.removalReason = isRemoved ? cleanCommunityText(payload.removalReason, 300) || 'Removed by a moderator.' : null;
      patch.removedAt = isRemoved ? FieldValue.serverTimestamp() : null;
      patch.removedByUid = isRemoved ? currentUser?.decodedToken.uid : null;
    }

    await postRef.set(patch, { merge: true });
    const updatedSnapshot = await postRef.get();
    const updated = { id: updatedSnapshot.id, ...updatedSnapshot.data() } as ForumPost;

    await writeAuditLog({
      actorUid: currentUser!.decodedToken.uid,
      action: moderator ? 'MODERATED_FORUM_POST' : 'UPDATED_FORUM_POST',
      targetType: 'forumPost',
      targetId: id,
      before: { topicId: before.topicId, isRemoved: before.isRemoved },
      after: { topicId: updated.topicId, isRemoved: updated.isRemoved },
    });

    return NextResponse.json({ post: updated });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.posts.update',
      message: 'Failed to update forum post.',
      error,
      request,
      metadata: { postId: params.id },
    });
    return NextResponse.json({ error: 'Failed to update post.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser)) {
      return NextResponse.json({ error: 'An active account is required.' }, { status: 403 });
    }

    const { id } = await context.params;
    const postRef = getAdminDb().collection('forumPosts').doc(id);
    const snapshot = await postRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as ForumPost;
    const moderator = canModerateCommunity(currentUser);
    const isAuthor = before.authorUid === currentUser?.decodedToken.uid;
    if (!moderator && !isAuthor) return NextResponse.json({ error: 'You cannot remove this post.' }, { status: 403 });

    await postRef.set({
      isRemoved: true,
      removalReason: moderator ? 'Removed by a moderator.' : 'Removed by the author.',
      removedAt: FieldValue.serverTimestamp(),
      removedByUid: currentUser!.decodedToken.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeAuditLog({
      actorUid: currentUser!.decodedToken.uid,
      action: 'REMOVED_FORUM_POST',
      targetType: 'forumPost',
      targetId: id,
      before: { topicId: before.topicId, isRemoved: before.isRemoved },
      after: { topicId: before.topicId, isRemoved: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.posts.remove',
      message: 'Failed to remove forum post.',
      error,
      request,
      metadata: { postId: params.id },
    });
    return NextResponse.json({ error: 'Failed to remove post.' }, { status: 500 });
  }
}
