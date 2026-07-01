import React from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// Mock data until Firestore is connected
const categories = [
  { id: 'general', name: 'General Discussion', description: 'Everything camp related.', icon: '🏕️' },
  { id: 'training', name: 'Training Q&A', description: 'Questions about certifications, policies, and procedures.', icon: '📚' },
  { id: 'stories', name: 'Campfire Stories', description: 'Share your favorite memories and alumni tales.', icon: '🔥' },
  { id: 'trading-post', name: 'Trading Post', description: 'Ride-shares, lost and found, and gear exchange.', icon: '🎒' },
];

const recentTopics = [
  { 
    id: 'topic-1', 
    title: 'Who is driving up on Sunday?', 
    categoryId: 'trading-post',
    categoryName: 'Trading Post',
    author: 'John Doe',
    date: '2 hours ago',
    replies: 4
  },
  { 
    id: 'topic-2', 
    title: 'Need help with Hazardous Weather Training', 
    categoryId: 'training',
    categoryName: 'Training Q&A',
    author: 'Jane Smith',
    date: '5 hours ago',
    replies: 1
  },
  { 
    id: 'topic-3', 
    title: 'The Bear Incident of 2018', 
    categoryId: 'stories',
    categoryName: 'Campfire Stories',
    author: 'Old Timer Bob',
    date: '1 day ago',
    replies: 12
  }
];

export default function ForumPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Staff Forum</h1>
          <p className={styles.subtitle}>Public discussions, questions, and stories. (Zero-DMs Enforced)</p>
        </div>
        <Link href="/forum/new" className={styles.newTopicBtn}>
          <span>+</span> New Topic
        </Link>
      </header>

      <div className={styles.layout}>
        <section className={styles.categoriesSection}>
          <h2 className={styles.sectionTitle}>Categories</h2>
          <div className={styles.categoryList}>
            {categories.map(cat => (
              <Link href={`/forum/category/${cat.id}`} key={cat.id} className={styles.categoryCard}>
                <div className={styles.categoryIcon}>{cat.icon}</div>
                <div className={styles.categoryInfo}>
                  <h3>{cat.name}</h3>
                  <p>{cat.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.topicsSection}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          <div className={styles.topicList}>
            {recentTopics.map(topic => (
              <Link href={`/forum/topic/${topic.id}`} key={topic.id} className={styles.topicCard}>
                <div className={styles.topicHeader}>
                  <h3>{topic.title}</h3>
                  <div className={styles.replyCount}>
                    <span>💬</span> {topic.replies}
                  </div>
                </div>
                <div className={styles.topicMeta}>
                  <span className={styles.categoryBadge}>{topic.categoryName}</span>
                  <span className={styles.topicAuthor}>by {topic.author}</span>
                  <span className={styles.topicDate}>{topic.date}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
