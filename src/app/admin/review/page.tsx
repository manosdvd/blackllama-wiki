'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import type { ApplicationDecisionPayload, StaffApplication } from '@/types/applications';
import styles from './page.module.css';

export default function AdminReviewQueue() {
  const { user, loading, hasPermission } = useAuth();
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReview = hasPermission('canReviewApplications');

  const loadApplications = useCallback(async () => {
    if (!user || !canReview) {
      setLoadingApplications(false);
      return;
    }

    setLoadingApplications(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/applications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as { applications?: StaffApplication[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load applications.');
      setApplications(data.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingApplications(false);
    }
  }, [canReview, user]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadApplications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadApplications, loading]);

  const decide = async (applicationId: string, decision: ApplicationDecisionPayload['decision']) => {
    if (!user) return;
    setMessage(null);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/applications/${applicationId}/decision`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to update application.');
      setMessage(`Application ${decision.replace('_', ' ')}.`);
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pendingApplications = useMemo(
    () => applications.filter((application) => ['submitted', 'under_review', 'needs_info'].includes(application.status)),
    [applications],
  );
  const approvedApplications = useMemo(
    () => applications.filter((application) => application.status === 'approved'),
    [applications],
  );

  if (loading) {
    return <div className={styles.container}>Loading admin access...</div>;
  }

  if (!user || !canReview) {
    return (
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <h1>Admin Review Queue</h1>
          <p>Application review access is required. Sign in with an admin account from the header.</p>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Admin Review Queue</h1>
        <p>Review incoming staff applications and monitor onboarding compliance status.</p>
      </header>

      {message && <div className={styles.successMessage}>{message}</div>}
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.dashboardGrid}>
        
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Pending Applications</h2>
            <span className={styles.countBadge}>{pendingApplications.length}</span>
          </div>
          
          <div className={styles.queueList}>
            {loadingApplications && <p>Loading applications...</p>}
            {!loadingApplications && pendingApplications.length === 0 && <p>No pending applications.</p>}
            {pendingApplications.map((application) => (
              <div className={styles.queueItem} key={application.id}>
                <div className={styles.itemMeta}>
                  <strong>{application.applicantName}</strong>
                  <span>Role: {application.areaOfInterest} ({application.roleType})</span>
                  <span>Email: {application.email}</span>
                  <span>Status: {application.status}</span>
                  {application.isMinor && <span className={styles.statusPending}>Parent/guardian workflow required</span>}
                </div>
                <div className={styles.itemActions}>
                  <button className={styles.btnApprove} onClick={() => decide(application.id, 'approved')}>Approve to Onboarding</button>
                  <button className={styles.btnSecondary} onClick={() => decide(application.id, 'needs_info')}>Needs Info</button>
                  <button className={styles.btnReject} onClick={() => decide(application.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Onboarding Compliance Monitoring</h2>
            <span className={styles.countBadge}>{approvedApplications.length} Active</span>
          </div>
          
          <table className={styles.statusTable}>
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Role</th>
                <th>Med Forms (A/B/C)</th>
                <th>YPT / Weather</th>
                <th>I-9 / W-4</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {approvedApplications.length === 0 && (
                <tr>
                  <td colSpan={6}>No approved applications yet.</td>
                </tr>
              )}
              {approvedApplications.map((application) => (
                <tr key={application.id}>
                  <td>{application.applicantName}</td>
                  <td>{application.areaOfInterest} ({application.roleType})</td>
                  <td><span className={styles.statusPending}>Awaiting verification</span></td>
                  <td><span className={styles.statusPending}>Awaiting verification</span></td>
                  <td><span className={application.roleType === 'paid' ? styles.statusPending : styles.statusNA}>{application.roleType === 'paid' ? 'Pending HR' : 'N/A'}</span></td>
                  <td><span className={styles.statusBadgeWarning}>Onboarding</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.disclaimer}>
            Note: Sensitive PII (I-9, Medical) is NOT stored in this portal. 
            This table only tracks verification status manually updated by admins 
            after checking the official Catalina Council secure portals.
          </p>
        </section>

      </div>
    </div>
  );
}
