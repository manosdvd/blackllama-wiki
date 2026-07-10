'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import type { ForumPost, ForumPostFlag, ForumTopic } from '@/types/community';
import styles from './page.module.css';

type FlagQueueItem = ForumPostFlag & {
  post: ForumPost | null;
  topic: ForumTopic | null;
};

function dateLabel(value: unknown) {
  if (!value) return 'Recently';
  let millis = 0;
  if (typeof value === 'string' || typeof value === 'number') millis = new Date(value).getTime();
  if (typeof value === 'object' && value !== null) {
    if ('seconds' in value) millis = Number(value.seconds) * 1000;
    if ('_seconds' in value) millis = Number(value._seconds) * 1000;
  }
  return millis ? new Date(millis).toLocaleString() : 'Recently';
}

export default function CommunityModerationPage() {
  const { user, loading, hasPermission } = useAuth();
  const [flags, setFlags] = useState<FlagQueueItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canModerate = hasPermission('canModerateCommunity');

  const authHeaders = useCallback(async () => {
    if (!user) throw new Error('Sign in is required.');
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, [user]);

  const loadFlags = useCallback(async () => {
    if (!user || !canModerate) return;
    setError(null);
    try {
      const response = await fetch('/api/forum/flags', { headers: await authHeaders(), cache: 'no-store' });
      const data = (await response.json()) as { flags?: FlagQueueItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load community flags.');
      setFlags(data.flags ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [authHeaders, canModerate, user]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadFlags();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFlags, loading]);

  const resolveFlag = async (flag: FlagQueueItem, status: 'resolved' | 'dismissed', removePost = false) => {
    setBusyId(flag.id);
    setError(null);
    try {
      const response = await fetch(`/api/forum/flags/${flag.id}`, {
        method: 'PATCH',
        headers: {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          removePost,
          removalReason: removePost ? 'Removed after moderator review.' : undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to resolve flag.');
      await loadFlags();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : String(resolveError));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className={styles.container}>Loading moderation queue…</div>;
  if (!user || !canModerate) {
    return <div className={styles.container}><h1>Community Moderation</h1><p>Moderator access is required.</p></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Community Moderation</h1>
          <p>Review public forum flags. There are no private messages in this system.</p>
        </div>
        <Link href="/forum" className={styles.forumLink}>Open Forum</Link>
      </header>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {flags.length === 0 ? (
        <div className={styles.emptyState}>No open community flags.</div>
      ) : (
        <div className={styles.flagList}>
          {flags.map((flag) => (
            <article key={flag.id} className={styles.flagCard}>
              <div className={styles.flagMeta}>
                <strong>{flag.topic?.title || 'Missing topic'}</strong>
                <span>{dateLabel(flag.createdAt)}</span>
              </div>
              <p className={styles.reason}><strong>Report:</strong> {flag.reason}</p>
              <div className={styles.postPreview}>
                <span>{flag.post?.authorName || 'Unknown author'}</span>
                <p>{flag.post?.isRemoved ? flag.post.removalReason || 'Post already removed.' : flag.post?.content || 'Post unavailable.'}</p>
              </div>
              <div className={styles.actions}>
                {flag.topic && <Link href={`/forum/topic/${flag.topic.id}`} className={styles.secondaryButton}>View Context</Link>}
                <button type="button" className={styles.secondaryButton} disabled={busyId === flag.id} onClick={() => void resolveFlag(flag, 'dismissed')}>Dismiss Flag</button>
                <button type="button" className={styles.primaryButton} disabled={busyId === flag.id || flag.post?.isRemoved} onClick={() => void resolveFlag(flag, 'resolved', true)}>Remove Post</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
