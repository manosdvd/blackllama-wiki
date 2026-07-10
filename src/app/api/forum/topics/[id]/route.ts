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
import {
  isForumCategoryId,
  type ForumPost,
  type ForumTopic,
  type ForumTopicStatus,
} from '@/types/community';

type Context = { params: Promise<{ id: string }> };

function timestampMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value === 'object' && value && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value === 'object' && value && 'seconds' in value) return Number(value.seconds) * 1000;
  if (typeof value === 'object' && value && '_seconds' in value) return Number(value._seconds) * 1000;
  return 0;
}

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const currentUser = await verifyRequestUser(request).catch(() => null);
    const moderator = canModerateCommunity(currentUser);
    const db = getAdminDb();
    const topicSnapshot = await db.collection('forumTopics').doc(id).get();

    if (!topicSnapshot.exists) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    const topic = { id: topicSnapshot.id, ...topicSnapshot.data() } as ForumTopic;
    if (topic.status === 'removed' && !moderator) {
      return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    }

    const postsSnapshot = await db.collection('forumPosts').where('topicId', '==', id).limit(250).get();
    const posts = postsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as ForumPost)
      .sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));

    return NextResponse.json({ topic, posts, canModerate: moderator });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.topics.read',
      message: 'Failed to load forum topic.',
      error,
      request,
      metadata: { topicId: params.id },
    });
    return NextResponse.json({ error: 'Failed to load forum topic.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser)) {
      return NextResponse.json({ error: 'An active account is required.' }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = (await request.json()) as {
      title?: unknown;
      body?: unknown;
      categoryId?: unknown;
      status?: unknown;
      isPinned?: unknown;
    };
    const topicRef = getAdminDb().collection('forumTopics').doc(id);
    const snapshot = await topicRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as ForumTopic;
    const moderator = canModerateCommunity(currentUser);
    const isAuthor = before.authorUid === currentUser?.decodedToken.uid;
    if (!moderator && !isAuthor) return NextResponse.json({ error: 'You cannot edit this topic.' }, { status: 403 });
    if (!moderator && before.status !== 'open') return NextResponse.json({ error: 'This topic is locked.' }, { status: 409 });

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      editedAt: FieldValue.serverTimestamp(),
    };

    if (payload.title !== undefined) {
      const title = cleanCommunityText(payload.title, 140);
      if (title.length < 4) return NextResponse.json({ error: 'Topic title must be at least 4 characters.' }, { status: 400 });
      patch.title = title;
    }
    if (payload.body !== undefined) {
      const body = cleanCommunityText(payload.body, 6_000);
      if (body.length < 2) return NextResponse.json({ error: 'Topic body is required.' }, { status: 400 });
      patch.body = body;
    }
    if (payload.categoryId !== undefined) {
      if (!isForumCategoryId(payload.categoryId)) return NextResponse.json({ error: 'Forum category is not valid.' }, { status: 400 });
      patch.categoryId = payload.categoryId;
    }

    if (payload.status !== undefined || payload.isPinned !== undefined) {
      if (!moderator) return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });

      if (payload.status !== undefined) {
        const status = String(payload.status) as ForumTopicStatus;
        if (!['open', 'locked', 'removed'].includes(status)) {
          return NextResponse.json({ error: 'Topic status is not valid.' }, { status: 400 });
        }
        patch.status = status;
        patch.removedAt = status === 'removed' ? FieldValue.serverTimestamp() : null;
        patch.removedByUid = status === 'removed' ? currentUser?.decodedToken.uid : null;
      }
      if (payload.isPinned !== undefined) patch.isPinned = Boolean(payload.isPinned);
    }

    await topicRef.set(patch, { merge: true });
    const updatedSnapshot = await topicRef.get();
    const updated = { id: updatedSnapshot.id, ...updatedSnapshot.data() } as ForumTopic;

    await writeAuditLog({
      actorUid: currentUser!.decodedToken.uid,
      action: moderator ? 'MODERATED_FORUM_TOPIC' : 'UPDATED_FORUM_TOPIC',
      targetType: 'forumTopic',
      targetId: id,
      before: { title: before.title, categoryId: before.categoryId, status: before.status, isPinned: before.isPinned },
      after: { title: updated.title, categoryId: updated.categoryId, status: updated.status, isPinned: updated.isPinned },
    });

    return NextResponse.json({ topic: updated });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.topics.update',
      message: 'Failed to update forum topic.',
      error,
      request,
      metadata: { topicId: params.id },
    });
    return NextResponse.json({ error: 'Failed to update forum topic.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser)) {
      return NextResponse.json({ error: 'An active account is required.' }, { status: 403 });
    }

    const { id } = await context.params;
    const topicRef = getAdminDb().collection('forumTopics').doc(id);
    const snapshot = await topicRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as ForumTopic;
    const moderator = canModerateCommunity(currentUser);
    const isAuthor = before.authorUid === currentUser?.decodedToken.uid;
    if (!moderator && !isAuthor) return NextResponse.json({ error: 'You cannot remove this topic.' }, { status: 403 });

    await topicRef.set({
      status: 'removed',
      removedAt: FieldValue.serverTimestamp(),
      removedByUid: currentUser!.decodedToken.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeAuditLog({
      actorUid: currentUser!.decodedToken.uid,
      action: 'REMOVED_FORUM_TOPIC',
      targetType: 'forumTopic',
      targetId: id,
      before: { title: before.title, status: before.status },
      after: { title: before.title, status: 'removed' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.topics.remove',
      message: 'Failed to remove forum topic.',
      error,
      request,
      metadata: { topicId: params.id },
    });
    return NextResponse.json({ error: 'Failed to remove forum topic.' }, { status: 500 });
  }
}
