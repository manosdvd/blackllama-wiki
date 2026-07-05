'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './Header.module.css';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      setTheme('light');
      document.documentElement.classList.add('light-theme');
    } else {
      setTheme('dark');
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);

    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
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
