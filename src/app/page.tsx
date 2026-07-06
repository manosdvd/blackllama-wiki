'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, FileText, MessageSquare, Phone, ArrowRight, Clock, ShieldCheck, Flame, Music
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import type { ContentItem } from '@/types/content';
import styles from './page.module.css';

export default function Home() {
  const { user, profile } = useAuth();
  const [articles, setArticles] = useState<ContentItem[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [randomArticle, setRandomArticle] = useState<ContentItem | null>(null);
  const [loadingRandom, setLoadingRandom] = useState(true);

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

  // Fetch a semi-random article from "Camp culture and training" or "Songbook"
  useEffect(() => {
    let active = true;
    async function fetchRandom() {
      setLoadingRandom(true);
      try {
        const res = await fetch('/api/wiki/articles?limit=150');
        if (res.ok) {
          const data = (await res.json()) as { articles?: ContentItem[] };
          if (active && data.articles) {
            const pool = data.articles.filter(
              (a) =>
                a.status === 'published' &&
                (a.categoryId === 'camp-staff-culture-training' || a.categoryId === 'songbook')
            );
            if (pool.length > 0) {
              const randomIndex = Math.floor(Math.random() * pool.length);
              setRandomArticle(pool[randomIndex]);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch random article:', err);
      } finally {
        if (active) setLoadingRandom(false);
      }
    }
    fetchRandom();
    return () => {
      active = false;
    };
  }, []);

  // Determine user role and corresponding description
  const roleName = profile?.portalMode ?? 'guest';

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.pageHeader}>
        <h2>OPERATIONS BOARD</h2>
        <p>Santa Catalina Ranger District • Mount Lemmon Ranger Station</p>
      </header>

      {/* Join the Staff Section */}
      <section className={styles.joinStaffCard}>
        <div className={styles.joinStaffContent}>
          <div className={styles.joinStaffTextSide}>
            <div className={styles.joinStaffHeader}>
              <Flame className={styles.joinStaffIcon} size={28} />
              <h3>JOIN THE STAFF</h3>
            </div>
            <p className={styles.joinStaffLead}>
              Since the first Scouts arrived in 1921, our purpose has remained consistent: to transform lives through the power of the outdoor experience. You are how we fulfill that promise to the youth of Catalina Council and beyond. As a staff member, your daily actions and personal conduct serve as the living embodiment of the Scouting brand. You are the role models who make a simple camping trip into a life-altering experience. Your role is so much more than teaching merit badges and singing silly songs - you are shaping the future.
            </p>
            <p className={styles.joinStaffBody}>
              Just as important is the impact this experience will have on you. Few experiences in life provide the leadership experience and personal development that being on camp staff provides. If you embrace what is asked of you this summer, you will leave a different person. I can’t say for certain who that person will be, but it will be more than you are now. That may sound like hyperbole now, but read this again in August and tell me I’m wrong.
            </p>
          </div>
          <div className={styles.joinStaffActionSide}>
            <h4>READY TO MAKE A DIFFERENCE?</h4>
            <p>Apply today or complete your onboarding files to secure your place in Camp Lawton&apos;s history.</p>
            {roleName === 'guest' && (
              <Link href="/apply" className={styles.joinStaffBtn}>
                <FileText size={18} />
                <span>Submit Application</span>
                <ArrowRight size={16} />
              </Link>
            )}
            {roleName === 'candidate' && (
              <Link href="/onboarding" className={styles.joinStaffBtn}>
                <FileText size={18} />
                <span>Continue Onboarding</span>
                <ArrowRight size={16} />
              </Link>
            )}
            {(roleName === 'onboarding' || roleName === 'staff') && (
              <Link href="/onboarding" className={styles.joinStaffBtn}>
                <FileText size={18} />
                <span>Access Onboarding Tasks</span>
                <ArrowRight size={16} />
              </Link>
            )}
            {roleName === 'admin' && (
              <Link href="/admin/review" className={styles.joinStaffBtn}>
                <ShieldCheck size={18} />
                <span>Review Dashboard</span>
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </section>

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
          {/* Featured Culture & Songbook Preview */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {randomArticle?.categoryId === 'songbook' ? (
                  <Music size={16} className={styles.highlightIcon} />
                ) : (
                  <BookOpen size={16} className={styles.highlightIcon} />
                )}
                <h3>FEATURED CULTURE & SONGS</h3>
              </div>
            </div>
            <div className={styles.cardBody}>
              {loadingRandom ? (
                <div className={styles.emptyState}>Loading featured content...</div>
              ) : randomArticle ? (
                <div className={styles.featuredPreview}>
                  <div className={styles.featuredBadgeRow}>
                    <span className={styles.articleCategory}>
                      {randomArticle.categoryId === 'songbook' ? 'Songbook' : 'Culture & Training'}
                    </span>
                  </div>
                  <h4 className={styles.featuredTitle}>{randomArticle.title}</h4>
                  <p className={styles.featuredSummary}>
                    {randomArticle.summary || 'Explore camp culture, traditions, and essential training information.'}
                  </p>
                  <Link
                    href={`/wiki/article/${randomArticle.slug || randomArticle.id}`}
                    className={styles.featuredReadBtn}
                  >
                    <span>{randomArticle.categoryId === 'songbook' ? 'Sing Song / View Lyrics' : 'Read Article'}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>No featured materials available.</p>
                </div>
              )}
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
