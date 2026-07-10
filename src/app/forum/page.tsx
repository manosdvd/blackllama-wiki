'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import {
  FORUM_CATEGORIES,
  forumCategoryName,
  type ForumCategoryId,
  type ForumTopic,
} from '@/types/community';
import styles from './page.module.css';

function timestampMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  if (typeof value === 'object' && value !== null) {
    if ('seconds' in value) return Number(value.seconds) * 1000;
    if ('_seconds' in value) return Number(value._seconds) * 1000;
  }
  return 0;
}

function relativeDate(value: unknown) {
  const millis = timestampMillis(value);
  if (!millis) return 'Recently';
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - millis) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function ForumPage() {
  const { user, profile, loading: authLoading, openAuthModal } = useAuth();
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ForumCategoryId | 'all'>('all');
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState<ForumCategoryId>('general');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPost = Boolean(user && profile && profile.portalMode !== 'guest' && ['pending', 'active'].includes(profile.accountStatus));

  const loadTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      const response = await fetch(`/api/forum/topics?${params}`, { cache: 'no-store' });
      const data = (await response.json()) as { topics?: ForumTopic[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load the forum.');
      setTopics(data.topics ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  const sortedTopics = useMemo(() => (
    [...topics].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return timestampMillis(b.lastActivityAt) - timestampMillis(a.lastActivityAt);
    })
  ), [topics]);

  const openComposer = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (!canPost) {
      setError('Your account does not currently have community posting access.');
      return;
    }
    setShowComposer(true);
  };

  const createTopic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canPost) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/forum/topics', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, categoryId }),
      });
      const data = (await response.json()) as { topic?: ForumTopic; error?: string };
      if (!response.ok || !data.topic) throw new Error(data.error || 'Unable to create topic.');
      window.location.assign(`/forum/topic/${data.topic.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Staff Forum</h1>
          <p className={styles.subtitle}>Public camp discussions, questions, and stories. No private messages.</p>
        </div>
        <button type="button" className={styles.newTopicBtn} onClick={openComposer} disabled={authLoading}>
          <span>+</span> New Topic
        </button>
      </header>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {showComposer && (
        <form className={styles.composer} onSubmit={createTopic}>
          <div className={styles.composerHeader}>
            <h2>Start a Topic</h2>
            <button type="button" className={styles.closeComposer} onClick={() => setShowComposer(false)} aria-label="Close topic composer">×</button>
          </div>
          <label>
            Category
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value as ForumCategoryId)}>
              {FORUM_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            Title
            <input required minLength={4} maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Message
            <textarea required minLength={2} maxLength={6000} rows={7} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <div className={styles.composerActions}>
            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? 'Posting…' : 'Post Topic'}
            </button>
          </div>
        </form>
      )}

      <div className={styles.layout}>
        <section className={styles.categoriesSection}>
          <h2 className={styles.sectionTitle}>Categories</h2>
          <div className={styles.categoryList}>
            <button
              type="button"
              className={`${styles.categoryCard} ${selectedCategory === 'all' ? styles.categorySelected : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              <div className={styles.categoryIcon}>🔥</div>
              <div className={styles.categoryInfo}>
                <h3>All Activity</h3>
                <p>Everything from across the staff community.</p>
              </div>
            </button>
            {FORUM_CATEGORIES.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`${styles.categoryCard} ${selectedCategory === category.id ? styles.categorySelected : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                <div className={styles.categoryIcon}>{category.icon}</div>
                <div className={styles.categoryInfo}>
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.topicsSection}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          {loading ? (
            <p className={styles.emptyState}>Loading community posts…</p>
          ) : sortedTopics.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No topics here yet.</p>
              <button type="button" className={styles.inlineButton} onClick={openComposer}>Start the first one</button>
            </div>
          ) : (
            <div className={styles.topicList}>
              {sortedTopics.map((topic) => (
                <Link href={`/forum/topic/${topic.id}`} key={topic.id} className={styles.topicCard}>
                  <div className={styles.topicHeader}>
                    <h3>{topic.isPinned ? '📌 ' : ''}{topic.title}</h3>
                    <div className={styles.replyCount}>
                      <span>💬</span> {topic.replyCount ?? 0}
                    </div>
                  </div>
                  <p className={styles.topicExcerpt}>{topic.body}</p>
                  <div className={styles.topicMeta}>
                    <span className={styles.categoryBadge}>{forumCategoryName(topic.categoryId)}</span>
                    <span className={styles.topicAuthor}>by {topic.authorName}</span>
                    <span className={styles.topicDate}>{relativeDate(topic.lastActivityAt ?? topic.createdAt)}</span>
                    {topic.status === 'locked' && <span className={styles.lockedBadge}>Locked</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
