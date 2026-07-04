'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import type { ApplicationDecisionPayload, StaffApplication } from '@/types/applications';
import styles from './page.module.css';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export default function AdminReviewQueue() {
  const { user, loading, hasPermission, profile } = useAuth();
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);

  const runDiagnostics = async () => {
    setDiagLogs(['Starting diagnostics...']);
    if (!user) {
      setDiagLogs(prev => [...prev, 'Error: No user logged in.']);
      return;
    }
    try {
      setDiagLogs(prev => [...prev, 'Fetching Firebase ID token...']);
      const token = await user.getIdToken(true);
      setDiagLogs(prev => [...prev, `Token fetched successfully (length: ${token.length})`]);

      setDiagLogs(prev => [...prev, 'Checking ID token claims...']);
      const tokenResult = await user.getIdTokenResult();
      setDiagLogs(prev => [...prev, `Claims: ${JSON.stringify(tokenResult.claims)}`]);

      setDiagLogs(prev => [...prev, 'POSTing to /api/auth/session...']);
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      setDiagLogs(prev => [...prev, `POST /api/auth/session response status: ${response.status}`]);
      if (response.ok) {
        const data = await response.json();
        setDiagLogs(prev => [...prev, `POST response data: ${JSON.stringify(data)}`]);
      } else {
        const text = await response.text();
        setDiagLogs(prev => [...prev, `POST response error: ${text}`]);
      }

      setDiagLogs(prev => [...prev, 'Fetching profile from Firestore using getDocFromServer...']);
      try {
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDocFromServer(docRef);
        setDiagLogs(prev => [...prev, `Firestore getDocFromServer snapshot exists: ${snap.exists()}`]);
        if (snap.exists()) {
          setDiagLogs(prev => [...prev, `Firestore profile data: ${JSON.stringify(snap.data())}`]);
        }
      } catch (err: any) {
        setDiagLogs(prev => [...prev, `Firestore getDocFromServer error: ${err.message || String(err)}`]);
      }

      setDiagLogs(prev => [...prev, 'Fetching profile from Firestore using getDoc...']);
      try {
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDoc(docRef);
        setDiagLogs(prev => [...prev, `Firestore getDoc snapshot exists: ${snap.exists()}`]);
        if (snap.exists()) {
          setDiagLogs(prev => [...prev, `Firestore profile data: ${JSON.stringify(snap.data())}`]);
        }
      } catch (err: any) {
        setDiagLogs(prev => [...prev, `Firestore getDoc error: ${err.message || String(err)}`]);
      }
    } catch (err: any) {
      setDiagLogs(prev => [...prev, `Diagnostics critical error: ${err.message || String(err)}`]);
    }
  };

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
          <div style={{ marginTop: '20px', padding: '15px', background: '#1e1b18', border: '1px solid #dc2626', borderRadius: '4px', fontSize: '0.85rem' }}>
            <h4 style={{ color: '#f87171', margin: '0 0 10px 0' }}>DEBUG ACCESS CONTROLS:</h4>
            <p style={{ margin: '0 0 5px 0' }}><strong>User UID:</strong> {user ? user.uid : 'NULL (Not logged in)'}</p>
            <p style={{ margin: '0 0 5px 0' }}><strong>User Email:</strong> {user ? user.email : 'NULL'}</p>
            <p style={{ margin: '0 0 5px 0' }}><strong>Profile Loaded:</strong> {profile ? 'YES' : 'NO'}</p>
            {profile && (
              <>
                <p style={{ margin: '0 0 5px 0' }}><strong>Profile.isAdmin:</strong> {profile.isAdmin ? 'TRUE' : 'FALSE'}</p>
                <p style={{ margin: '0 0 5px 0' }}><strong>Profile.adminPreset:</strong> {profile.adminPreset || 'NULL'}</p>
                <p style={{ margin: '0 0 5px 0' }}><strong>Profile.accountStatus:</strong> {profile.accountStatus || 'NULL'}</p>
                <p style={{ margin: '0 0 5px 0' }}><strong>Profile.portalMode:</strong> {profile.portalMode || 'NULL'}</p>
                <p style={{ margin: '0 0 0 0' }}><strong>Permissions list:</strong> {JSON.stringify(profile.adminPermissions)}</p>
              </>
            )}
            <button 
              onClick={runDiagnostics}
              style={{
                marginTop: '15px',
                padding: '8px 16px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}
            >
              Run Access Diagnostics
            </button>
            {diagLogs.length > 0 && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#0e0b09', border: '1px solid #443', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                <h5 style={{ margin: '0 0 5px 0', color: '#fb923c' }}>Diagnostic Logs:</h5>
                {diagLogs.map((log, idx) => (
                  <p key={idx} style={{ margin: '0 0 3px 0', fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{log}</p>
                ))}
              </div>
            )}
          </div>
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
