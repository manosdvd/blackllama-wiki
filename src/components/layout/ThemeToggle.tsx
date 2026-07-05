'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './Header.module.css';

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light');
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
