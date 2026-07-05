'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './Header.module.css';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const isInitialized = useRef(false);

  // Initialize from localStorage on first mount only
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    
    const stored = localStorage.getItem('theme');
    const initial = stored === 'light' ? 'light' : 'dark';
    setTheme(initial);
  }, []);

  // Sync DOM class whenever theme state changes
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const label = theme === 'dark' ? 'Light Theme' : 'Dark Theme';

  return (
    <button
      className={styles.iconBtn}
      onClick={toggleTheme}
      title={`Switch to ${label}`}
      aria-label={`Switch to ${label}`}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      <span className={styles.toggleLabel}>THEME</span>
    </button>
  );
}
