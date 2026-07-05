'use client';

import React, { useEffect, useState } from 'react';
import { Type } from 'lucide-react';
import styles from './Header.module.css';

export default function DyslexiaToggle() {
  const [isDyslexiaMode, setIsDyslexiaMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dyslexiaMode');
    if (stored === 'true') {
      setTimeout(() => {
        setIsDyslexiaMode(true);
        document.documentElement.classList.add('dyslexia-mode');
      }, 0);
    }
  }, []);

  const toggleDyslexiaMode = () => {
    const nextState = !isDyslexiaMode;
    setIsDyslexiaMode(nextState);
    localStorage.setItem('dyslexiaMode', String(nextState));
    
    if (nextState) {
      document.documentElement.classList.add('dyslexia-mode');
    } else {
      document.documentElement.classList.remove('dyslexia-mode');
    }
  };

  return (
    <button 
      className={`${styles.iconBtn} ${isDyslexiaMode ? styles.active : ''}`}
      onClick={toggleDyslexiaMode}
      title="Toggle Dyslexia-Friendly Mode (OpenDyslexic)"
      aria-label="Toggle Dyslexia Mode"
    >
      <Type size={20} />
      <span className={styles.toggleLabel}>DYSLEXIA</span>
    </button>
  );
}
