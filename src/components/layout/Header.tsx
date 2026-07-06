import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AlertsHUD from './AlertsHUD';
import Ticker from './Ticker';
import ThemeToggle from './ThemeToggle';
import AuthButton from './AuthButton';
import MobileMenu from './MobileMenu';
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
            <Image
              src="/CLlogo.png"
              alt="Camp Lawton"
              width={48}
              height={48}
              className={styles.logoImage}
              priority
            />
            <div className={styles.logoText}>
              <h1>CAMP LAWTON</h1>
              <span>Staff Hill Online</span>
            </div>
          </Link>
        </div>

        <div className={styles.actions}>
          <ThemeToggle />
          <AuthButton />
          <MobileMenu />
        </div>
      </div>

      {/* Alerts HUD below the main nav */}
      <AlertsHUD />
      
      {/* Ticker at the bottom of the header */}
      <Ticker items={tickerItems} />

      {/* Distinct Main Menu Bar below the ticker */}
      <div className={styles.menuBar}>
        <div className={styles.menuContainer}>
          <nav className={styles.menuLinks}>
            <Link href="/" className={styles.menuItem}>Dashboard</Link>
            <Link href="/wiki" className={styles.menuItem}>Wiki & Procedures</Link>
            <Link href="/apply" className={styles.menuItem}>Apply</Link>
            <Link href="/onboarding" className={styles.menuItem}>Onboarding</Link>
            <Link href="/admin/review" className={styles.menuItem}>Admin</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
