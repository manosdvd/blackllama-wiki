import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequestUser } from '@/lib/server/auth';
import {
  canParticipateInCommunity,
  cleanCommunityText,
  communityAuthor,
} from '@/lib/server/community';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { ForumPost, ForumTopic } from '@/types/community';

type Context = { params: Promise<{ id: string }> };
const POST_COOLDOWN_MS = 4_000;

export async function POST(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser) || !currentUser?.profile) {
      return NextResponse.json({ error: 'An active account is required to reply.' }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = (await request.json()) as { content?: unknown };
    const content = cleanCommunityText(payload.content, 6_000);
    if (content.length < 2) return NextResponse.json({ error: 'Reply must be at least 2 characters.' }, { status: 400 });

    const db = getAdminDb();
    const topicRef = db.collection('forumTopics').doc(id);
    const postRef = db.collection('forumPosts').doc();
    const rateRef = db.collection('communityRateLimits').doc(currentUser.decodedToken.uid);
    const author = communityAuthor(currentUser.profile, currentUser.decodedToken);
    const nowMs = Date.now();

    await db.runTransaction(async (transaction) => {
      const [topicSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(topicRef),
        transaction.get(rateRef),
      ]);
      if (!topicSnapshot.exists) throw new Error('TOPIC_NOT_FOUND');

      const topic = { id: topicSnapshot.id, ...topicSnapshot.data() } as ForumTopic;
      if (topic.status === 'removed') throw new Error('TOPIC_NOT_FOUND');
      if (topic.status === 'locked') throw new Error('TOPIC_LOCKED');

      const lastPostAtMs = Number(rateSnapshot.data()?.lastPostAtMs ?? 0);
      if (nowMs - lastPostAtMs < POST_COOLDOWN_MS) throw new Error('POST_RATE_LIMIT');

      transaction.set(postRef, {
        topicId: id,
        content,
        ...author,
        isRemoved: false,
        removalReason: null,
        removedByUid: null,
        flagCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        editedAt: null,
        removedAt: null,
      });
      transaction.update(topicRef, {
        replyCount: FieldValue.increment(1),
        lastActivityAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(rateRef, { lastPostAtMs: nowMs }, { merge: true });
    });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'CREATED_FORUM_POST',
      targetType: 'forumPost',
      targetId: postRef.id,
      after: { topicId: id },
    });

    const saved = await postRef.get();
    return NextResponse.json({ post: { id: saved.id, ...saved.data() } as ForumPost }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TOPIC_NOT_FOUND') return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
      if (error.message === 'TOPIC_LOCKED') return NextResponse.json({ error: 'This topic is locked.' }, { status: 409 });
      if (error.message === 'POST_RATE_LIMIT') return NextResponse.json({ error: 'Please wait a moment before posting again.' }, { status: 429 });
    }

    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.posts.create',
      message: 'Failed to create forum reply.',
      error,
      request,
      metadata: { topicId: params.id },
    });
    return NextResponse.json({ error: 'Failed to post reply.' }, { status: 500 });
  }
}
