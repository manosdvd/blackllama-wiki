'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import {
  shouldReduceMotion,
  subscribeMotionPreference,
} from '@/lib/accessibilityPreferences';
import { Play, Pause, Eye, EyeOff } from 'lucide-react';
import CampFeedBulletin from './CampFeedBulletin';
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
  publishedAt?: string;
  imageUrl?: string;
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const feedButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileTextRef = useRef<HTMLDivElement>(null);

  const toggleHidden = (value: boolean) => {
    setIsHidden(value);
    localStorage.setItem('ticker_hidden', String(value));
  };

  const closeFeed = useCallback(() => {
    setIsFeedOpen(false);
    feedButtonRef.current?.focus();
  }, []);

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

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

    async function triggerSyncIfNeeded() {
      try {
        const { collection: col, getDocs, query: fsQuery, orderBy: fsOrderBy, limit } = await import('firebase/firestore');
        const snap = await getDocs(fsQuery(col(db, 'liveTicker'), fsOrderBy('position', 'asc'), limit(1)));

        if (!snap.empty) {
          const firstItem = snap.docs[0].data() as TickerItem;
          const generatedAt = firstItem.generatedAt ? new Date(firstItem.generatedAt).getTime() : 0;
          if (Date.now() - generatedAt < STALE_THRESHOLD_MS) return;
        }

        console.info('[Ticker] Triggering background RSS sync...');
        fetch('/api/ticker/sync').catch(() => undefined);
      } catch {
        // The offline ticker remains available when Firestore or the sync endpoint is unavailable.
      }
    }

    void triggerSyncIfNeeded();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShuffledLocalItems([...items].sort(() => 0.5 - Math.random()));
    }, 0);
    return () => clearTimeout(timer);
  }, [items]);

  const combinedItems = useMemo(() => {
    const activeLiveItems = dbItems.length > 0 ? dbItems : apiItems;
    const localItems = activeLiveItems.length > 0
      ? shuffledLocalItems.slice(0, OFFLINE_ITEM_LIMIT_WHEN_LIVE)
      : shuffledLocalItems;
    return [...activeLiveItems, ...localItems];
  }, [apiItems, dbItems, shuffledLocalItems]);

  const displayItems = useMemo(() => {
    if (combinedItems.length === 0) return [];
    return [...combinedItems, ...combinedItems];
  }, [combinedItems]);

  useEffect(() => {
    if (combinedItems.length <= 1 || lowMotion) return;

    let intervalId: NodeJS.Timeout;
    let isActive = true;

    const startInterval = () => {
      intervalId = setInterval(() => {
        if (isActive && !isPaused) {
          setMobileIndex((previous) => (previous + 1) % combinedItems.length);
        }
      }, 7000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActive = false;
        clearInterval(intervalId);
      } else if (!isActive) {
        isActive = true;
        startInterval();
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
    if (!scrollRef.current || displayItems.length === 0 || lowMotion) return;

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
      } else if (!isActive) {
        isActive = true;
        animationId = requestAnimationFrame(scroll);
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
      const overflow = mobileTextRef.current.scrollWidth - mobileContainerRef.current.clientWidth;
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFeed();
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeFeed, isFeedOpen]);

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
  const nextMobile = () => setMobileIndex((previous) => (previous + 1) % combinedItems.length);
  const prevMobile = () => setMobileIndex((previous) => (previous - 1 + combinedItems.length) % combinedItems.length);

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
          aria-label="Scroll ticker backward"
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
              <TickerLink url={item.url} className={styles.tickerLink}>{item.title}</TickerLink>
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
          aria-label="Scroll ticker forward"
        >▶</button>
      </div>

      <div className={styles.tickerControls}>
        <button
          type="button"
          onClick={() => setIsPaused(!isPaused)}
          className={styles.controlBtn}
          title={isPaused ? 'Play news ticker' : 'Pause news ticker'}
          aria-label={isPaused ? 'Play news ticker' : 'Pause news ticker'}
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
        <button onClick={prevMobile} className={styles.arrowBtn} aria-label="Previous ticker item">◀</button>
        <div
          className={`${styles.tickerItem} ${styles.mobileItem}`}
          ref={mobileContainerRef}
          title={mobileItem.id ? `Ticker ID: ${mobileItem.id}` : undefined}
        >
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
              <TickerLink url={mobileItem.url} className={styles.tickerLink}>{mobileItem.title}</TickerLink>
            ) : (
              <span className={styles.tickerText}>{mobileItem.title}</span>
            )}
          </div>
        </div>
        <button onClick={nextMobile} className={styles.arrowBtn} aria-label="Next ticker item">▶</button>
      </div>

      {isFeedOpen && (
        <CampFeedBulletin
          items={combinedItems}
          onClose={closeFeed}
          closeButtonRef={closeButtonRef}
        />
      )}
    </div>
  );
}
