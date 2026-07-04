'use client';

import React from 'react';
import { LogIn, LogOut, User, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './Header.module.css';

export default function AuthButton() {
  const { user, profile, loading, openAuthModal, logout } = useAuth();

  if (loading) {
    return (
      <button className={styles.iconBtn} aria-label="Loading auth">
        <User size={20} style={{ opacity: 0.5 }} />
      </button>
    );
  }

  if (user) {
    const displayName = profile?.preferredName || profile?.displayName || user.email || 'Ranger';
    const roleName = profile?.portalMode ?? 'guest';
    return (
      <div className={styles.authCluster}>
        <span className={styles.userIdent}>{displayName}</span>
        <span className={styles.userRole}>{roleName}</span>
        <button
          className={styles.iconBtn}
          onClick={logout}
          title={`Sign out (${user.email})`}
          aria-label="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.authCluster} style={{ gap: '0.75rem' }}>
      <div className={styles.notLoggedInBadge} title="Access restricted. Please authenticate.">
        <ShieldAlert size={12} style={{ marginRight: '0.25rem', display: 'inline', verticalAlign: 'text-bottom' }} />
        <span>NOT LOGGED IN</span>
      </div>
      <button 
        className={styles.loginTextBtn} 
        onClick={openAuthModal} 
        title="Authenticate Session"
        aria-label="Authenticate Session"
      >
        <LogIn size={14} />
        <span>LOGIN / SIGN UP</span>
      </button>
    </div>
  );
}
