import React from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// Mock data until Firestore is connected
const mockTopic = {
  id: 'topic-1',
  title: 'Who is driving up on Sunday?',
  categoryName: 'Trading Post',
  isLocked: false,
};

const mockPosts = [
  {
    id: 'post-1',
    authorName: 'John Doe',
    authorRole: 'Staff',
    content: 'I live near the university and have space for two more in my truck. Let me know if you need a ride up this Sunday!',
    date: '2 hours ago',
    isOp: true,
    isRemoved: false,
  },
  {
    id: 'post-2',
    authorName: 'Jane Smith',
    authorRole: 'Staff',
    content: 'I would love a ride! I have one duffel bag.',
    date: '1 hour ago',
    isOp: false,
    isRemoved: false,
  },
  {
    id: 'post-3',
    authorName: 'Rule Breaker',
    authorRole: 'Staff',
    content: '[This post was removed by a moderator for violating community guidelines.]',
    date: '30 mins ago',
    isOp: false,
    isRemoved: true,
  }
];

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  // Wait for params in Next.js 16
  const { id } = await params;
  
  return (
    <div className={styles.container} data-topic-id={id}>
      <Link href="/forum" className={styles.backLink}>
        <span>←</span> Back to Forum
      </Link>

      <header className={styles.header}>
        <h1>{mockTopic.title}</h1>
        <div className={styles.meta}>
          <span className={styles.categoryBadge}>{mockTopic.categoryName}</span>
          {mockTopic.isLocked && (
            <span className={styles.statusLocked}>🔒 Locked</span>
          )}
        </div>
      </header>

      <div className={styles.postList}>
        {mockPosts.map(post => (
          <div key={post.id} className={`${styles.postCard} ${post.isOp ? styles.opPost : ''}`}>
            <div className={styles.postHeader}>
              <div className={styles.authorInfo}>
                <span className={styles.authorName}>{post.authorName}</span>
                <span className={styles.authorRole}>{post.authorRole}</span>
              </div>
              <div className={styles.postActions}>
                <span className={styles.postDate}>{post.date}</span>
                {!post.isRemoved && (
                  <button className={styles.flagBtn} title="Flag this post for moderator review">
                    🚩 Flag
                  </button>
                )}
              </div>
            </div>
            {post.isRemoved ? (
              <div className={styles.removedPost}>
                ⚠️ {post.content}
              </div>
            ) : (
              <div className={styles.postContent}>
                {post.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {mockTopic.isLocked ? (
        <div className={styles.lockedMessage}>
          🔒 This topic has been locked by a moderator. You can no longer reply.
        </div>
      ) : (
        <div className={styles.replySection}>
          <h3>Post a Reply</h3>
          <textarea 
            className={styles.textarea} 
            placeholder="Write your reply here... (Remember, this is a public forum and DMs are not allowed. Keep it Scout appropriate!)"
          ></textarea>
          <button className={styles.submitBtn}>Submit Reply</button>
        </div>
      )}
    </div>
  );
}
