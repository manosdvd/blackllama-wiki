'use client';

import React from 'react';
import { User, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './Header.module.css';

export default function AuthButton() {
  const { user, loading, login, logout, isAdmin, isModerator } = useAuth();

  if (loading) {
    return (
      <button className={styles.iconBtn} aria-label="Loading auth">
        <User size={20} className="opacity-50" />
      </button>
    );
  }

  if (user) {
    return (
      <button 
        className={styles.iconBtn} 
        onClick={logout} 
        title={`Sign out (${user.email})`}
        aria-label="Sign Out"
      >
        <LogOut size={20} />
      </button>
    );
  }

  return (
    <button 
      className={styles.iconBtn} 
      onClick={login} 
      title="Sign In"
      aria-label="Sign In"
    >
      <LogIn size={20} />
    </button>
  );
}
