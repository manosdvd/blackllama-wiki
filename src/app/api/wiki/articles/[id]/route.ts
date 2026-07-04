import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { canAccessVisibility } from '@/lib/auth/permissions';
import { extractEditorPlainText, findWikiLinks, slugify } from '@/lib/content/editorText';
import { currentUserHasPermission, currentUserIsHealthy, verifyRequestUser } from '@/lib/server/auth';
import { writeAuditLog } from '@/lib/server/audit';
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
    console.error('Failed to read wiki article:', error);
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
    const snapshot = await getArticleByIdOrSlug(id);
    if (!snapshot?.exists) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });

    const before = { id: snapshot.id, ...snapshot.data() } as ContentItem;
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

    const wantsPublish = payload.status === 'published' && before.status !== 'published';
    const canEdit =
      currentUserHasPermission(currentUser, 'canEditWiki') ||
      (before.createdByUid === currentUser.decodedToken.uid && currentUserHasPermission(currentUser, 'canDraftWiki'));

    if (!canEdit) return NextResponse.json({ error: 'You do not have wiki editing access.' }, { status: 403 });
    if (wantsPublish && !currentUserHasPermission(currentUser, 'canPublishWiki')) {
      return NextResponse.json({ error: 'Publishing requires publisher access.' }, { status: 403 });
    }
    if (payload.status === 'archived' && !currentUserHasPermission(currentUser, 'canArchiveWiki')) {
      return NextResponse.json({ error: 'Archiving requires archive access.' }, { status: 403 });
    }

    const bodyEditorJs = payload.bodyEditorJs ?? before.bodyEditorJs;
    const bodyText = extractEditorPlainText(bodyEditorJs);
    const title = payload.title?.trim() ?? before.title;
    const summary = payload.summary?.trim() ?? before.summary;
    const plainTextSearch = [title, summary, bodyText].filter(Boolean).join('\n');
    const versionNumber = (before.versionNumber ?? 1) + 1;
    const newSlug = payload.slug || (payload.title && payload.title !== before.title ? slugify(payload.title) : before.slug);
    const slug = await uniqueSlug(slugify(newSlug), snapshot.id);
    const wikiLinks = findWikiLinks(plainTextSearch);

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
      status: payload.status ?? before.status,
      updatedByUid: currentUser.decodedToken.uid,
      updatedAt: FieldValue.serverTimestamp(),
      publishedByUid: wantsPublish ? currentUser.decodedToken.uid : before.publishedByUid ?? null,
      publishedAt: wantsPublish ? FieldValue.serverTimestamp() : before.publishedAt ?? null,
      archivedAt: payload.status === 'archived' ? FieldValue.serverTimestamp() : before.archivedAt ?? null,
      reviewDueAt: payload.reviewDueAt ? new Date(payload.reviewDueAt) : before.reviewDueAt ?? null,
      isPinned: payload.isPinned ?? before.isPinned ?? false,
      versionNumber,
    };

    await snapshot.ref.set(patch, { merge: true });
    await snapshot.ref.collection('revisions').doc(`v${versionNumber}`).set({
      id: `v${versionNumber}`,
      versionNumber,
      status: wantsPublish ? 'published' : payload.status === 'in_review' ? 'submitted' : 'draft',
      bodyEditorJs,
      plainTextSearch,
      changeSummary: payload.changeSummary ?? 'Updated article',
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
      action: wantsPublish ? 'PUBLISHED_WIKI_ARTICLE' : payload.status === 'archived' ? 'ARCHIVED_WIKI_ARTICLE' : 'UPDATED_WIKI_ARTICLE',
      targetType: 'contentItem',
      targetId: snapshot.id,
      before: { title: before.title, status: before.status, visibility: before.visibility },
      after: { title: patch.title, status: patch.status, visibility: patch.visibility },
    });

    const updated = await snapshot.ref.get();
    return NextResponse.json({ article: { id: updated.id, ...updated.data() } });
  } catch (error) {
    console.error('Failed to update wiki article:', error);
    return NextResponse.json({ error: 'Failed to update wiki article.' }, { status: 500 });
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
    const canDelete =
      currentUserHasPermission(currentUser, 'canPublishWiki') ||
      currentUserHasPermission(currentUser, 'canArchiveWiki') ||
      before.createdByUid === currentUser.decodedToken.uid;

    if (!canDelete) {
      return NextResponse.json({ error: 'You do not have permission to delete this article.' }, { status: 403 });
    }

    // Delete the article doc
    await snapshot.ref.delete();

    // Log in the audit logs
    await writeAuditLog({
      actorUid: currentUser.decodedToken.uid,
      action: 'DELETED_WIKI_ARTICLE',
      targetType: 'contentItem',
      targetId: snapshot.id,
      before: { title: before.title, status: before.status, visibility: before.visibility },
      after: null,
    });

    return NextResponse.json({ success: true, message: 'Article deleted successfully.' });
  } catch (error) {
    console.error('Failed to delete wiki article:', error);
    return NextResponse.json({ error: 'Failed to delete wiki article.' }, { status: 500 });
  }
}
