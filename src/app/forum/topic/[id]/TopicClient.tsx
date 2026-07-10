'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { forumCategoryName, type ForumPost, type ForumTopic } from '@/types/community';
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

function dateLabel(value: unknown) {
  const millis = timestampMillis(value);
  if (!millis) return 'Recently';
  return new Date(millis).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Phoenix',
  });
}

export default function TopicClient({ id }: { id: string }) {
  const { user, profile, loading: authLoading, hasPermission, openAuthModal } = useAuth();
  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canModerate = hasPermission('canModerateCommunity');
  const canPost = Boolean(user && profile && profile.portalMode !== 'guest' && ['pending', 'active'].includes(profile.accountStatus));

  const authHeader = useCallback(async () => {
    if (!user) return undefined;
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, [user]);

  const loadTopic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/forum/topics/${encodeURIComponent(id)}`, {
        headers: await authHeader(),
        cache: 'no-store',
      });
      const data = (await response.json()) as { topic?: ForumTopic; posts?: ForumPost[]; error?: string };
      if (!response.ok || !data.topic) throw new Error(data.error || 'Unable to load topic.');
      setTopic(data.topic);
      setPosts(data.posts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [authHeader, id]);

  useEffect(() => {
    if (authLoading) return;
    void loadTopic();
  }, [authLoading, loadTopic]);

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!canPost) {
      setError('Your account does not currently have community posting access.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/forum/topics/${encodeURIComponent(id)}/posts`, {
        method: 'POST',
        headers: {
          ...(await authHeader()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: reply }),
      });
      const data = (await response.json()) as { post?: ForumPost; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error || 'Unable to post reply.');
      setReply('');
      await loadTopic();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const flagPost = async (post: ForumPost) => {
    if (!user) {
      openAuthModal();
      return;
    }
    const reason = window.prompt('Briefly explain what needs moderator attention:', 'Needs moderator review.');
    if (reason === null) return;

    setBusyId(post.id);
    setError(null);
    try {
      const response = await fetch(`/api/forum/posts/${post.id}/flag`, {
        method: 'POST',
        headers: {
          ...(await authHeader()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to flag post.');
    } catch (flagError) {
      setError(flagError instanceof Error ? flagError.message : String(flagError));
    } finally {
      setBusyId(null);
    }
  };

  const removePost = async (post: ForumPost) => {
    if (!window.confirm('Remove this post? It will remain in the audit history.')) return;
    setBusyId(post.id);
    setError(null);
    try {
      const response = await fetch(`/api/forum/posts/${post.id}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to remove post.');
      await loadTopic();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    } finally {
      setBusyId(null);
    }
  };

  const setTopicStatus = async (status: 'open' | 'locked' | 'removed') => {
    if (!topic) return;
    if (status === 'removed' && !window.confirm('Remove this entire topic?')) return;
    setBusyId(topic.id);
    setError(null);
    try {
      const response = await fetch(`/api/forum/topics/${topic.id}`, {
        method: 'PATCH',
        headers: {
          ...(await authHeader()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = (await response.json()) as { topic?: ForumTopic; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to update topic.');
      if (status === 'removed') {
        window.location.assign('/forum');
        return;
      }
      await loadTopic();
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : String(moderationError));
    } finally {
      setBusyId(null);
    }
  };

  if (loading || authLoading) {
    return <div className={styles.container}>Loading discussion…</div>;
  }

  if (error && !topic) {
    return (
      <div className={styles.container}>
        <Link href="/forum" className={styles.backLink}>← Back to Forum</Link>
        <div className={styles.lockedMessage}>{error}</div>
      </div>
    );
  }

  if (!topic) return null;

  return (
    <div className={styles.container} data-topic-id={id}>
      <Link href="/forum" className={styles.backLink}>← Back to Forum</Link>

      <header className={styles.header}>
        <h1>{topic.title}</h1>
        <div className={styles.meta}>
          <span className={styles.categoryBadge}>{forumCategoryName(topic.categoryId)}</span>
          <span>Started by {topic.authorName}</span>
          {topic.status === 'locked' && <span className={styles.statusLocked}>🔒 Locked</span>}
        </div>
        {canModerate && (
          <div className={styles.moderatorActions}>
            <button type="button" onClick={() => void setTopicStatus(topic.status === 'locked' ? 'open' : 'locked')} disabled={busyId === topic.id}>
              {topic.status === 'locked' ? 'Unlock Topic' : 'Lock Topic'}
            </button>
            <button type="button" onClick={() => void setTopicStatus('removed')} disabled={busyId === topic.id}>Remove Topic</button>
          </div>
        )}
      </header>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.postList}>
        <article className={`${styles.postCard} ${styles.opPost}`}>
          <div className={styles.postHeader}>
            <div className={styles.authorInfo}>
              <span className={styles.authorName}>{topic.authorName}</span>
              <span className={styles.authorRole}>{topic.authorRole}</span>
            </div>
            <span className={styles.postDate}>{dateLabel(topic.createdAt)}</span>
          </div>
          <div className={styles.postContent}>{topic.body}</div>
        </article>

        {posts.map((post) => {
          const ownPost = post.authorUid === user?.uid;
          return (
            <article key={post.id} className={styles.postCard}>
              <div className={styles.postHeader}>
                <div className={styles.authorInfo}>
                  <span className={styles.authorName}>{post.authorName}</span>
                  <span className={styles.authorRole}>{post.authorRole}</span>
                </div>
                <div className={styles.postActions}>
                  <span className={styles.postDate}>{dateLabel(post.createdAt)}</span>
                  {!post.isRemoved && !ownPost && (
                    <button type="button" className={styles.flagBtn} onClick={() => void flagPost(post)} disabled={busyId === post.id}>🚩 Flag</button>
                  )}
                  {!post.isRemoved && (ownPost || canModerate) && (
                    <button type="button" className={styles.flagBtn} onClick={() => void removePost(post)} disabled={busyId === post.id}>Remove</button>
                  )}
                </div>
              </div>
              {post.isRemoved ? (
                <div className={styles.removedPost}>⚠️ {post.removalReason || 'This post was removed.'}</div>
              ) : (
                <div className={styles.postContent}>{post.content}</div>
              )}
            </article>
          );
        })}
      </div>

      {topic.status === 'locked' ? (
        <div className={styles.lockedMessage}>🔒 This topic has been locked. New replies are disabled.</div>
      ) : canPost ? (
        <form className={styles.replySection} onSubmit={submitReply}>
          <h3>Post a Reply</h3>
          <textarea
            required
            minLength={2}
            maxLength={6000}
            className={styles.textarea}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Keep it useful, public, and Scout appropriate."
          />
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Posting…' : 'Submit Reply'}
          </button>
        </form>
      ) : (
        <div className={styles.replySection}>
          <h3>Join the discussion</h3>
          <p>Sign in with an eligible account to post replies.</p>
          {!user && <button type="button" className={styles.submitBtn} onClick={openAuthModal}>Sign In / Register</button>}
        </div>
      )}
    </div>
  );
}
