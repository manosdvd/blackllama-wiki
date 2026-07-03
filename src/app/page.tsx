import React from 'react';
import Link from 'next/link';
import { BookOpen, FileText, MessageSquare } from 'lucide-react';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.pageHeader}>
        <h2>COMMAND DASHBOARD</h2>
        <p>Santa Catalina Ranger District • Elev: 7554.0ft</p>
      </header>

      <WelcomeBanner />

      <div className={styles.grid}>
        {/* Quick Actions Card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>QUICK ACTIONS</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.actionList}>
              <Link href="/apply" className={styles.actionBtn}>
                <FileText size={20} />
                <span>Submit Staff Application</span>
              </Link>
              <Link href="/wiki" className={styles.actionBtn}>
                <BookOpen size={20} />
                <span>Browse Wiki</span>
              </Link>
              <Link href="/forum" className={styles.actionBtn}>
                <MessageSquare size={20} />
                <span>Latest Communications</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Current Status Card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>CURRENT STATUS</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>FIRE RISK</span>
              <span className={`${styles.statusBadge} ${styles.danger}`}>EXTREME</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>WEATHER</span>
              <span className={styles.statusValue}>85°F / High Winds</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>CAMP STATUS</span>
              <span className={`${styles.statusBadge} ${styles.warning}`}>PRE-SEASON PREP</span>
            </div>
          </div>
        </section>

        {/* Placeholder for Recent Activity */}
        <section className={`${styles.card} ${styles.spanTwo}`}>
          <div className={styles.cardHeader}>
            <h3>RECENT COMMS</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.emptyState}>
              <MessageSquare size={32} />
              <p>No recent communications. Secure channel is clear.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
