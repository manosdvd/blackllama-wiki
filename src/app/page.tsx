'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, FileText, MessageSquare, Radio, Phone, Wifi, Database,
  ArrowRight, Clock, ShieldCheck
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import type { ContentItem } from '@/types/content';
import styles from './page.module.css';

export default function Home() {
  const { user, profile } = useAuth();
  const [articles, setArticles] = useState<ContentItem[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  // Track online/offline status dynamically for PWA
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const goOnline = () => setIsOnline(true);
      const goOffline = () => setIsOnline(false);
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      return () => {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    }
  }, []);

  // Fetch recent wiki articles matching user visibility level
  useEffect(() => {
    let active = true;
    async function fetchRecent() {
      setLoadingArticles(true);
      try {
        const token = await user?.getIdToken();
        const res = await fetch('/api/wiki/articles?limit=4', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = (await res.json()) as { articles?: ContentItem[] };
          if (active && data.articles) {
            setArticles(data.articles);
          }
        }
      } catch (err) {
        console.error('Failed to fetch recent articles:', err);
      } finally {
        if (active) setLoadingArticles(false);
      }
    }
    fetchRecent();
    return () => {
      active = false;
    };
  }, [user]);

  // Determine user role and corresponding description
  const roleName = profile?.portalMode ?? 'guest';

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.pageHeader}>
        <h2>OPERATIONS BOARD</h2>
        <p>Santa Catalina Ranger District • Mount Lemmon Ranger Station</p>
      </header>

      <div className={styles.grid}>
        {/* Main Column */}
        <div className={styles.mainColumn}>
          {/* Quick Tasks & Contextual Actions */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>CONTEXT ACTIONS</h3>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.actionGrid}>
                {roleName === 'guest' && (
                  <>
                    <Link href="/apply" className={`${styles.contextActionBtn} ${styles.primary}`}>
                      <FileText size={18} />
                      <div className={styles.btnText}>
                        <strong>Submit Application</strong>
                        <span>Join our summer staff program</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                    <Link href="/wiki" className={styles.contextActionBtn}>
                      <BookOpen size={18} />
                      <div className={styles.btnText}>
                        <strong>Browse Public Wiki</strong>
                        <span>Search rules and information</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                  </>
                )}

                {roleName === 'candidate' && (
                  <>
                    <Link href="/onboarding" className={`${styles.contextActionBtn} ${styles.primary}`}>
                      <FileText size={18} />
                      <div className={styles.btnText}>
                        <strong>Onboarding Profile</strong>
                        <span>Track application status</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                    <Link href="/wiki" className={styles.contextActionBtn}>
                      <BookOpen size={18} />
                      <div className={styles.btnText}>
                        <strong>Candidate Handbooks</strong>
                        <span>Read preparatory manuals</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                  </>
                )}

                {(roleName === 'onboarding' || roleName === 'staff') && (
                  <>
                    <Link href="/onboarding" className={`${styles.contextActionBtn} ${styles.primary}`}>
                      <FileText size={18} />
                      <div className={styles.btnText}>
                        <strong>Staff Onboarding</strong>
                        <span>Complete required onboarding tasks</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                    <Link href="/wiki" className={styles.contextActionBtn}>
                      <BookOpen size={18} />
                      <div className={styles.btnText}>
                        <strong>Operations Wiki</strong>
                        <span>Search SOPs and safety guides</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                  </>
                )}

                {roleName === 'admin' && (
                  <>
                    <Link href="/admin/review" className={`${styles.contextActionBtn} ${styles.primary}`}>
                      <ShieldCheck size={18} />
                      <div className={styles.btnText}>
                        <strong>Review Dashboard</strong>
                        <span>Approve staff registrations</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                    <Link href="/wiki" className={styles.contextActionBtn}>
                      <BookOpen size={18} />
                      <div className={styles.btnText}>
                        <strong>Manage Wiki Contents</strong>
                        <span>Create and edit articles</span>
                      </div>
                      <ArrowRight size={16} className={styles.arrowIcon} />
                    </Link>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Dynamic Recent Updates Feed */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>RECENT OPERATIONS UPDATES</h3>
            </div>
            <div className={styles.cardBody}>
              {loadingArticles ? (
                <div className={styles.emptyState}>Loading updates...</div>
              ) : articles.length > 0 ? (
                <div className={styles.articleList}>
                  {articles.map((article) => {
                    const date = article.updatedAt
                      ? typeof article.updatedAt === 'object' && 'seconds' in article.updatedAt
                        ? new Date(Number(article.updatedAt.seconds) * 1000).toLocaleDateString()
                        : new Date(String(article.updatedAt)).toLocaleDateString()
                      : 'Recently';
                    return (
                      <Link
                        key={article.id}
                        href={`/wiki/article/${article.slug || article.id}`}
                        className={styles.articleItem}
                      >
                        <div className={styles.articleLeft}>
                          <h4>{article.title}</h4>
                          <p>{article.summary}</p>
                        </div>
                        <div className={styles.articleRight}>
                          <span className={styles.articleCategory}>{article.categoryId}</span>
                          <span className={styles.articleDate}>
                            <Clock size={12} /> {date}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <MessageSquare size={24} />
                  <p>No recent communications are currently published.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar Column */}
        <div className={styles.sideColumn}>
          {/* Operational Status */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>OPERATIONS STATUS</h3>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.statusList}>
                <div className={styles.statusRow}>
                  <div className={styles.statusRowLabel}>
                    <Wifi size={16} />
                    <span>NETWORK MODE</span>
                  </div>
                  <span className={`${styles.statusPill} ${isOnline ? styles.online : styles.offline}`}>
                    {isOnline ? 'ONLINE' : 'LOCAL CACHED'}
                  </span>
                </div>

                <div className={styles.statusRow}>
                  <div className={styles.statusRowLabel}>
                    <Radio size={16} />
                    <span>RADIO STANDBY</span>
                  </div>
                  <span className={`${styles.statusPill} ${styles.warning}`}>CH 1 MAIN</span>
                </div>

                <div className={styles.statusRow}>
                  <div className={styles.statusRowLabel}>
                    <Database size={16} />
                    <span>LOCAL OFFLINE STORAGE</span>
                  </div>
                  <span className={`${styles.statusPill} ${styles.online}`}>ENABLED</span>
                </div>

                <div className={styles.statusRow}>
                  <div className={styles.statusRowLabel}>
                    <Clock size={16} />
                    <span>CAMP SEASON</span>
                  </div>
                  <span className={styles.statusText}>PRE-SEASON PREP</span>
                </div>
              </div>
            </div>
          </section>

          {/* Emergency Directory */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>EMERGENCY CONTACTS</h3>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.directoryList}>
                <div className={styles.directoryItem}>
                  <div className={styles.directoryHeader}>
                    <Phone size={14} />
                    <strong>Sheriff / Medical Dispatch</strong>
                  </div>
                  <span className={styles.directoryValue}>911 / Radio CH 4</span>
                </div>

                <div className={styles.directoryItem}>
                  <div className={styles.directoryHeader}>
                    <Phone size={14} />
                    <strong>Mount Lemmon Ranger Office</strong>
                  </div>
                  <span className={styles.directoryValue}>520-555-0199</span>
                </div>

                <div className={styles.directoryItem}>
                  <div className={styles.directoryHeader}>
                    <Phone size={14} />
                    <strong>Camp Health Officer</strong>
                  </div>
                  <span className={styles.directoryValue}>Extension 104</span>
                </div>

                <div className={styles.directoryItem}>
                  <div className={styles.directoryHeader}>
                    <Phone size={14} />
                    <strong>Ranger District Fire Line</strong>
                  </div>
                  <span className={styles.directoryValue}>520-555-0150</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
