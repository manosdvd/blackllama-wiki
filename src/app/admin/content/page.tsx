'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import type { ContentItem } from '@/types/content';
import styles from './page.module.css';

export default function AdminContentPage() {
  const { user, loading, hasPermission } = useAuth();
  const [articles, setArticles] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasPermission('canEditWiki') || hasPermission('canPublishWiki');

  useEffect(() => {
    if (loading || !user || !canEdit) return;

    async function loadArticles() {
      setError(null);
      try {
        const token = await user!.getIdToken();
        const response = await fetch('/api/wiki/articles?status=all&limit=150', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await response.json()) as { articles?: ContentItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load content.');
        setArticles(data.articles ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    loadArticles();
  }, [loading, user, canEdit]);

  const counts = useMemo(() => {
    return articles.reduce<Record<string, number>>((acc, article) => {
      acc[article.status] = (acc[article.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [articles]);

  if (loading) return <div className={styles.container}>Loading content admin...</div>;

  if (!user || !canEdit) {
    return (
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <h1>Wiki Content</h1>
          <p>Wiki editor or publisher access is required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Wiki Content</h1>
          <p>Drafts, review queue, published articles, visibility, and review status.</p>
        </div>
        <Link href="/wiki/edit" className={styles.primaryButton}>New Article</Link>
      </header>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.statGrid}>
        {['draft', 'in_review', 'published', 'needs_update', 'archived'].map((status) => (
          <div key={status} className={styles.statCard}>
            <strong>{counts[status] ?? 0}</strong>
            <span>{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      <div className={styles.contentList}>
        {articles.length === 0 && <p>No content items yet.</p>}
        {articles.map((article) => (
          <Link href={`/wiki/edit?id=${article.id}`} key={article.id} className={styles.contentRow}>
            <div>
              <strong>{article.title}</strong>
              <p>{article.summary}</p>
            </div>
            <span>{article.categoryId}</span>
            <span>{article.visibility}</span>
            <span className={styles.statusBadge}>{article.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
