'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import type { OnboardingTaskDefinition, UserOnboarding, UserOnboardingTaskStatus } from '@/types/onboarding';
import styles from './page.module.css';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const [onboarding, setOnboarding] = useState<UserOnboarding | null>(null);
  const [tasks, setTasks] = useState<OnboardingTaskDefinition[]>([]);
  const [taskStatus, setTaskStatus] = useState<UserOnboardingTaskStatus[]>([]);
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOnboarding = useCallback(async () => {
    if (!user) {
      setLoadingOnboarding(false);
      return;
    }

    setLoadingOnboarding(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/onboarding', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as {
        onboarding?: UserOnboarding | null;
        tasks?: OnboardingTaskDefinition[];
        taskStatus?: UserOnboardingTaskStatus[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Unable to load onboarding.');
      setOnboarding(data.onboarding ?? null);
      setTasks(data.tasks ?? []);
      setTaskStatus(data.taskStatus ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingOnboarding(false);
    }
  }, [user]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadOnboarding();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOnboarding, loading]);

  const statusByTaskId = useMemo(() => {
    const map = new Map<string, UserOnboardingTaskStatus>();
    for (const status of taskStatus) map.set(status.id, status);
    return map;
  }, [taskStatus]);

  const applicableTasks = useMemo(() => {
    const roleType = onboarding?.roleType ?? 'paid';
    return tasks
      .filter((task) => task.requiredFor === 'all' || task.requiredFor === roleType)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [onboarding?.roleType, tasks]);

  const updateTask = async (taskId: string, status: 'in_progress' | 'submitted') => {
    if (!user || !onboarding) return;
    setMessage(null);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/onboarding/${user.uid}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seasonId: onboarding.seasonId, status }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to update task.');
      setMessage(status === 'submitted' ? 'Task marked submitted for admin verification.' : 'Task marked in progress.');
      await loadOnboarding();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading || loadingOnboarding) {
    return <div className={styles.container}>Loading onboarding...</div>;
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <h1>Staff Onboarding Checklist</h1>
          <p>Sign in from the header to see your generated onboarding checklist after application approval.</p>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Staff Onboarding Checklist</h1>
        <p>
          Welcome to the team! Before you arrive at camp, you must complete the following documentation.
          For your security and privacy, most of these documents are handled through official secure channels.
          Click the links to open the official forms, fill them out, and follow the submission instructions provided on each form.
        </p>
        {onboarding && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <span style={{ width: `${onboarding.percentComplete}%` }} />
            </div>
            <strong>{onboarding.percentComplete}% complete</strong>
          </div>
        )}
      </header>

      {message && <div className={styles.successMessage}>{message}</div>}
      {error && <div className={styles.errorMessage}>{error}</div>}
      {!onboarding && (
        <div className={styles.pendingPanel}>
          Your onboarding checklist has not been generated yet. It appears here after an admin approves your application.
        </div>
      )}

      <div className={styles.checklistGrid}>
        <section className={styles.checklistSection}>
          <div className={styles.sectionHeader}>
            <h2>Required for ALL Staff</h2>
            <span className={styles.badge}>Mandatory</span>
          </div>
          <ul className={styles.taskList}>
            {applicableTasks.filter((task) => task.requiredFor === 'all').map((task) => {
              const status = statusByTaskId.get(task.id)?.status ?? 'not_started';
              return (
                <li key={task.id}>
                  <div className={styles.taskInfo}>
                    <strong>{task.title}</strong>
                    <p>{task.description}</p>
                  </div>
                  <div className={styles.taskActions}>
                    <span className={styles.statusPending}>{status.replace('_', ' ')}</span>
                    {task.officialUrl && <a href={task.officialUrl} className={styles.externalLink} target="_blank" rel="noopener noreferrer">{task.actionLabel ?? 'Open'}</a>}
                    {onboarding && status !== 'verified' && status !== 'submitted' && (
                      <button onClick={() => updateTask(task.id, 'submitted')} className={styles.inlineButton}>Mark Submitted</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {applicableTasks.some((task) => task.requiredFor === 'paid') && (
        <section className={styles.checklistSection}>
          <div className={styles.sectionHeader}>
            <h2>Required for PAID Staff Only</h2>
            <span className={styles.badgePaid}>Paid Roles</span>
          </div>
          <ul className={styles.taskList}>
            {applicableTasks.filter((task) => task.requiredFor === 'paid').map((task) => {
              const status = statusByTaskId.get(task.id)?.status ?? 'not_started';
              return (
                <li key={task.id}>
                  <div className={styles.taskInfo}>
                    <strong>{task.title}</strong>
                    <p>{task.description}</p>
                  </div>
                  <div className={styles.taskActions}>
                    <span className={styles.statusPending}>{status.replace('_', ' ')}</span>
                    {task.officialUrl && <a href={task.officialUrl} className={styles.externalLink} target="_blank" rel="noopener noreferrer">{task.actionLabel ?? 'Open'}</a>}
                    {onboarding && status !== 'verified' && status !== 'submitted' && (
                      <button onClick={() => updateTask(task.id, 'submitted')} className={styles.inlineButton}>Mark Submitted</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        )}
      </div>
    </div>
  );
}
