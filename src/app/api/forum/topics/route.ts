import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequestUser } from '@/lib/server/auth';
import {
  canModerateCommunity,
  canParticipateInCommunity,
  cleanCommunityText,
  communityAuthor,
} from '@/lib/server/community';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import {
  FORUM_CATEGORIES,
  isForumCategoryId,
  type ForumTopic,
} from '@/types/community';

const TOPIC_COOLDOWN_MS = 30_000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const category = url.searchParams.get('category');
    const currentUser = await verifyRequestUser(request).catch(() => null);
    const includeRemoved = canModerateCommunity(currentUser) && url.searchParams.get('includeRemoved') === 'true';

    const snapshot = await getAdminDb()
      .collection('forumTopics')
      .orderBy('lastActivityAt', 'desc')
      .limit(Math.min(limit * 3, 300))
      .get();

    const topics = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as ForumTopic)
      .filter((topic) => includeRemoved || topic.status !== 'removed')
      .filter((topic) => !category || topic.categoryId === category)
      .slice(0, limit);

    return NextResponse.json({ topics, categories: FORUM_CATEGORIES });
  } catch (error) {
    await writeServerErrorLog({
      context: 'forum.topics.list',
      message: 'Failed to list forum topics.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to load forum topics.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser) || !currentUser?.profile) {
      return NextResponse.json({ error: 'An active account is required to create a topic.' }, { status: 403 });
    }

    const payload = (await request.json()) as { title?: unknown; body?: unknown; categoryId?: unknown };
    const title = cleanCommunityText(payload.title, 140);
    const body = cleanCommunityText(payload.body, 6_000);

    if (title.length < 4) return NextResponse.json({ error: 'Topic title must be at least 4 characters.' }, { status: 400 });
    if (body.length < 2) return NextResponse.json({ error: 'Topic body is required.' }, { status: 400 });
    if (!isForumCategoryId(payload.categoryId)) return NextResponse.json({ error: 'Forum category is not valid.' }, { status: 400 });

    const db = getAdminDb();
    const topicRef = db.collection('forumTopics').doc();
    const rateRef = db.collection('communityRateLimits').doc(currentUser.decodedToken.uid);
    const author = communityAuthor(currentUser.profile, currentUser.decodedToken);
    const nowMs = Date.now();

    await db.runTransaction(async (transaction) => {
      const rateSnapshot = await transaction.get(rateRef);
      const lastTopicAtMs = Number(rateSnapshot.data()?.lastTopicAtMs ?? 0);
      if (nowMs - lastTopicAtMs < TOPIC_COOLDOWN_MS) {
        throw new Error('TOPIC_RATE_LIMIT');
      }

      transaction.set(topicRef, {
        title,
        body,
        categoryId: payload.categoryId,
        ...author,
        status: 'open',
        isPinned: false,
        replyCount: 0,
        flagCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastActivityAt: FieldValue.serverTimestamp(),
        editedAt: null,
        removedAt: null,
        removedByUid: null,
      });
      transaction.set(rateRef, { lastTopicAtMs: nowMs }, { merge: true });
    });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'CREATED_FORUM_TOPIC',
      targetType: 'forumTopic',
      targetId: topicRef.id,
      after: { title, categoryId: payload.categoryId },
    });

    const saved = await topicRef.get();
    return NextResponse.json({ topic: { id: saved.id, ...saved.data() } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TOPIC_RATE_LIMIT') {
      return NextResponse.json({ error: 'Please wait a few seconds before creating another topic.' }, { status: 429 });
    }

    await writeServerErrorLog({
      context: 'forum.topics.create',
      message: 'Failed to create forum topic.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to create forum topic.' }, { status: 500 });
  }
}
