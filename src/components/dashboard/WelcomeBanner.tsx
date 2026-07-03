'use client';

import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { ShieldCheck, ShieldAlert, LogOut, KeyRound } from 'lucide-react';
import styles from './WelcomeBanner.module.css';

export default function WelcomeBanner() {
  const { user, profile, openAuthModal, logout } = useAuth();

  if (user) {
    return (
      <div className={`${styles.banner} ${styles.successBanner}`}>
        <div className={styles.iconWrapper}>
          <ShieldCheck size={28} className={styles.successIcon} />
        </div>
        <div className={styles.content}>
          <h4>SECURE SESSION ACTIVE</h4>
          <p>
            Welcome, <span className={styles.emailText}>{user.email}</span>. Authorized as{' '}
            <span className={styles.roleBadge}>{profile?.portalMode ?? 'guest'}</span>.
          </p>
        </div>
        <div className={styles.actions}>
          <button onClick={logout} className={styles.logoutBtn} title="Sign Out">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.warningBanner}`}>
      <div className={styles.iconWrapper}>
        <ShieldAlert size={28} className={styles.warningIcon} />
      </div>
      <div className={styles.content}>
        <h4>GUEST TERMINAL ACCESS</h4>
        <p>You are viewing public information. Log in to access procedures, onboarding checklist, and admin panels.</p>
      </div>
      <div className={styles.actions}>
        <button onClick={openAuthModal} className={styles.loginBtn}>
          <KeyRound size={16} />
          <span>Authenticate Session</span>
        </button>
      </div>
    </div>
  );
}
