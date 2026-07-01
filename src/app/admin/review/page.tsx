import React from 'react';
import styles from './page.module.css';

export default function AdminReviewQueue() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Admin Review Queue</h1>
        <p>Review incoming staff applications and monitor onboarding compliance status.</p>
      </header>

      <div className={styles.dashboardGrid}>
        
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Pending Applications</h2>
            <span className={styles.countBadge}>3</span>
          </div>
          
          <div className={styles.queueList}>
            {/* Mock Application Card */}
            <div className={styles.queueItem}>
              <div className={styles.itemMeta}>
                <strong>Jane Doe</strong>
                <span>Role: Aquatics (Paid)</span>
                <span>Submitted: 2 hrs ago</span>
              </div>
              <div className={styles.itemActions}>
                <button className={styles.btnApprove}>Approve to Onboarding</button>
                <button className={styles.btnReject}>Reject</button>
              </div>
            </div>

            <div className={styles.queueItem}>
              <div className={styles.itemMeta}>
                <strong>John Smith</strong>
                <span>Role: Scoutcraft (Volunteer)</span>
                <span>Submitted: 1 day ago</span>
              </div>
              <div className={styles.itemActions}>
                <button className={styles.btnApprove}>Approve to Onboarding</button>
                <button className={styles.btnReject}>Reject</button>
              </div>
            </div>
            
            <div className={styles.queueItem}>
              <div className={styles.itemMeta}>
                <strong>Alex Ranger</strong>
                <span>Role: Maintenance (Paid)</span>
                <span>Submitted: 2 days ago</span>
              </div>
              <div className={styles.itemActions}>
                <button className={styles.btnApprove}>Approve to Onboarding</button>
                <button className={styles.btnReject}>Reject</button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Onboarding Compliance Monitoring</h2>
            <span className={styles.countBadge}>12 Active</span>
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
              <tr>
                <td>Sarah Miller</td>
                <td>Trading Post (Paid)</td>
                <td><span className={styles.statusCheck}>Verified</span></td>
                <td><span className={styles.statusCheck}>Verified</span></td>
                <td><span className={styles.statusPending}>Pending HR</span></td>
                <td><span className={styles.statusBadgeWarning}>Incomplete</span></td>
              </tr>
              <tr>
                <td>David Lee</td>
                <td>Nature (Volunteer)</td>
                <td><span className={styles.statusCheck}>Verified</span></td>
                <td><span className={styles.statusCheck}>Verified</span></td>
                <td><span className={styles.statusNA}>N/A</span></td>
                <td><span className={styles.statusBadgeGood}>Cleared</span></td>
              </tr>
              <tr>
                <td>Emily Chen</td>
                <td>Kitchen (Paid)</td>
                <td><span className={styles.statusMissing}>Missing</span></td>
                <td><span className={styles.statusCheck}>Verified</span></td>
                <td><span className={styles.statusMissing}>Missing</span></td>
                <td><span className={styles.statusBadgeDanger}>Blocked</span></td>
              </tr>
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
