import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { canAccessVisibility } from '@/lib/auth/permissions';
import {
  extractEditorPlainText,
  findWikiLinks,
  getEditorDataFirestoreError,
  sanitizeEditorData,
  slugify,
} from '@/lib/content/editorText';
import { currentUserHasPermission, currentUserIsHealthy, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
import { writeServerErrorLog } from '@/lib/server/errorLog';
import type { ContentItem, ContentStatus, ContentVisibility, ContentWritePayload } from '@/types/content';

type Context = { params: Promise<{ id: string }> };

function validStatus(status: unknown): status is ContentStatus {
  return ['draft', 'in_review', 'published', 'archived', 'needs_update'].includes(String(status));
}

function validVisibility(visibility: unknown): visibility is ContentVisibility {
  return ['public', 'candidate', 'onboarding', 'staff', 'alumni', 'admin_only', 'safety_sensitive'].includes(String(visibility));
}

async function getArticleByIdOrSlug(idOrSlug: string) {
  const db = getAdminDb();
  const directDoc = await db.collection('contentItems').doc(idOrSlug).get();
  if (directDoc.exists) return directDoc;

  const slugSnapshot = await db.collection('contentItems').where('slug', '==', idOrSlug).limit(1).get();
  return slugSnapshot.empty ? null : slugSnapshot.docs[0];
}

async function uniqueSlug(baseSlug: string, existingId: string) {
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

function revisionStatus(status: ContentStatus) {
  if (status === 'published') return 'published' as const;
  if (status === 'in_review') return 'submitted' as const;
  if (status === 'archived') return 'superseded' as const;
  return 'draft' as const;
}

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const currentUser = await verifyRequestUser(request).catch(() => null);
    const snapshot = await getArticleByIdOrSlug(id);

    if (!snapshot?.exists) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });

    const article = { id: snapshot.id, ...snapshot.data() } as ContentItem;
    const canRead =
      article.status === 'published'
        ? canAccessVisibility(currentUser?.profile ?? null, article.visibility)
        : !!currentUser &&
          (article.createdByUid === currentUser.decodedToken.uid || currentUserHasPermission(currentUser, 'canEditWiki'));

    if (!canRead) return NextResponse.json({ error: 'You do not have access to this article.' }, { status: 403 });

    return NextResponse.json({ article });
  } catch (error) {
    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'wiki.articles.read',
      message: 'Failed to read wiki article.',
      error,
      request,
      metadata: { idOrSlug: params.id },
    });
    return NextResponse.json({ error: 'Failed to read wiki article.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser || !currentUserIsHealthy(currentUser)) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const { id } = await context.params;
    const initialSnapshot = await getArticleByIdOrSlug(id);
    if (!initialSnapshot?.exists) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });

    const before = { id: initialSnapshot.id, ...initialSnapshot.data() } as ContentItem;
    const payload = (await request.json()) as Partial<ContentWritePayload>;

    if (payload.title !== undefined && !payload.title.trim()) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    }
    if (payload.visibility !== undefined && !validVisibility(payload.visibility)) {
      return NextResponse.json({ error: 'Visibility is not valid.' }, { status: 400 });
    }
    if (payload.status !== undefined && !validStatus(payload.status)) {
      return NextResponse.json({ error: 'Status is not valid.' }, { status: 400 });
    }
    if (payload.expectedVersion !== undefined && (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion < 1)) {
      return NextResponse.json({ error: 'Expected version is not valid.' }, { status: 400 });
    }

    const canPublish = currentUserHasPermission(currentUser, 'canPublishWiki');
    const canEdit =
      currentUserHasPermission(currentUser, 'canEditWiki') ||
      (before.createdByUid === currentUser.decodedToken.uid && currentUserHasPermission(currentUser, 'canDraftWiki'));

    if (!canEdit && !canPublish) return NextResponse.json({ error: 'You do not have wiki editing access.' }, { status: 403 });

    const resultingStatus = payload.status ?? before.status;
    if ((before.status === 'published' || resultingStatus === 'published') && !canPublish) {
      return NextResponse.json({ error: 'Changes to published articles require publisher access.' }, { status: 403 });
    }
    if (resultingStatus === 'archived' && !currentUserHasPermission(currentUser, 'canArchiveWiki')) {
      return NextResponse.json({ error: 'Archiving requires archive access.' }, { status: 403 });
    }

    const expectedVersion = payload.expectedVersion ?? before.versionNumber ?? 1;
    if ((before.versionNumber ?? 1) !== expectedVersion) {
      return NextResponse.json({
        error: 'This article changed after you opened it. Reload before saving so newer work is not overwritten.',
        currentVersion: before.versionNumber ?? 1,
      }, { status: 409 });
    }

    const bodyEditorJs = sanitizeEditorData(payload.bodyEditorJs ?? before.bodyEditorJs);
    const editorDataError = getEditorDataFirestoreError(bodyEditorJs);
    if (editorDataError) return NextResponse.json({ error: editorDataError }, { status: 400 });
    const bodyText = extractEditorPlainText(bodyEditorJs);
    const title = payload.title?.trim() ?? before.title;
    const summary = payload.summary?.trim() ?? before.summary;
    const plainTextSearch = [title, summary, bodyText].filter(Boolean).join('\n');
    const versionNumber = expectedVersion + 1;
    const newSlug = payload.slug || (payload.title && payload.title !== before.title ? slugify(payload.title) : before.slug);
    const slug = await uniqueSlug(slugify(newSlug), initialSnapshot.id);
    const wikiLinks = findWikiLinks(plainTextSearch);
    const wantsPublish = resultingStatus === 'published';

    const patch = {
      title,
      slug,
      summary,
      bodyEditorJs,
      plainTextSearch,
      categoryId: payload.categoryId ?? before.categoryId,
      tagIds: payload.tagIds ?? before.tagIds ?? [],
      unresolvedWikiLinks: wikiLinks,
      visibility: payload.visibility ?? before.visibility,
      status: resultingStatus,
      updatedByUid: currentUser.decodedToken.uid,
      updatedAt: FieldValue.serverTimestamp(),
      publishedByUid: wantsPublish ? currentUser.decodedToken.uid : before.publishedByUid ?? null,
      publishedAt: wantsPublish ? before.publishedAt ?? FieldValue.serverTimestamp() : before.publishedAt ?? null,
      archivedAt: resultingStatus === 'archived' ? FieldValue.serverTimestamp() : null,
      reviewDueAt: payload.reviewDueAt === null
        ? null
        : payload.reviewDueAt
          ? new Date(payload.reviewDueAt)
          : before.reviewDueAt ?? null,
      isPinned: payload.isPinned ?? before.isPinned ?? false,
      versionNumber,
    };

    const db = getAdminDb();
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(initialSnapshot.ref);
      if (!latestSnapshot.exists) throw new Error('ARTICLE_NOT_FOUND');
      const latest = latestSnapshot.data() as ContentItem;
      if ((latest.versionNumber ?? 1) !== expectedVersion) throw new Error('VERSION_CONFLICT');

      transaction.set(initialSnapshot.ref, patch, { merge: true });
      transaction.set(initialSnapshot.ref.collection('revisions').doc(`v${versionNumber}`), {
        id: `v${versionNumber}`,
        versionNumber,
        status: revisionStatus(resultingStatus),
        bodyEditorJs,
        plainTextSearch,
        changeSummary: payload.changeSummary?.trim() || 'Updated article',
        createdByUid: currentUser.decodedToken.uid,
        reviewedByUid: wantsPublish ? currentUser.decodedToken.uid : null,
        approvedByUid: wantsPublish ? currentUser.decodedToken.uid : null,
        publishedByUid: wantsPublish ? currentUser.decodedToken.uid : null,
        createdAt: FieldValue.serverTimestamp(),
        reviewedAt: wantsPublish ? FieldValue.serverTimestamp() : null,
        publishedAt: wantsPublish ? FieldValue.serverTimestamp() : null,
      });
    });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: wantsPublish ? 'PUBLISHED_WIKI_ARTICLE' : resultingStatus === 'archived' ? 'ARCHIVED_WIKI_ARTICLE' : 'UPDATED_WIKI_ARTICLE',
      targetType: 'contentItem',
      targetId: initialSnapshot.id,
      before: { title: before.title, status: before.status, visibility: before.visibility, versionNumber: before.versionNumber },
      after: { title: patch.title, status: patch.status, visibility: patch.visibility, versionNumber },
    });

    const updated = await initialSnapshot.ref.get();
    return NextResponse.json({ article: { id: updated.id, ...updated.data() } });
  } catch (error) {
    if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
      return NextResponse.json({ error: 'This article changed while you were editing. Reload before saving.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'ARTICLE_NOT_FOUND') {
      return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
    }

    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'wiki.articles.update',
      message: 'Failed to update wiki article.',
      error,
      request,
      metadata: { idOrSlug: params.id },
    });
    return NextResponse.json(
      {
        error: 'Failed to update wiki article.',
        detail: process.env.NODE_ENV === 'production' ? undefined : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const currentUser = await verifyRequestUser(request);
    if (!currentUser || !currentUserIsHealthy(currentUser)) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const { id } = await context.params;
    const snapshot = await getArticleByIdOrSlug(id);
    if (!snapshot?.exists) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as ContentItem;
    const canArchive = currentUserHasPermission(currentUser, 'canArchiveWiki');
    const ownsDraft = before.createdByUid === currentUser.decodedToken.uid && before.status !== 'published';

    if (!canArchive && !ownsDraft) {
      return NextResponse.json({ error: 'Archive access is required for this article.' }, { status: 403 });
    }
    if (before.status === 'archived') return NextResponse.json({ success: true, message: 'Article is already archived.' });

    const versionNumber = (before.versionNumber ?? 1) + 1;
    const db = getAdminDb();
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(snapshot.ref);
      if (!latestSnapshot.exists) throw new Error('ARTICLE_NOT_FOUND');
      const latest = latestSnapshot.data() as ContentItem;
      if ((latest.versionNumber ?? 1) !== (before.versionNumber ?? 1)) throw new Error('VERSION_CONFLICT');

      transaction.set(snapshot.ref, {
        status: 'archived',
        archivedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: currentUser.decodedToken.uid,
        versionNumber,
      }, { merge: true });
      transaction.set(snapshot.ref.collection('revisions').doc(`v${versionNumber}`), {
        id: `v${versionNumber}`,
        versionNumber,
        status: 'superseded',
        bodyEditorJs: before.bodyEditorJs,
        plainTextSearch: before.plainTextSearch,
        changeSummary: 'Archived article',
        createdByUid: currentUser.decodedToken.uid,
        reviewedByUid: null,
        approvedByUid: null,
        publishedByUid: null,
        createdAt: FieldValue.serverTimestamp(),
        reviewedAt: null,
        publishedAt: null,
      });
    });

    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'ARCHIVED_WIKI_ARTICLE',
      targetType: 'contentItem',
      targetId: snapshot.id,
      before: { title: before.title, status: before.status, visibility: before.visibility, versionNumber: before.versionNumber },
      after: { title: before.title, status: 'archived', visibility: before.visibility, versionNumber },
    });

    return NextResponse.json({ success: true, message: 'Article archived. Revision history was preserved.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
      return NextResponse.json({ error: 'This article changed before it could be archived. Reload and try again.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'ARTICLE_NOT_FOUND') {
      return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
    }

    const params = await context.params.catch(() => ({ id: 'unknown' }));
    await writeServerErrorLog({
      context: 'wiki.articles.archive',
      message: 'Failed to archive wiki article.',
      error,
      request,
      metadata: { idOrSlug: params.id },
    });
    return NextResponse.json({ error: 'Failed to archive wiki article.' }, { status: 500 });
  }
}
