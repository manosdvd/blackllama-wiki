import React from 'react';
import Link from 'next/link';
import { Menu, User, Tent } from 'lucide-react';
import AlertsHUD from './AlertsHUD';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.headerContainer}>
      {/* Top Banner / Navigation */}
      <div className={styles.navBar}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logoLink}>
            <Tent className={styles.logoIcon} />
            <div className={styles.logoText}>
              <h1>CAMP LAWTON</h1>
              <span>STAFF COMMAND</span>
            </div>
          </Link>
        </div>

        <nav className={styles.navLinks}>
          <Link href="/dashboard" className={styles.navItem}>Dashboard</Link>
          <Link href="/wiki" className={styles.navItem}>Wiki & Procedures</Link>
          <Link href="/forum" className={styles.navItem}>Forum</Link>
        </nav>

        <div className={styles.actions}>
          <button className={styles.iconBtn} aria-label="Profile">
            <User size={20} />
          </button>
          <button className={`${styles.iconBtn} ${styles.mobileMenuBtn}`} aria-label="Menu">
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* Alerts HUD below the main nav */}
      <AlertsHUD />
    </header>
  );
}
