import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AlertsHUD from './AlertsHUD';
import BearAlertHUD from './BearAlertHUD';
import Ticker from './Ticker';
import ThemeToggle from './ThemeToggle';
import AccessibilitySettings from './AccessibilitySettings';
import AuthButton from './AuthButton';
import MobileMenu from './MobileMenu';
import DesktopNav from './DesktopNav';
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
          <AccessibilitySettings />
          <ThemeToggle />
          <AuthButton />
          <MobileMenu />
        </div>
      </div>

      {/* Distance-triggered bear alerts take priority above the standard HUD. */}
      <BearAlertHUD />

      {/* Fire, weather, smoke, and forest alerts HUD */}
      <AlertsHUD />
      
      {/* Ticker at the bottom of the header */}
      <Ticker items={tickerItems} />

      {/* Distinct Main Menu Bar below the ticker */}
      <div className={styles.menuBar}>
        <div className={styles.menuContainer}>
          <DesktopNav />
        </div>
      </div>
    </header>
  );
}
