'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './Header.module.css';

export default function DesktopNav() {
  const { user, profile } = useAuth();
  
  const roleName = profile?.portalMode ?? 'guest';
  const isAdmin = roleName === 'admin';
  const isRegisteredUser = user && (roleName === 'candidate' || roleName === 'onboarding' || roleName === 'staff' || roleName === 'admin');
  
  const actionLink = isRegisteredUser ? '/onboarding' : '/apply';
  const actionLabel = isRegisteredUser ? 'Onboarding' : 'Apply';

  return (
    <nav className={styles.menuLinks}>
      <Link href="/" className={styles.menuItem}>Dashboard</Link>
      <Link href="/wiki" className={styles.menuItem}>Handbook Wiki</Link>
      <Link href={actionLink} className={styles.menuItem}>{actionLabel}</Link>
      {isAdmin && (
        <Link href="/admin/review" className={styles.menuItem}>Admin</Link>
      )}
    </nav>
  );
}
