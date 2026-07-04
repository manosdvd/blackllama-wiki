'use client';

import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { X, ExternalLink } from 'lucide-react';
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

interface SyncResponse {
  success?: boolean;
  count?: number;
  message?: string;
  error?: string;
  warning?: string;
  latestId?: string;
  syncRunId?: string | null;
  firstItemId?: string | null;
  currentItemCount?: number;
  items?: TickerItem[];
}

const PUBLIC_SYNC_URL = '/api/ticker/sync?force=true&public=true';
const PUBLIC_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

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

export default function Ticker({ items }: TickerProps) {
  const [dbItems, setDbItems] = useState<TickerItem[]>([]);
  const [apiItems, setApiItems] = useState<TickerItem[]>([]);
  const [shuffledLocalItems, setShuffledLocalItems] = useState<TickerItem[]>(items);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const feedButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileTextRef = useRef<HTMLDivElement>(null);
  const [mobileScrollAmount, setMobileScrollAmount] = useState(0);
  const [mobileShouldScroll, setMobileShouldScroll] = useState(false);

  const runPublicSync = useCallback(async (manual = false) => {
    if (manual) {
      setIsSyncing(true);
      setSyncResult(null);
    }

    try {
      const res = await fetch(PUBLIC_SYNC_URL, { cache: 'no-store' });
      const data = (await res.json()) as SyncResponse;

      if (data.items && data.items.length > 0) {
        setApiItems(data.items);
      }

      if (manual) {
        const debugId = data.syncRunId || data.firstItemId || data.latestId || data.items?.[0]?.id;
        const countText = typeof data.count === 'number'
          ? `${data.count} items`
          : typeof data.currentItemCount === 'number'
            ? `${data.currentItemCount} current items`
            : data.message || 'sync checked';
        const statusText = res.ok && data.success ? countText : `Error: ${data.error || data.warning || 'Unknown error'}`;
        setSyncResult(`${statusText}${debugId ? ` · ID: ${debugId}` : ''}`);
      }
    } catch (e: unknown) {
      if (manual) {
        setSyncResult(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      console.error(e);
    } finally {
      if (manual) {
        setIsSyncing(false);
      }
    }
  }, []);

  // Fetch live items from Firestore and kick the public sync timer.
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

    // Public front-page sync. The API still protects this with a short server-side cooldown.
    void runPublicSync(false);

    // Keep the public ticker nudging itself several times per day even if the Netlify cron misses.
    const interval = setInterval(() => {
      void runPublicSync(false);
    }, PUBLIC_SYNC_INTERVAL_MS);

    return () => {
      unsubscribe?.();
      clearInterval(interval);
    };
  }, [runPublicSync]);

  // Shuffle local items client-side only to avoid hydration mismatch
  useEffect(() => {
    const timer = setTimeout(() => {
      setShuffledLocalItems([...items].sort(() => 0.5 - Math.random()));
    }, 0);
    return () => clearTimeout(timer);
  }, [items]);

  const combinedItems = useMemo(() => {
    const activeLiveItems = dbItems.length > 0 ? dbItems : apiItems;
    return [...activeLiveItems, ...shuffledLocalItems];
  }, [shuffledLocalItems, dbItems, apiItems]);

  const getCategoryColor = (category?: string) => {
    const lower = (category || '').toLowerCase();
    if (lower.includes('weather') || lower.includes('safety') || lower.includes('alert')) return '#e74c3c'; // red
    if (lower.includes('nature') || lower.includes('forest')) return '#2ecc71'; // green
    if (lower.includes('astronomy') || lower.includes('space') || lower.includes('sky')) return '#9b59b6'; // purple
    if (lower.includes('scout') || lower.includes('useful') || lower.includes('local')) return '#f1c40f'; // yellow
    return 'var(--lantern-gold, #f7b733)'; // fallback
  };

  const displayItems = useMemo(() => {
    if (combinedItems.length === 0) return [];
    return [...combinedItems, ...combinedItems];
  }, [combinedItems]);

  useEffect(() => {
    if (combinedItems.length <= 1) return;
    const interval = setInterval(() => {
      setMobileIndex((prev) => (prev + 1) % combinedItems.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [combinedItems]);

  useEffect(() => {
    if (!scrollRef.current || displayItems.length === 0) return;
    let animationId: number;
    const scroll = () => {
      if (scrollRef.current && !isHovered) {
        scrollRef.current.scrollLeft += 0.4;
        if (scrollRef.current.scrollLeft >= scrollRef.current.scrollWidth / 2) {
          scrollRef.current.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(scroll);
    };
    animationId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationId);
  }, [isHovered, displayItems]);

  // Measure overflow for mobile marquee scroll
  useEffect(() => {
    if (mobileContainerRef.current && mobileTextRef.current) {
      const timer = setTimeout(() => {
        if (mobileContainerRef.current && mobileTextRef.current) {
          const containerWidth = mobileContainerRef.current.clientWidth;
          const textWidth = mobileTextRef.current.scrollWidth;
          const overflow = textWidth - containerWidth;
          
          if (overflow > 0) {
            setMobileScrollAmount(overflow + 30); // 30px safety padding
            setMobileShouldScroll(true);
          } else {
            setMobileScrollAmount(0);
            setMobileShouldScroll(false);
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mobileIndex, combinedItems]);

  // Escape key and outside click handling for modal accessibility
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

      <button
        onClick={() => {
          setIsFeedOpen(true);
          void runPublicSync(true);
        }}
        disabled={isSyncing}
        className={styles.tickerLabel}
        aria-label="Force sync Camp Feed"
        title="Force sync Camp Feed"
        style={{ marginLeft: '0.25rem', opacity: isSyncing ? 0.65 : 1 }}
      >
        {isSyncing ? 'SYNC...' : 'SYNC'}
      </button>
      
      <div className={styles.desktopArrows}>
        <button 
          onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft -= 300; setIsHovered(true); setTimeout(() => setIsHovered(false), 2000); }} 
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
          onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft += 300; setIsHovered(true); setTimeout(() => setIsHovered(false), 2000); }} 
          className={styles.desktopArrowBtn}
        >▶</button>
      </div>
      
      <div className={styles.tickerMobileContent}>
        <button onClick={prevMobile} className={styles.arrowBtn}>◀</button>
        {combinedItems.length > 0 && (
          <div className={`${styles.tickerItem} ${styles.mobileItem}`} ref={mobileContainerRef} title={mobileItem.id ? `Ticker ID: ${mobileItem.id}` : undefined}>
            <div 
              key={safeMobileIndex} 
              ref={mobileTextRef}
              className={`${styles.mobileItemInner} ${mobileShouldScroll ? styles.mobileMarquee : ''}`}
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
        )}
        <button onClick={nextMobile} className={styles.arrowBtn}>▶</button>
      </div>

      {/* Floating Window Modal */}
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
                onClick={() => void runPublicSync(true)}
                disabled={isSyncing}
                style={{
                  background: 'var(--pine-green)',
                  color: 'white',
                  border: 'none',
                  padding: '0.4rem 0.65rem',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  borderRadius: '4px',
                  marginLeft: 'auto',
                  marginRight: '0.5rem',
                  opacity: isSyncing ? 0.65 : 1,
                }}
              >
                {isSyncing ? 'Syncing...' : 'Force Sync'}
              </button>
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
            {syncResult && (
              <p style={{ margin: '0.5rem 1rem 0', fontSize: '0.8rem', color: 'var(--lantern-gold)' }}>
                {syncResult}
              </p>
            )}
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
