'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import {
  shouldReduceMotion,
  subscribeMotionPreference,
} from '@/lib/accessibilityPreferences';

import { ExternalLink, X, Play, Pause, Eye, EyeOff } from 'lucide-react';
import styles from './Ticker.module.css';

interface TickerItem {
  id: string;
  title: string;
  url: string;
  category?: string;
  source?: string;
  sourceType?: string;
  position?: number;
  generatedAt?: string;
  syncRunId?: string;
}

interface TickerProps {
  items: TickerItem[];
}

const OFFLINE_ITEM_LIMIT_WHEN_LIVE = 10;

function TickerLink({ url, className, children }: { url: string; className: string; children: React.ReactNode }) {
  const isExternal = /^https?:\/\//i.test(url);
  return (
    <a
      href={url}
      className={className}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

function getCategoryColor(category?: string) {
  const lower = (category || '').toLowerCase();
  if (lower.includes('weather') || lower.includes('safety') || lower.includes('alert')) return '#e74c3c';
  if (lower.includes('nature') || lower.includes('forest')) return '#2ecc71';
  if (lower.includes('astronomy') || lower.includes('space') || lower.includes('sky')) return '#9b59b6';
  if (lower.includes('scout') || lower.includes('useful') || lower.includes('local')) return '#f1c40f';
  return 'var(--lantern-gold, #f7b733)';
}

export default function Ticker({ items }: TickerProps) {

  const [dbItems, setDbItems] = useState<TickerItem[]>([]);
  const [apiItems] = useState<TickerItem[]>([]);
  const [shuffledLocalItems, setShuffledLocalItems] = useState<TickerItem[]>(items);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [mobileScrollAmount, setMobileScrollAmount] = useState(0);
  const [mobileShouldScroll, setMobileShouldScroll] = useState(false);

  const [isPaused, setIsPaused] = useState(false);
  const lowMotion = useSyncExternalStore(
    subscribeMotionPreference,
    shouldReduceMotion,
    () => false,
  );
  const [isHidden, setIsHidden] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ticker_hidden') === 'true';
    }
    return false;
  });

  const toggleHidden = (val: boolean) => {
    setIsHidden(val);
    localStorage.setItem('ticker_hidden', String(val));
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const feedButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileTextRef = useRef<HTMLDivElement>(null);

  // Sync is performed automatically by the Netlify cron function (6am, 12pm, 5pm MST).
  // Manual admin sync has been removed from the UI.

  // Subscribe to Firestore liveTicker collection
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (db) {
      const liveTickerQuery = query(collection(db, 'liveTicker'), orderBy('position', 'asc'));
      unsubscribe = onSnapshot(liveTickerQuery, (snapshot) => {
        const live: TickerItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as TickerItem;
          live.push({ ...data, id: data.id || doc.id });
        });
        setDbItems(live);
      });
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  // On page load, trigger a background RSS sync if liveTicker is empty or stale
  useEffect(() => {
    const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

    async function triggerSyncIfNeeded() {
      try {
        // Check if we already have fresh items in Firestore
        const { collection: col, getDocs, query: fsQuery, orderBy: fsOrderBy, limit } = await import('firebase/firestore');
        const snap = await getDocs(fsQuery(col(db, 'liveTicker'), fsOrderBy('position', 'asc'), limit(1)));

        if (!snap.empty) {
          const firstItem = snap.docs[0].data() as TickerItem;
          const generatedAt = firstItem.generatedAt ? new Date(firstItem.generatedAt).getTime() : 0;
          const age = Date.now() - generatedAt;
          if (age < STALE_THRESHOLD_MS) {
            // Data is fresh enough, no sync needed
            return;
          }
        }

        // Data is empty or stale — trigger a background sync (fire-and-forget)
        console.info('[Ticker] Triggering background RSS sync...');
        fetch('/api/ticker/sync').catch(() => {
          // Silently ignore if sync fails — offline or slow network
        });
      } catch {
        // Ignore errors — just skip the sync attempt silently
      }
    }

    triggerSyncIfNeeded();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShuffledLocalItems([...items].sort(() => 0.5 - Math.random()));
    }, 0);
    return () => clearTimeout(timer);
  }, [items]);

  const combinedItems = useMemo(() => {
    const activeLiveItems = dbItems.length > 0 ? dbItems : apiItems;
    const hasLiveFeedContent = activeLiveItems.length > 0;
    const localItems = hasLiveFeedContent
      ? shuffledLocalItems.slice(0, OFFLINE_ITEM_LIMIT_WHEN_LIVE)
      : shuffledLocalItems;

    return [...activeLiveItems, ...localItems];
  }, [apiItems, dbItems, shuffledLocalItems]);

  const displayItems = useMemo(() => {
    if (combinedItems.length === 0) return [];
    return [...combinedItems, ...combinedItems];
  }, [combinedItems]);

  useEffect(() => {
    if (combinedItems.length <= 1) return;
    if (lowMotion) return;
    
    let intervalId: NodeJS.Timeout;
    let isActive = true;

    const startInterval = () => {
      intervalId = setInterval(() => {
        if (isActive && !isPaused) {
          setMobileIndex((prev) => (prev + 1) % combinedItems.length);
        }
      }, 7000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActive = false;
        clearInterval(intervalId);
      } else {
        if (!isActive) {
          isActive = true;
          startInterval();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startInterval();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [combinedItems, isPaused, lowMotion]);

  useEffect(() => {
    if (!scrollRef.current || displayItems.length === 0) return;
    if (lowMotion) return;

    let animationId: number;
    let isActive = true;

    const scroll = () => {
      if (!isActive) return;
      if (scrollRef.current && !isHovered && !isPaused) {
        scrollRef.current.scrollLeft += 0.4;
        if (scrollRef.current.scrollLeft >= scrollRef.current.scrollWidth / 2) {
          scrollRef.current.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(scroll);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActive = false;
        cancelAnimationFrame(animationId);
      } else {
        if (!isActive) {
          isActive = true;
          animationId = requestAnimationFrame(scroll);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationId = requestAnimationFrame(scroll);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationId);
    };
  }, [displayItems, isHovered, isPaused, lowMotion]);

  useEffect(() => {
    if (!mobileContainerRef.current || !mobileTextRef.current) return;

    const timer = setTimeout(() => {
      if (!mobileContainerRef.current || !mobileTextRef.current) return;

      const containerWidth = mobileContainerRef.current.clientWidth;
      const textWidth = mobileTextRef.current.scrollWidth;
      const overflow = textWidth - containerWidth;

      if (overflow > 0) {
        setMobileScrollAmount(overflow + 30);
        setMobileShouldScroll(true);
      } else {
        setMobileScrollAmount(0);
        setMobileShouldScroll(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [combinedItems, mobileIndex]);

  useEffect(() => {
    if (!isFeedOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFeedOpen(false);
        feedButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFeedOpen]);

  const nextMobile = () => setMobileIndex((p) => (p + 1) % combinedItems.length);
  const prevMobile = () => setMobileIndex((p) => (p - 1 + combinedItems.length) % combinedItems.length);

  if (combinedItems.length === 0) return null;

  if (isHidden) {
    return (
      <div className={styles.restoreBar}>
        <button
          onClick={() => toggleHidden(false)}
          className={styles.restoreBtn}
          title="Restore news ticker"
          aria-label="Restore news ticker"
        >
          <Eye size={14} />
          <span>Show Camp Feed Ticker</span>
        </button>
      </div>
    );
  }

  const safeMobileIndex = Math.min(mobileIndex, combinedItems.length - 1);
  const mobileItem = combinedItems[safeMobileIndex];

  return (
    <div className={styles.tickerContainer}>
      <button
        ref={feedButtonRef}
        onClick={() => setIsFeedOpen(true)}
        className={styles.tickerLabel}
        aria-label="Open Camp Feed List"
      >
        CAMP FEED
      </button>

      <div className={styles.desktopArrows}>
        <button
          onClick={() => {
            if (scrollRef.current) scrollRef.current.scrollLeft -= 300;
            setIsHovered(true);
            setTimeout(() => setIsHovered(false), 2000);
          }}
          className={styles.desktopArrowBtn}
        >◀</button>
      </div>

      <div
        className={styles.tickerContent}
        ref={scrollRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => setIsHovered(false)}
      >
        {displayItems.map((item, index) => (
          <div key={`${item.id}-${index}`} className={styles.tickerItem} title={item.id ? `Ticker ID: ${item.id}` : undefined}>
            <span className={styles.tickerCategory} style={{ color: getCategoryColor(item.category) }}>
              [{item.source || 'Camp Lawton'}]
            </span>
            {item.url ? (
              <TickerLink url={item.url} className={styles.tickerLink}>
                {item.title}
              </TickerLink>
            ) : (
              <span className={styles.tickerText}>{item.title}</span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.desktopArrows}>
        <button
          onClick={() => {
            if (scrollRef.current) scrollRef.current.scrollLeft += 300;
            setIsHovered(true);
            setTimeout(() => setIsHovered(false), 2000);
          }}
          className={styles.desktopArrowBtn}
        >▶</button>
      </div>

      <div className={styles.tickerControls}>
        <button
          type="button"
          onClick={() => setIsPaused(!isPaused)}
          className={styles.controlBtn}
          title={isPaused ? "Play news ticker" : "Pause news ticker"}
          aria-label={isPaused ? "Play news ticker" : "Pause news ticker"}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          type="button"
          onClick={() => toggleHidden(true)}
          className={styles.controlBtn}
          title="Hide news ticker"
          aria-label="Hide news ticker"
        >
          <EyeOff size={14} />
        </button>
      </div>

      <div className={styles.tickerMobileContent}>
        <button onClick={prevMobile} className={styles.arrowBtn}>◀</button>
        <div className={`${styles.tickerItem} ${styles.mobileItem}`} ref={mobileContainerRef} title={mobileItem.id ? `Ticker ID: ${mobileItem.id}` : undefined}>
          <div
            key={safeMobileIndex}
            ref={mobileTextRef}
            className={`${styles.mobileItemInner} ${mobileShouldScroll && !lowMotion ? styles.mobileMarquee : ''}`}
            style={{ '--scroll-amount': `-${mobileScrollAmount}px` } as React.CSSProperties}
          >
            <span className={styles.tickerCategory} style={{ color: getCategoryColor(mobileItem.category) }}>
              [{mobileItem.source || 'Camp Lawton'}]
            </span>
            {mobileItem.url ? (
              <TickerLink url={mobileItem.url} className={styles.tickerLink}>
                {mobileItem.title}
              </TickerLink>
            ) : (
              <span className={styles.tickerText}>{mobileItem.title}</span>
            )}
          </div>
        </div>
        <button onClick={nextMobile} className={styles.arrowBtn}>▶</button>
      </div>

      {isFeedOpen && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setIsFeedOpen(false);
            feedButtonRef.current?.focus();
          }}
          role="presentation"
        >
          <div
            className={styles.modalContainer}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feed-modal-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="feed-modal-title" className={styles.modalTitle}>CAMP FEED BULLETIN</h2>
              <button
                ref={closeButtonRef}
                onClick={() => {
                  setIsFeedOpen(false);
                  feedButtonRef.current?.focus();
                }}
                className={styles.modalCloseBtn}
                aria-label="Close Camp Feed List"
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalList}>
                {combinedItems.map((item) => (
                  <div key={item.id} className={styles.modalItem} title={item.id ? `Ticker ID: ${item.id}` : undefined}>
                    <div className={styles.modalItemMeta}>
                      <span
                        className={styles.modalCategoryBadge}
                        style={{ backgroundColor: getCategoryColor(item.category), color: '#000' }}
                      >
                        {(item.category || item.sourceType || 'LIVE').replace('_', ' ')}
                      </span>
                      <span className={styles.modalSource}>
                        {item.source || 'Camp Lawton'}
                      </span>
                      {item.id && (
                        <span className={styles.modalSource}>
                          ID: {item.id}
                        </span>
                      )}
                    </div>
                    <div className={styles.modalItemContent}>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.modalItemLink}
                        >
                          <span className={styles.modalItemText}>{item.title}</span>
                          <ExternalLink size={14} className={styles.modalLinkIcon} />
                        </a>
                      ) : (
                        <span className={styles.modalItemText}>{item.title}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
