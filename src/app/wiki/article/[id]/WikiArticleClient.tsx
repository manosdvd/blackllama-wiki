'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Clock, Edit3, Shield, User } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import EditorOutput from '@/components/wiki/EditorOutput';
import type { ContentItem } from '@/types/content';
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

export default function WikiArticleClient({ id }: { id: string }) {
  const { user, loading, hasPermission } = useAuth();
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
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingArticle(false);
      }
    }

    loadArticle();
    return () => {
      cancelled = true;
    };
  }, [id, loading, user]);

  const canEdit = hasPermission('canEditWiki') || hasPermission('canPublishWiki');

  if (loadingArticle || loading) {
    return <div className={styles.container}>Loading article...</div>;
  }

  if (error || !article) {
    return (
      <div className={styles.container}>
        <Link href="/wiki" className={styles.backLink}>
          <ChevronLeft size={20} />
          Back to Wiki
        </Link>
        <div className={styles.emptyState}>{error ?? 'Article not found.'}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb}>
        <Link href="/wiki" className={styles.backLink}>
          <ChevronLeft size={20} />
          Back to Wiki
        </Link>
        {canEdit && (
          <Link href={`/wiki/edit?id=${article.id}`} className={styles.editLink}>
            <Edit3 size={18} />
            Edit Article
          </Link>
        )}
      </nav>

      <article className={styles.article}>
        <header className={styles.articleHeader}>
          <div className={styles.categoryBadge}>{article.categoryId}</div>
          <h1>{article.title}</h1>
          <p className={styles.summary}>{article.summary}</p>
          <div className={styles.metaData}>
            <span className={styles.metaItem}>
              <User size={16} />
              {article.ownerRole || 'Camp Lawton Staff'}
            </span>
            <span className={styles.metaItem}>
              <Clock size={16} />
              Last updated: {dateLabel(article.updatedAt)}
            </span>
            <span className={styles.metaItem}>
              <Shield size={16} />
              {article.visibility}
            </span>
          </div>
        </header>

        <div className={styles.content}>
          <EditorOutput data={article.bodyEditorJs} />
        </div>
      </article>
    </div>
  );
}
