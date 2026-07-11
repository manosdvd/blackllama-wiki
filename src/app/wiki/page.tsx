'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { BookOpen, ShieldAlert, Utensils, Tent, FileText, Plus, Search } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { DEFAULT_WIKI_CATEGORIES, type ContentItem } from '@/types/content';

export default function WikiIndexPage() {
  const { user, profile, loading, hasPermission } = useAuth();
  const [articles, setArticles] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loadingArticles, setLoadingArticles] = useState(true);
  const categoryById = useMemo(() => new Map(DEFAULT_WIKI_CATEGORIES.map((category) => [category.id, category])), []);

  const categoryLabel = (id: string) => categoryById.get(id)?.name ?? id;

  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    async function loadArticles() {
      setLoadingArticles(true);
      setError(null);
      try {
        const token = await user?.getIdToken();
        const response = await fetch('/api/wiki/articles?status=published&limit=120', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await response.json()) as { articles?: ContentItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load wiki articles.');
        if (!cancelled) setArticles(data.articles ?? []);
      } catch (err) {
        console.warn('API fetch failed, falling back to client-side Firestore cache:', err);
        try {
          const { db } = await import('@/lib/firebase/client');
          const { collection, getDocs, query: fsQuery, where, limit: fsLimit } = await import('firebase/firestore');
          const { canAccessVisibility } = await import('@/lib/auth/permissions');

          if (cancelled) return;
          const colRef = collection(db, 'contentItems');
          const q = fsQuery(colRef, where('type', '==', 'wiki'), where('status', '==', 'published'), fsLimit(120));
          const querySnapshot = await getDocs(q);
          const articlesList: ContentItem[] = [];
          querySnapshot.forEach((docSnap) => {
            articlesList.push({ id: docSnap.id, ...docSnap.data() } as ContentItem);
          });

          // Filter by visibility locally
          const filtered = articlesList
            .filter((art) => canAccessVisibility(profile, art.visibility))
            .sort((a, b) => {
              const aVal = a.updatedAt && typeof a.updatedAt === 'object' && 'seconds' in a.updatedAt ? Number(a.updatedAt.seconds) : 0;
              const bVal = b.updatedAt && typeof b.updatedAt === 'object' && 'seconds' in b.updatedAt ? Number(b.updatedAt.seconds) : 0;
              return bVal - aVal;
            });

          if (!cancelled) {
            setArticles(filtered);
            setError(null);
          }
        } catch (fallbackErr) {
          console.error('Fallback query failed:', fallbackErr);
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoadingArticles(false);
      }
    }

    loadArticles();
    return () => {
      cancelled = true;
    };
  }, [loading, user, profile]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      counts.set(article.categoryId, (counts.get(article.categoryId) ?? 0) + 1);
      const parentId = categoryById.get(article.categoryId)?.parentId;
      if (parentId) counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
    }
    return counts;
  }, [articles, categoryById]);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return articles.filter((article) => {
      const parentId = categoryById.get(article.categoryId)?.parentId;
      const matchesCategory = categoryFilter === 'all' || article.categoryId === categoryFilter || parentId === categoryFilter;
      const matchesQuery =
        !normalizedQuery ||
        [article.title, article.summary, article.plainTextSearch, article.tagIds.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [articles, categoryById, categoryFilter, query]);

  const iconForCategory = (id: string) => {
    if (id.includes('emergency')) return <ShieldAlert className={styles.catIcon} />;
    if (id.includes('kitchen')) return <Utensils className={styles.catIcon} />;
    if (id.includes('program')) return <Tent className={styles.catIcon} />;
    return <BookOpen className={styles.catIcon} />;
  };

  const canCreate = hasPermission('canDraftWiki') || hasPermission('canEditWiki') || hasPermission('canPublishWiki');

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <h1>Camp Lawton Wiki</h1>
          <p className={styles.subtitle}>The central repository for all staff knowledge, forms, and operating procedures.</p>
        </div>
        {canCreate && (
          <Link href="/wiki/edit" className={styles.newBtn}>
            <Plus size={20} />
            New Article
          </Link>
        )}
      </header>

      <section className={styles.searchPanel}>
        <div className={styles.searchBox}>
          <Search size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search procedures, songs, forms, and camp knowledge"
          />
        </div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {DEFAULT_WIKI_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </section>

      <div className={styles.layout}>
        <section className={styles.categoriesSection}>
          <h2 className={styles.sectionTitle}>Categories</h2>
          <div className={styles.categoryGrid}>
            {DEFAULT_WIKI_CATEGORIES.map(cat => (
              <button
                type="button"
                key={cat.id}
                className={`${styles.categoryCard} ${categoryFilter === cat.id ? styles.categoryCardActive : ''}`}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id)}
              >
                <div className={styles.catIconWrapper}>{iconForCategory(cat.id)}</div>
                <div className={styles.catInfo}>
                  <h3>{cat.name}</h3>
                  {cat.parentId && <span className={styles.catParent}>{categoryLabel(cat.parentId)}</span>}
                  <span className={styles.catCount}>{categoryCounts.get(cat.id) ?? 0} articles</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.recentSection}>
          <h2 className={styles.sectionTitle}>Articles</h2>
          <div className={styles.recentList}>
            {loadingArticles && <p className={styles.emptyState}>Loading wiki content...</p>}
            {error && <p className={styles.errorState}>{error}</p>}
            {!loadingArticles && !error && filteredArticles.length === 0 && (
              <div className={styles.emptyState}>
                <FileText size={28} />
                <p>No published wiki articles match this view yet.</p>
              </div>
            )}
            {filteredArticles.map(article => (
              <Link href={`/wiki/article/${article.id}`} key={article.id} className={styles.articleCard}>
                <div className={styles.articleIcon}>
                  <FileText size={24} />
                </div>
                <div className={styles.articleMeta}>
                  <h3>{article.title}</h3>
                  <p className={styles.articleSummary}>{article.summary}</p>
                  <div className={styles.articleDetails}>
                    <span className={styles.articleBadge}>{categoryLabel(article.categoryId)}</span>
                    <span className={styles.articleAuthor}>{article.visibility}</span>
                    {article.isPinned && <span className={styles.articleDate}>Pinned</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
