'use client';

import dynamic from 'next/dynamic';
import React, { Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { slugify } from '@/lib/content/editorText';
import { DEFAULT_WIKI_CATEGORIES, type ContentItem, type ContentStatus, type ContentVisibility, type EditorData } from '@/types/content';
import EditorOutput from '@/components/wiki/EditorOutput';
import styles from './page.module.css';

// Editor.js must be imported dynamically with ssr: false
const Editor = dynamic(() => import('@/components/wiki/Editor'), {
  ssr: false,
  loading: () => <div className={styles.loadingEditor}>Loading Editor...</div>
});

const SELECTABLE_WIKI_CATEGORIES = DEFAULT_WIKI_CATEGORIES.filter((category) => !category.isSuperCategory);
const DEFAULT_CATEGORY_ID = SELECTABLE_WIKI_CATEGORIES[0]?.id ?? DEFAULT_WIKI_CATEGORIES[0].id;

interface WikiRevision {
  id: string;
  versionNumber: number;
  status: ContentStatus;
  bodyEditorJs: EditorData;
  changeSummary?: string;
  createdByUid?: string;
  createdAt?: { seconds: number; nanoseconds: number } | string | null;
}

function WikiEditPageContent() {
  const searchParams = useSearchParams();
  const articleId = searchParams.get('id') ?? undefined;
  const { user, loading, hasPermission, openAuthModal } = useAuth();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID);
  const [visibility, setVisibility] = useState<ContentVisibility>('staff');
  const [status, setStatus] = useState<ContentStatus>('draft');
  const [tags, setTags] = useState('');
  const [reviewDueAt, setReviewDueAt] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  
  // State for editor block data and revisions
  const [editorData, setEditorData] = useState<EditorData>(() => ({ time: Date.now(), blocks: [], version: '2.31.6' }));
  const editorDataRef = useRef<EditorData>({ time: 0, blocks: [], version: '2.31.6' });
  const [existingArticle, setExistingArticle] = useState<ContentItem | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(!!articleId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revisions and Preview states
  const [revisions, setRevisions] = useState<WikiRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [revisionKey, setRevisionKey] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const canDraft = hasPermission('canDraftWiki') || hasPermission('canEditWiki') || hasPermission('canPublishWiki');
  const canPublish = hasPermission('canPublishWiki');

  // Trigger login popup automatically on visit if guest
  useEffect(() => {
    if (!loading && !user) {
      openAuthModal();
    }
  }, [loading, user, openAuthModal]);

  // Load article
  useEffect(() => {
    if (!articleId || loading) return;

    let cancelled = false;
    const targetArticleId = articleId;
    async function loadArticle() {
      setLoadingArticle(true);
      setError(null);
      try {
        const token = await user?.getIdToken();
        const response = await fetch(`/api/wiki/articles/${encodeURIComponent(targetArticleId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await response.json()) as { article?: ContentItem; error?: string };
        if (!response.ok || !data.article) throw new Error(data.error || 'Unable to load article.');
        if (cancelled) return;
        setExistingArticle(data.article);
        setTitle(data.article.title);
        setSlug(data.article.slug);
        setSlugTouched(true);
        setSummary(data.article.summary);
        setCategoryId(data.article.categoryId);
        setVisibility(data.article.visibility);
        setStatus(data.article.status);
        setTags(data.article.tagIds.join(', '));
        setIsPinned(data.article.isPinned);
        setEditorData(data.article.bodyEditorJs);
        editorDataRef.current = data.article.bodyEditorJs;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingArticle(false);
      }
    }

    loadArticle();
    return () => {
      cancelled = true;
    };
  }, [articleId, loading, user]);

  useEffect(() => {
    if (!existingArticle) return;
    const articleId = existingArticle.id;
    let active = true;
    async function getRevisions() {
      setLoadingRevisions(true);
      try {
        const { db } = await import('@/lib/firebase/client');
        const { collection, getDocs, query: fsQuery, orderBy } = await import('firebase/firestore');
        const colRef = collection(db, 'contentItems', articleId, 'revisions');
        const q = fsQuery(colRef, orderBy('versionNumber', 'desc'));
        const snap = await getDocs(q);
        const list: WikiRevision[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as WikiRevision);
        });
        if (active) setRevisions(list);
      } catch (err) {
        console.error('Error fetching revisions:', err);
      } finally {
        if (active) setLoadingRevisions(false);
      }
    }
    getRevisions();
    return () => {
      active = false;
    };
  }, [existingArticle]);

  const tagIds = useMemo(
    () =>
      tags
        .split(',')
        .map((tag) => slugify(tag))
        .filter(Boolean),
    [tags],
  );

  const handleEditorChange = useCallback((data: EditorData) => {
    editorDataRef.current = data;
  }, []);

  const saveArticle = async (nextStatus: ContentStatus) => {
    if (!user) {
      setError('Sign in before saving wiki content.');
      return;
    }
    if (nextStatus === 'published' && !canPublish) {
      setError('Publishing requires publisher access.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const token = await user.getIdToken();
      const payload = {
        title,
        slug,
        summary,
        bodyEditorJs: editorDataRef.current,
        categoryId,
        tagIds,
        visibility,
        status: nextStatus,
        reviewDueAt: reviewDueAt || null,
        isPinned,
        changeSummary: changeSummary.trim() || undefined,
      };
      const response = await fetch(articleId ? `/api/wiki/articles/${encodeURIComponent(articleId)}` : '/api/wiki/articles', {
        method: articleId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { article?: ContentItem; error?: string };
      if (!response.ok || !data.article) throw new Error(data.error || 'Unable to save article.');

      setExistingArticle(data.article);
      setStatus(data.article.status);
      setChangeSummary('');
      setMessage(nextStatus === 'published' ? 'Article published.' : nextStatus === 'in_review' ? 'Draft submitted for review.' : 'Draft saved.');
      
      // Update local revision list to include the newly saved version
      if (articleId) {
        const { db } = await import('@/lib/firebase/client');
        const { collection, getDocs, query: fsQuery, orderBy } = await import('firebase/firestore');
        const colRef = collection(db, 'contentItems', articleId, 'revisions');
        const q = fsQuery(colRef, orderBy('versionNumber', 'desc'));
        const snap = await getDocs(q);
        const list: WikiRevision[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as WikiRevision);
        });
        setRevisions(list);
      }

      if (!articleId) {
        window.history.replaceState(null, '', `/wiki/edit?id=${data.article.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!articleId) return;
    if (!window.confirm('Are you sure you want to delete this article? This action cannot be undone.')) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const token = await user?.getIdToken();
      const response = await fetch(`/api/wiki/articles/${encodeURIComponent(articleId)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete article.');

      setMessage('Article deleted successfully. Redirecting...');
      setTimeout(() => {
        window.location.href = '/wiki';
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const togglePreviewMode = () => {
    if (!isPreviewMode) {
      setEditorData(editorDataRef.current);
    }
    setIsPreviewMode(!isPreviewMode);
  };

  if (loading || loadingArticle) {
    return <div className={styles.container}>Loading editor...</div>;
  }

  if (!canDraft) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Wiki Editor</h1>
        </header>
        <div className={styles.noticePanel}>
          <p>Wiki editing is available to staff with draft, editor, or publisher access.</p>
          {!user && (
            <button className={styles.publishBtn} onClick={openAuthModal}>
              Sign In / Register
            </button>
          )}
          <Link href="/wiki" className={styles.secondaryLink}>Back to Wiki</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>{existingArticle ? 'Edit Wiki Article' : 'Create Wiki Article'}</h1>
          {existingArticle && <p className={styles.subtleMeta}>Current status: {status}</p>}
        </div>
        <div className={styles.actions}>
          {existingArticle && (
            <button className={styles.deleteBtn} onClick={handleDelete} disabled={saving}>
              Delete
            </button>
          )}
          <button className={styles.saveBtn} onClick={() => saveArticle('draft')} disabled={saving}>Save Draft</button>
          <button className={styles.saveBtn} onClick={() => saveArticle('in_review')} disabled={saving}>Submit for Review</button>
          <button className={styles.publishBtn} onClick={() => saveArticle('published')} disabled={saving || !canPublish}>Publish</button>
        </div>
      </header>

      {message && <div className={styles.successMessage}>{message}</div>}
      {error && <div className={styles.errorMessage}>{error}</div>}
      
      <div className={styles.editorWrapper}>
        <div className={styles.metadataForm}>
          <input
            type="text"
            placeholder="Article Title"
            className={styles.titleInput}
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              if (!slugTouched) setSlug(slugify(nextTitle));
            }}
          />
          <input
            type="text"
            placeholder="article-slug"
            className={styles.slugInput}
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
          />
          <select className={styles.categorySelect} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {DEFAULT_WIKI_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id} disabled={category.isSuperCategory}>
                {category.parentId
                  ? `${DEFAULT_WIKI_CATEGORIES.find((parent) => parent.id === category.parentId)?.name ?? category.parentId} / ${category.name}`
                  : category.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.secondaryMetadata}>
          <label>
            Summary
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
          </label>
          <label>
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="training, forms, policy" />
          </label>
          <label>
            Visibility
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as ContentVisibility)}>
              <option value="public">Public</option>
              <option value="candidate">Candidate</option>
              <option value="onboarding">Onboarding</option>
              <option value="staff">Staff</option>
              <option value="alumni">Alumni</option>
              <option value="admin_only">Admin only</option>
              <option value="safety_sensitive">Safety sensitive</option>
            </select>
          </label>
          <label>
            Review due
            <input type="date" value={reviewDueAt} onChange={(event) => setReviewDueAt(event.target.value)} />
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={isPinned} onChange={(event) => setIsPinned(event.target.checked)} />
            Pin article
          </label>
          
          <label>
            Change Summary
            <input
              type="text"
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              placeholder="e.g. Fixed typo, updated contact details"
            />
          </label>

          {loadingRevisions ? (
            <div className={styles.revisionLoading}>Loading revision list...</div>
          ) : revisions.length > 0 ? (
            <div className={styles.revisionControl}>
              <label>
                Load Previous Revision
                <select
                  onChange={(e) => {
                    const revId = e.target.value;
                    if (!revId) return;
                    const rev = revisions.find((r) => r.id === revId);
                    if (rev && window.confirm(`Load revision v${rev.versionNumber}? This will overwrite your current unsaved editor content.`)) {
                      setEditorData(rev.bodyEditorJs);
                      editorDataRef.current = rev.bodyEditorJs;
                      setRevisionKey((k) => k + 1);
                    }
                  }}
                  defaultValue=""
                  className={styles.revisionSelect}
                >
                  <option value="">-- Choose version --</option>
                  {revisions.map((rev) => {
                    const date = rev.createdAt
                      ? typeof rev.createdAt === 'object' && 'seconds' in rev.createdAt
                        ? new Date(Number(rev.createdAt.seconds) * 1000).toLocaleDateString()
                        : new Date(String(rev.createdAt)).toLocaleDateString()
                      : 'Recently';
                    return (
                      <option key={rev.id} value={rev.id}>
                        v{rev.versionNumber} ({rev.changeSummary || 'No summary'}) - {date}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
          ) : null}
        </div>
        
        <div className={styles.editorAreaWrapper}>
          <div className={styles.editorAreaHeader}>
            <h3>Body Content</h3>
            <button
              type="button"
              className={styles.previewToggleBtn}
              onClick={togglePreviewMode}
            >
              {isPreviewMode ? 'Return to Editor' : 'Show Live Preview'}
            </button>
          </div>
          <div className={styles.editorArea}>
            {isPreviewMode ? (
              <div className={styles.livePreviewContainer}>
                <EditorOutput data={editorData} />
              </div>
            ) : (
              <Editor key={`${existingArticle?.id ?? 'new'}-${revisionKey}`} initialData={editorData} onChange={handleEditorChange} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WikiEditPage() {
  return (
    <Suspense fallback={<div className={styles.container}>Loading editor...</div>}>
      <WikiEditPageContent />
    </Suspense>
  );
}
