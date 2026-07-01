import React from 'react';
import Link from 'next/link';
import { Menu, Tent } from 'lucide-react';
import AlertsHUD from './AlertsHUD';
import Ticker from './Ticker';
import DyslexiaToggle from './DyslexiaToggle';
import AuthButton from './AuthButton';
import { getOfflineTickerItems } from '@/lib/tickerUtils';
import styles from './Header.module.css';

export default async function Header() {
  const tickerItems = await getOfflineTickerItems();

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
          <DyslexiaToggle />
          <AuthButton />
          <button className={`${styles.iconBtn} ${styles.mobileMenuBtn}`} aria-label="Menu">
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* Alerts HUD below the main nav */}
      <AlertsHUD />
      
      {/* Ticker at the bottom of the header */}
      <Ticker items={tickerItems} />
    </header>
  );
}
