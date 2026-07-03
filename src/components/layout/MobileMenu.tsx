'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import styles from './MobileMenu.module.css';

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Lock scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.mobileMenuBtn}
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-drawer"
        aria-label="Toggle Navigation Menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <div className={styles.overlay} role="presentation">
          <div
            ref={menuRef}
            id="mobile-nav-drawer"
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Drawer"
          >
            <nav className={styles.navLinks}>
              <Link href="/" className={styles.navItem} onClick={() => setIsOpen(false)}>
                Dashboard
              </Link>
              <Link href="/wiki" className={styles.navItem} onClick={() => setIsOpen(false)}>
                Wiki &amp; Procedures
              </Link>
              <Link href="/apply" className={styles.navItem} onClick={() => setIsOpen(false)}>
                Apply
              </Link>
              <Link href="/onboarding" className={styles.navItem} onClick={() => setIsOpen(false)}>
                Onboarding
              </Link>
              <Link href="/admin/review" className={styles.navItem} onClick={() => setIsOpen(false)}>
                Admin
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
