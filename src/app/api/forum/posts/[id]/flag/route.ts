import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequestUser } from '@/lib/server/auth';
import { canParticipateInCommunity, cleanCommunityText } from '@/lib/server/community';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { ForumPost } from '@/types/community';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canParticipateInCommunity(currentUser)) {
      return NextResponse.json({ error: 'An active account is required to flag a post.' }, { status: 403 });
    }

    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = cleanCommunityText(payload.reason, 300) || 'Needs moderator review.';
    const db = getAdminDb();
    const postRef = db.collection('forumPosts').doc(id);
    const flagRef = db.collection('forumPostFlags').doc(`${id}_${currentUser!.decodedToken.uid}`);

    await db.runTransaction(async (transaction) => {
      const [postSnapshot, flagSnapshot] = await Promise.all([
        transaction.get(postRef),
        transaction.get(flagRef),
      ]);
      if (!postSnapshot.exists) throw new Error('POST_NOT_FOUND');
      if (flagSnapshot.exists) throw new Error('ALREADY_FLAGGED');

      const post = { id: postSnapshot.id, ...postSnapshot.data() } as ForumPost;
      if (post.authorUid === currentUser!.decodedToken.uid) throw new Error('OWN_POST');
      if (post.isRemoved) throw new Error('POST_REMOVED');

      transaction.set(flagRef, {
        postId: id,
        topicId: post.topicId,
        reporterUid: currentUser!.decodedToken.uid,
        reason,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
        resolvedByUid: null,
      });
      transaction.update(postRef, { flagCount: FieldValue.increment(1) });
      transaction.update(db.collection('forumTopics').doc(post.topicId), { flagCount: FieldValue.increment(1) });
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'POST_NOT_FOUND') return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
      if (error.message === 'ALREADY_FLAGGED') return NextResponse.json({ error: 'You already flagged this post.' }, { status: 409 });
      if (error.message === 'OWN_POST') return NextResponse.json({ error: 'You cannot flag your own post.' }, { status: 400 });
      if (error.message === 'POST_REMOVED') return NextResponse.json({ error: 'That post has already been removed.' }, { status: 409 });
    }

    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'forum.posts.flag',
      message: 'Failed to flag forum post.',
      error,
      request,
      metadata: { postId: params.id },
    });
    return NextResponse.json({ error: 'Failed to flag post.' }, { status: 500 });
  }
}
