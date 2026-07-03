'use client';

import React from 'react';
import { User, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './Header.module.css';

export default function AuthButton() {
  const { user, profile, loading, openAuthModal, logout } = useAuth();

  if (loading) {
    return (
      <button className={styles.iconBtn} aria-label="Loading auth">
        <User size={20} className="opacity-50" />
      </button>
    );
  }

  if (user) {
    return (
      <div className={styles.authCluster}>
        <span className={styles.authMode}>{profile?.portalMode ?? 'guest'}</span>
        <button
          className={styles.iconBtn}
          onClick={logout}
          title={`Sign out (${user.email})`}
          aria-label="Sign Out"
        >
          <LogOut size={20} />
        </button>
      </div>
    );
  }

  return (
    <button 
      className={styles.iconBtn} 
      onClick={openAuthModal} 
      title="Sign In"
      aria-label="Sign In"
    >
      <LogIn size={20} />
    </button>
  );
}
