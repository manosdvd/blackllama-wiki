'use client';

import React, { useEffect, useState } from 'react';
import TickerSyncButton from '@/components/admin/TickerSyncButton';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './page.module.css';

interface ErrorLogEntry {
  id: string;
  context?: string;
  message?: string;
  severity?: 'warning' | 'error' | 'critical';
  occurredAt?: string;
  timestamp?: string;
  error?: {
    name?: string;
    message?: string;
  };
  request?: {
    method?: string;
    path?: string;
  } | null;
}

function formatDate(value?: string) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Phoenix',
  });
}

export default function ModerationPage() {
  const { user, loading, hasPermission } = useAuth();
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const canViewLogs = hasPermission('canViewAuditLog') || hasPermission('canManageSystemSettings');

  useEffect(() => {
    if (loading || !user || !canViewLogs) return;

    async function loadLogs() {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const token = await user!.getIdToken();
        const response = await fetch('/api/admin/error-logs?limit=25', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await response.json()) as { logs?: ErrorLogEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load server error logs.');
        setLogs(data.logs ?? []);
      } catch (error) {
        setLogsError(error instanceof Error ? error.message : String(error));
      } finally {
        setLogsLoading(false);
      }
    }

    loadLogs();
  }, [loading, user, canViewLogs]);

  if (loading) return <div className={styles.container}>Loading moderation dashboard...</div>;

  if (!user || !canViewLogs) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>System & Moderation</h1>
          <p className={styles.subtitle}>Audit log access is required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>System & Moderation</h1>
        <p className={styles.subtitle}>Ticker controls and recent server-side diagnostics.</p>
      </header>

      <div className={styles.layout}>
        <section className={styles.toolPanel}>
          <TickerSyncButton />
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Recent Error Logs</h2>
          {logsError && <div className={styles.errorMessage}>{logsError}</div>}
          {logsLoading ? (
            <p className={styles.emptyState}>Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className={styles.emptyState}>No server errors have been logged yet.</p>
          ) : (
            <div className={styles.logList}>
              {logs.map((log) => (
                <article key={log.id} className={`${styles.logEntry} ${styles[log.severity ?? 'error']}`}>
                  <div className={styles.logHeader}>
                    <span className={styles.logContext}>{log.context ?? 'unknown.context'}</span>
                    <span className={styles.logDate}>{formatDate(log.occurredAt ?? log.timestamp)}</span>
                  </div>
                  <div className={styles.logAction}>{log.message ?? log.error?.message ?? 'No message recorded.'}</div>
                  {log.error?.message && log.error.message !== log.message && (
                    <div className={styles.logReason}>{log.error.name ?? 'Error'}: {log.error.message}</div>
                  )}
                  {log.request?.path && (
                    <div className={styles.logRequest}>
                      {log.request.method ?? 'GET'} {log.request.path}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
