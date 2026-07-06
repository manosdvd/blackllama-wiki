'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Accessibility } from 'lucide-react';
import styles from './AccessibilitySettings.module.css';

type FontChoice = 'default' | 'atkinson' | 'dyslexia';

export default function AccessibilitySettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [font, setFont] = useState<FontChoice>('default');
  const [highLegibility, setHighLegibility] = useState(false);
  const isInitialized = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const storedFont = localStorage.getItem('access-font') as FontChoice;
    const storedLegibility = localStorage.getItem('access-high-legibility') === 'true';

    if (storedFont === 'atkinson' || storedFont === 'dyslexia' || storedFont === 'default') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFont(storedFont);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighLegibility(storedLegibility);
  }, []);

  // Sync document element classes when preferences change
  useEffect(() => {
    const root = document.documentElement;

    // Font family styling classes
    if (font === 'atkinson') {
      root.classList.add('font-atkinson');
      root.classList.remove('font-dyslexia');
    } else if (font === 'dyslexia') {
      root.classList.add('font-dyslexia');
      root.classList.remove('font-atkinson');
    } else {
      root.classList.remove('font-atkinson', 'font-dyslexia');
    }

    // High legibility class
    if (highLegibility) {
      root.classList.add('high-legibility');
    } else {
      root.classList.remove('high-legibility');
    }
  }, [font, highLegibility]);

  // Click outside to close dropdown handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectFont = (choice: FontChoice) => {
    setFont(choice);
    localStorage.setItem('access-font', choice);
  };

  const toggleHighLegibility = () => {
    const nextVal = !highLegibility;
    setHighLegibility(nextVal);
    localStorage.setItem('access-high-legibility', String(nextVal));
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.iconBtn} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Accessibility Settings"
        aria-label="Accessibility Settings"
        aria-expanded={isOpen}
      >
        <Accessibility size={20} />
        <span className={styles.toggleLabel}>ACCESS</span>
      </button>

      {isOpen && (
        <div className={styles.popover}>
          <h3 className={styles.title}>Accessibility Options</h3>

          <div className={styles.settingGroup}>
            <label>Readability Font</label>
            <div className={styles.optionsList}>
              <button
                type="button"
                className={`${styles.optionBtn} ${font === 'default' ? styles.optionBtnActive : ''}`}
                onClick={() => selectFont('default')}
              >
                Default (Inter)
              </button>
              <button
                type="button"
                className={`${styles.optionBtn} ${font === 'atkinson' ? styles.optionBtnActive : ''}`}
                onClick={() => selectFont('atkinson')}
                style={{ fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
              >
                Atkinson Hyperlegible
              </button>
              <button
                type="button"
                className={`${styles.optionBtn} ${font === 'dyslexia' ? styles.optionBtnActive : ''}`}
                onClick={() => selectFont('dyslexia')}
                style={{ fontFamily: 'Lexie Readable, sans-serif' }}
              >
                Dyslexia Friendly
              </button>
            </div>
          </div>

          <div className={styles.settingGroup}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleLabelText}>
                <strong>High Legibility Spacing</strong>
                <span>Expand word and letter spacing</span>
              </div>
              <label className={styles.switch} aria-label="Toggle High Legibility Spacing">
                <input
                  type="checkbox"
                  checked={highLegibility}
                  onChange={toggleHighLegibility}
                />
                <span className={styles.slider} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
