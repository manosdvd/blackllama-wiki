'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import styles from './PwaUpdater.module.css';

export default function PwaUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerListeners = (reg: ServiceWorkerRegistration) => {
      // 1. Check if there's already a waiting worker
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateAvailable(true);
        setTimeout(() => setIsVisible(true), 500);
      }

      // 2. Listen for new installing workers
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
              setTimeout(() => setIsVisible(true), 500);
            }
          }
        });
      });
    };

    // Find the active registration
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) {
        registerListeners(reg);
      }
    });

    // Handle controller change (reload the app when the new SW takes control)
    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!updateAvailable || !isVisible) {
    return null;
  }

  return (
    <div className={styles.pwaBanner} role="alert" aria-live="assertive">
      <div className={styles.glow} />
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.iconWrapper}>
              <Sparkles size={16} className={styles.sparkleIcon} />
            </span>
            <h3 className={styles.title}>Update Available</h3>
          </div>
          <button 
            onClick={handleDismiss} 
            className={styles.closeBtn} 
            aria-label="Dismiss update notification"
          >
            <X size={16} />
          </button>
        </div>
        <p className={styles.description}>
          A new version of the Camp Lawton Staff Hub is ready with the latest policies, songbook, and tools.
        </p>
        <button onClick={handleUpdate} className={styles.updateBtn}>
          <RefreshCw size={14} className={styles.spinIcon} />
          <span>Reload &amp; Update Now</span>
        </button>
      </div>
    </div>
  );
}
