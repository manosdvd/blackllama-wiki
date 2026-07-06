'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Accessibility } from 'lucide-react';
import styles from './AccessibilitySettings.module.css';

type FontChoice = 'default' | 'opendyslexic';

function storedFontChoice(): FontChoice {
  if (typeof window === 'undefined') return 'default';
  const storedFont = localStorage.getItem('access-font');
  return storedFont === 'opendyslexic' ? 'opendyslexic' : 'default';
}

function storedHighLegibility() {
  return typeof window !== 'undefined' && localStorage.getItem('access-high-legibility') === 'true';
}

export default function AccessibilitySettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [font, setFont] = useState<FontChoice>(storedFontChoice);
  const [highLegibility, setHighLegibility] = useState(storedHighLegibility);
  const containerRef = useRef<HTMLDivElement>(null);

  // Migrate removed font options to the Lexie Readable default.
  useEffect(() => {
    const storedFont = localStorage.getItem('access-font');
    if (storedFont === 'atkinson' || storedFont === 'dyslexia') {
      localStorage.setItem('access-font', 'default');
    }
  }, []);

  // Sync document element classes when preferences change
  useEffect(() => {
    const root = document.documentElement;

    if (font === 'opendyslexic') {
      root.classList.add('font-opendyslexic');
    } else {
      root.classList.remove('font-opendyslexic');
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
                style={{ fontFamily: 'Lexie Readable, sans-serif' }}
              >
                Lexie Readable
              </button>
              <button
                type="button"
                className={`${styles.optionBtn} ${font === 'opendyslexic' ? styles.optionBtnActive : ''}`}
                onClick={() => selectFont('opendyslexic')}
                style={{ fontFamily: 'OpenDyslexic, Lexie Readable, sans-serif' }}
              >
                OpenDyslexic
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
