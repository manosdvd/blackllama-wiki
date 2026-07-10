import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyRequestUser } from '@/lib/server/auth';
import { canModerateCommunity } from '@/lib/server/community';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { ForumPost, ForumPostFlag, ForumTopic } from '@/types/community';

export async function GET(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!canModerateCommunity(currentUser)) {
      return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
    }

    const db = getAdminDb();
    const flagsSnapshot = await db.collection('forumPostFlags').where('status', '==', 'open').limit(100).get();
    const flags = flagsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ForumPostFlag);
    const postIds = [...new Set(flags.map((flag) => flag.postId))];
    const topicIds = [...new Set(flags.map((flag) => flag.topicId))];

    const [postSnapshots, topicSnapshots] = await Promise.all([
      Promise.all(postIds.map((id) => db.collection('forumPosts').doc(id).get())),
      Promise.all(topicIds.map((id) => db.collection('forumTopics').doc(id).get())),
    ]);

    const posts = new Map(postSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [
      snapshot.id,
      { id: snapshot.id, ...snapshot.data() } as ForumPost,
    ]));
    const topics = new Map(topicSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [
      snapshot.id,
      { id: snapshot.id, ...snapshot.data() } as ForumTopic,
    ]));

    return NextResponse.json({
      flags: flags.map((flag) => ({
        ...flag,
        post: posts.get(flag.postId) ?? null,
        topic: topics.get(flag.topicId) ?? null,
      })),
    });
  } catch (error) {
    await writeServerErrorLog({
      context: 'forum.flags.list',
      message: 'Failed to list forum flags.',
      error,
      request,
    });
    return NextResponse.json({ error: 'Failed to load moderation flags.' }, { status: 500 });
  }
}
