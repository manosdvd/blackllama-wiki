import React from 'react';
import styles from './page.module.css';
import TickerSyncButton from '@/components/admin/TickerSyncButton';

// Mock data until Firestore is connected
const mockFlaggedPosts = [
  {
    id: 'post-3',
    topicId: 'topic-1',
    topicTitle: 'Who is driving up on Sunday?',
    authorName: 'Rule Breaker',
    content: 'This is an inappropriate post that goes against Scouting guidelines.',
    date: '30 mins ago',
    flagCount: 3,
  }
];

const mockAuditLog = [
  {
    id: 'log-1',
    moderatorName: 'Admin Sarah',
    action: 'REMOVED_POST',
    targetId: 'post-99',
    reason: 'Violated YPT guidelines regarding appropriate language.',
    date: '1 day ago'
  },
  {
    id: 'log-2',
    moderatorName: 'Admin Mike',
    action: 'LOCKED_TOPIC',
    targetId: 'topic-42',
    reason: 'Discussion devolved into off-topic arguments.',
    date: '3 days ago'
  }
];

export default function ModerationPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Moderation Dashboard</h1>
        <p className={styles.subtitle}>Review flagged content and enforce Zero-DM / YPT compliance.</p>
      </header>

      <div className={styles.layout}>
        <section>
          <TickerSyncButton />
          
          <h2 className={styles.sectionTitle}>Flagged Queue</h2>
          <div className={styles.flaggedList}>
            {mockFlaggedPosts.length === 0 ? (
              <p>No posts currently flagged for review.</p>
            ) : (
              mockFlaggedPosts.map(post => (
                <div key={post.id} className={styles.flaggedCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.postMeta}>
                      Posted by <strong>{post.authorName}</strong> in <strong>{post.topicTitle}</strong><br/>
                      {post.date}
                    </div>
                    <div className={styles.flagCount}>
                      🚩 {post.flagCount} Flags
                    </div>
                  </div>
                  
                  <div className={styles.postContent}>
                    {post.content}
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.btnRemove}>Remove Post</button>
                    <button className={styles.btnApprove}>Ignore (Approve)</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Audit Log</h2>
          <div className={styles.logList}>
            {mockAuditLog.map(log => (
              <div key={log.id} className={styles.logEntry}>
                <div className={styles.logHeader}>
                  <span className={styles.logModerator}>{log.moderatorName}</span>
                  <span className={styles.logDate}>{log.date}</span>
                </div>
                <div className={styles.logAction}>
                  <strong>Action:</strong> {log.action}
                </div>
                <div className={styles.logReason}>
                  &quot;{log.reason}&quot;
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
