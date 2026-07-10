'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Clock, Edit3, Shield, User } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import EditorOutput from '@/components/wiki/EditorOutput';
import { DEFAULT_WIKI_CATEGORIES, type ContentItem } from '@/types/content';
import styles from './page.module.css';

function dateLabel(value: unknown) {
  if (!value) return 'Not recorded';
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).toLocaleDateString();
  if (typeof value === 'object' && value !== null) {
    const seconds = 'seconds' in value ? Number(value.seconds) : '_seconds' in value ? Number(value._seconds) : null;
    if (seconds) return new Date(seconds * 1000).toLocaleDateString();
  }
  return 'Not recorded';
}

const categoryById = new Map(DEFAULT_WIKI_CATEGORIES.map((category) => [category.id, category]));

function categoryLabel(id: string) {
  return categoryById.get(id)?.name ?? id;
}

export default function WikiArticleClient({ id }: { id: string }) {
  const { user, profile, loading, hasPermission } = useAuth();
  const [article, setArticle] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(true);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    async function loadArticle() {
      setLoadingArticle(true);
      setError(null);
      try {
        const token = await user?.getIdToken();
        const response = await fetch(`/api/wiki/articles/${encodeURIComponent(id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await response.json()) as { article?: ContentItem; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load article.');
        if (!cancelled) setArticle(data.article ?? null);
      } catch (err) {
        console.warn('API fetch failed, falling back to client-side Firestore cache:', err);
        try {
          const { db } = await import('@/lib/firebase/client');
          const { doc, getDoc, collection, query: fsQuery, where, getDocs, limit: fsLimit } = await import('firebase/firestore');
          const { canAccessVisibility } = await import('@/lib/auth/permissions');

          if (cancelled) return;
          const docRef = doc(db, 'contentItems', id);
          let docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            const colRef = collection(db, 'contentItems');
            const q = fsQuery(colRef, where('slug', '==', id), fsLimit(1));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) docSnap = querySnapshot.docs[0];
          }

          if (docSnap.exists()) {
            const articleData = { id: docSnap.id, ...docSnap.data() } as ContentItem;
            const hasAccess = articleData.status === 'published'
              ? canAccessVisibility(profile, articleData.visibility)
              : Boolean(user && (articleData.createdByUid === user.uid || hasPermission('canEditWiki')));

            if (!hasAccess) throw new Error('You do not have access to this article.');

            if (!cancelled) {
              setArticle(articleData);
              setError(null);
            }
          } else {
            throw new Error('Article not found.');
          }
        } catch (fallbackErr) {
          console.error('Fallback query failed:', fallbackErr);
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoadingArticle(false);
      }
    }

    void loadArticle();
    return () => {
      cancelled = true;
    };
  }, [id, loading, user, profile, hasPermission]);

  const canEdit = article?.status === 'published'
    ? hasPermission('canPublishWiki')
    : hasPermission('canEditWiki') || hasPermission('canPublishWiki') || (article?.createdByUid === user?.uid && hasPermission('canDraftWiki'));

  if (loadingArticle || loading) return <div className={styles.container}>Loading article...</div>;

  if (error || !article) {
    return (
      <div className={styles.container}>
        <Link href="/wiki" className={styles.backLink}><ChevronLeft size={20} />Back to Wiki</Link>
        <div className={styles.emptyState}>{error ?? 'Article not found.'}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb}>
        <Link href="/wiki" className={styles.backLink}><ChevronLeft size={20} />Back to Wiki</Link>
        {canEdit && (
          <Link href={`/wiki/edit?id=${article.id}`} className={styles.editLink}>
            <Edit3 size={18} />Edit Article
          </Link>
        )}
      </nav>

      <article className={styles.article}>
        <header className={styles.articleHeader}>
          <div className={styles.categoryBadge}>{categoryLabel(article.categoryId)}</div>
          <h1>{article.title}</h1>
          <p className={styles.summary}>{article.summary}</p>
          <div className={styles.metaData}>
            <span className={styles.metaItem}><User size={16} />{article.ownerRole || 'Camp Lawton Staff'}</span>
            <span className={styles.metaItem}><Clock size={16} />Last updated: {dateLabel(article.updatedAt)}</span>
            <span className={styles.metaItem}><Shield size={16} />{article.visibility}</span>
          </div>
        </header>

        <div className={styles.content}><EditorOutput data={article.bodyEditorJs} /></div>
      </article>
    </div>
  );
}
