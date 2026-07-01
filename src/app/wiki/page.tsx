import React from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { BookOpen, ShieldAlert, Utensils, Tent, FileText, Plus } from 'lucide-react';

export default function WikiIndexPage() {
  const categories = [
    { id: 'programs', title: 'Programs & Activities', icon: <Tent className={styles.catIcon} />, count: 12 },
    { id: 'facilities', title: 'Facilities & Maintenance', icon: <BookOpen className={styles.catIcon} />, count: 8 },
    { id: 'emergency', title: 'Emergency Procedures', icon: <ShieldAlert className={styles.catIcon} />, count: 5 },
    { id: 'kitchen', title: 'Kitchen & Dining', icon: <Utensils className={styles.catIcon} />, count: 14 },
  ];

  const recentArticles = [
    { id: '1', title: 'Opening Campfire Script', category: 'programs', author: 'Program Director', date: '2026-06-30' },
    { id: '2', title: 'Dining Hall Protocol', category: 'kitchen', author: 'Head Chef', date: '2026-06-28' },
    { id: '3', title: 'Lost Scout Procedure', category: 'emergency', author: 'Camp Director', date: '2026-06-25' },
    { id: '4', title: 'Water Valve Locations', category: 'facilities', author: 'Ranger', date: '2026-06-20' },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Camp Lawton Wiki</h1>
          <p className={styles.subtitle}>The central repository for all staff knowledge and procedures.</p>
        </div>
        <Link href="/wiki/edit" className={styles.newBtn}>
          <Plus size={20} />
          New Article
        </Link>
      </header>

      <div className={styles.layout}>
        <section className={styles.categoriesSection}>
          <h2 className={styles.sectionTitle}>Categories</h2>
          <div className={styles.categoryGrid}>
            {categories.map(cat => (
              <Link href={`/wiki/category/${cat.id}`} key={cat.id} className={styles.categoryCard}>
                <div className={styles.catIconWrapper}>{cat.icon}</div>
                <div className={styles.catInfo}>
                  <h3>{cat.title}</h3>
                  <span className={styles.catCount}>{cat.count} articles</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.recentSection}>
          <h2 className={styles.sectionTitle}>Recently Updated</h2>
          <div className={styles.recentList}>
            {recentArticles.map(article => (
              <Link href={`/wiki/article/${article.id}`} key={article.id} className={styles.articleCard}>
                <div className={styles.articleIcon}>
                  <FileText size={24} />
                </div>
                <div className={styles.articleMeta}>
                  <h3>{article.title}</h3>
                  <div className={styles.articleDetails}>
                    <span className={styles.articleBadge}>{article.category}</span>
                    <span className={styles.articleAuthor}>By {article.author}</span>
                    <span className={styles.articleDate}>{article.date}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
