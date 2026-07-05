'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './BottomNav.module.css';

export default function BottomNav() {
  const pathname = usePathname();
  const { user, profile } = useAuth();

  const roleName = profile?.portalMode ?? 'guest';
  const isAdmin = roleName === 'admin';

  // Determine Onboarding / Apply destination
  const isRegisteredUser = user && (roleName === 'candidate' || roleName === 'onboarding' || roleName === 'staff' || roleName === 'admin');
  const actionLink = isRegisteredUser ? '/onboarding' : '/apply';
  const actionLabel = isRegisteredUser ? 'Onboarding' : 'Apply';

  // Active status helper
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <nav className={styles.bottomNav} aria-label="Mobile Navigation Bar">
      {/* 1. Dashboard Tab */}
      <Link 
        href="/" 
        className={`${styles.navItem} ${isActive('/') ? styles.active : ''}`}
        aria-current={isActive('/') ? 'page' : undefined}
      >
        <Home size={20} />
        <span>Dashboard</span>
      </Link>

      {/* 2. Wiki Tab */}
      <Link 
        href="/wiki" 
        className={`${styles.navItem} ${isActive('/wiki') ? styles.active : ''}`}
        aria-current={isActive('/wiki') ? 'page' : undefined}
      >
        <BookOpen size={20} />
        <span>Wiki</span>
      </Link>

      {/* 3. Apply / Onboarding Tab */}
      <Link 
        href={actionLink} 
        className={`${styles.navItem} ${isActive(actionLink) ? styles.active : ''}`}
        aria-current={isActive(actionLink) ? 'page' : undefined}
      >
        <FileText size={20} />
        <span>{actionLabel}</span>
      </Link>

      {/* 4. Admin Tab (Only visible to admin role) */}
      {isAdmin && (
        <Link 
          href="/admin/review" 
          className={`${styles.navItem} ${isActive('/admin') ? styles.active : ''}`}
          aria-current={isActive('/admin') ? 'page' : undefined}
        >
          <ShieldCheck size={20} />
          <span>Admin</span>
        </Link>
      )}
    </nav>
  );
}
