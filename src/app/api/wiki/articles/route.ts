import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { canAccessVisibility } from '@/lib/auth/permissions';
import { extractEditorPlainText, findWikiLinks, slugify } from '@/lib/content/editorText';
import { currentUserHasPermission, currentUserIsHealthy, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import type { ContentItem, ContentStatus, ContentVisibility, ContentWritePayload } from '@/types/content';

function validStatus(status: unknown): status is ContentStatus {
  return ['draft', 'in_review', 'published', 'archived', 'needs_update'].includes(String(status));
}

function validVisibility(visibility: unknown): visibility is ContentVisibility {
  return ['public', 'candidate', 'onboarding', 'staff', 'alumni', 'admin_only', 'safety_sensitive'].includes(String(visibility));
}

async function uniqueSlug(baseSlug: string, existingId?: string) {
  const db = getAdminDb();
  let candidate = baseSlug || `article-${Date.now()}`;
  let attempt = 1;

  while (attempt < 12) {
    const snapshot = await db.collection('contentItems').where('slug', '==', candidate).limit(1).get();
    if (snapshot.empty || snapshot.docs[0].id === existingId) return candidate;
    attempt += 1;
    candidate = `${baseSlug}-${attempt}`;
  }

  return `${baseSlug}-${Date.now()}`;
}

function validatePayload(payload: Partial<ContentWritePayload>) {
  if (!payload.title?.trim()) return 'Title is required.';
  if (!payload.bodyEditorJs?.blocks || !Array.isArray(payload.bodyEditorJs.blocks)) return 'Article body is required.';
  if (!payload.categoryId?.trim()) return 'Category is required.';
  if (!validVisibility(payload.visibility)) return 'Visibility is not valid.';
  if (!validStatus(payload.status)) return 'Status is not valid.';
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'published';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 80), 150);
    const currentUser = await verifyRequestUser(request).catch(() => null);

    const snapshot = await getAdminDb()
      .collection('contentItems')
      .where('type', '==', 'wiki')
      .limit(limit)
      .get();
    const articles = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as ContentItem)
      .filter((article) => status === 'all' || article.status === status)
      .filter((article) => {
        if (article.status !== 'published') {
          return !!currentUser && (
            article.createdByUid === currentUser.decodedToken.uid ||
            currentUserHasPermission(currentUser, 'canEditWiki')
          );
        }
        return canAccessVisibility(currentUser?.profile ?? null, article.visibility);
      })
      .sort((a, b) => {
        const aValue = typeof a.updatedAt === 'object' && a.updatedAt && 'seconds' in a.updatedAt ? Number(a.updatedAt.seconds) : 0;
        const bValue = typeof b.updatedAt === 'object' && b.updatedAt && 'seconds' in b.updatedAt ? Number(b.updatedAt.seconds) : 0;
        return bValue - aValue;
      });

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Failed to read wiki articles:', error);
    return NextResponse.json({ error: 'Failed to read wiki articles.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser || !currentUserIsHealthy(currentUser)) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const payload = (await request.json()) as Partial<ContentWritePayload>;
    const validationError = validatePayload(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const wantsPublish = payload.status === 'published';
    const canWriteDraft =
      currentUserHasPermission(currentUser, 'canDraftWiki') ||
      currentUserHasPermission(currentUser, 'canEditWiki') ||
      currentUserHasPermission(currentUser, 'canPublishWiki');

    if (!canWriteDraft) {
      return NextResponse.json({ error: 'You do not have wiki editing access.' }, { status: 403 });
    }
    if (wantsPublish && !currentUserHasPermission(currentUser, 'canPublishWiki')) {
      return NextResponse.json({ error: 'Publishing requires publisher access.' }, { status: 403 });
    }

    const db = getAdminDb();
    const docRef = db.collection('contentItems').doc();
    const bodyEditorJs = payload.bodyEditorJs!;
    const bodyText = extractEditorPlainText(bodyEditorJs);
    const plainTextSearch = [payload.title, payload.summary, bodyText].filter(Boolean).join('\n');
    const slug = await uniqueSlug(slugify(payload.slug || payload.title!));
    const wikiLinks = findWikiLinks(plainTextSearch);

    const article: Omit<ContentItem, 'id'> = {
      type: 'wiki',
      title: payload.title!.trim(),
      slug,
      summary: payload.summary?.trim() || bodyText.slice(0, 180),
      bodyEditorJs,
      plainTextSearch,
      categoryId: payload.categoryId!,
      tagIds: payload.tagIds ?? [],
      linkedContentIds: [],
      unresolvedWikiLinks: wikiLinks,
      visibility: payload.visibility!,
      status: payload.status!,
      deliveryMode: 'wiki_page',
      ownerUid: currentUser.decodedToken.uid,
      ownerRole: null,
      createdByUid: currentUser.decodedToken.uid,
      updatedByUid: currentUser.decodedToken.uid,
      reviewedByUid: null,
      publishedByUid: wantsPublish ? currentUser.decodedToken.uid : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      publishedAt: wantsPublish ? FieldValue.serverTimestamp() : null,
      archivedAt: null,
      reviewDueAt: payload.reviewDueAt ? new Date(payload.reviewDueAt) : null,
      emergencyPriority: 0,
      isPinned: payload.isPinned ?? false,
      versionNumber: 1,
    };

    await docRef.set(article);
    await docRef.collection('revisions').doc('v1').set({
      id: 'v1',
      versionNumber: 1,
      status: wantsPublish ? 'published' : payload.status === 'in_review' ? 'submitted' : 'draft',
      bodyEditorJs,
      plainTextSearch,
      changeSummary: payload.changeSummary ?? 'Initial draft',
      createdByUid: currentUser.decodedToken.uid,
      reviewedByUid: null,
      approvedByUid: wantsPublish ? currentUser.decodedToken.uid : null,
      publishedByUid: wantsPublish ? currentUser.decodedToken.uid : null,
      createdAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      publishedAt: wantsPublish ? FieldValue.serverTimestamp() : null,
    });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: wantsPublish ? 'PUBLISHED_WIKI_ARTICLE' : 'CREATED_WIKI_DRAFT',
      targetType: 'contentItem',
      targetId: docRef.id,
      after: { title: article.title, status: article.status, visibility: article.visibility },
    });

    return NextResponse.json({ article: { id: docRef.id, ...article } }, { status: 201 });
  } catch (error) {
    console.error('Failed to create wiki article:', error);
    return NextResponse.json({ error: 'Failed to create wiki article.' }, { status: 500 });
  }
}
