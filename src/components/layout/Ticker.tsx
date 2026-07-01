'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { X, ExternalLink } from 'lucide-react';
import styles from './Ticker.module.css';

interface TickerItem {
  id: string;
  title: string;
  url: string;
  category: string;
  source?: string;
}

interface TickerProps {
  items: TickerItem[];
}

export default function Ticker({ items }: TickerProps) {
  const [dbItems, setDbItems] = useState<TickerItem[]>([]);
  const [apiItems, setApiItems] = useState<TickerItem[]>([]);
  const [shuffledLocalItems, setShuffledLocalItems] = useState<TickerItem[]>(items);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const feedButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileTextRef = useRef<HTMLDivElement>(null);
  const [mobileScrollAmount, setMobileScrollAmount] = useState(0);
  const [mobileShouldScroll, setMobileShouldScroll] = useState(false);

  // Fetch live items from Firestore
  useEffect(() => {
    if (!db) return;
    const unsubscribe = onSnapshot(collection(db, 'liveTicker'), (snapshot) => {
      const live: TickerItem[] = [];
      snapshot.forEach((doc) => {
        live.push(doc.data() as TickerItem);
      });
      setDbItems(live);
    });

    // Auto-sync on load (Server has a 55-minute throttle, so this is safe)
    const fetchSync = async () => {
      try {
        const res = await fetch('/api/ticker/sync');
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setApiItems(data.items);
        }
      } catch (e) { console.error(e); }
    };
    fetchSync();

    // Auto-sync hourly
    const interval = setInterval(fetchSync, 3600 * 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

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

  const getCategoryColor = (category: string) => {
    const lower = category.toLowerCase();
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
          <div key={`${item.id}-${index}`} className={styles.tickerItem}>
            <span className={styles.tickerCategory} style={{ color: getCategoryColor(item.category) }}>
              [{item.source || 'Camp Lawton'}]
            </span>
            {item.url ? (
              <Link href={item.url} className={styles.tickerLink}>
                {item.title}
              </Link>
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
          <div className={`${styles.tickerItem} ${styles.mobileItem}`} ref={mobileContainerRef}>
            <div 
              key={mobileIndex} 
              ref={mobileTextRef}
              className={`${styles.mobileItemInner} ${mobileShouldScroll ? styles.mobileMarquee : ''}`}
              style={{ '--scroll-amount': `-${mobileScrollAmount}px` } as React.CSSProperties}
            >
              <span className={styles.tickerCategory} style={{ color: getCategoryColor(combinedItems[mobileIndex].category) }}>
                [{combinedItems[mobileIndex].source || 'Camp Lawton'}]
              </span>
              {combinedItems[mobileIndex].url ? (
                <Link href={combinedItems[mobileIndex].url} className={styles.tickerLink}>
                  {combinedItems[mobileIndex].title}
                </Link>
              ) : (
                <span className={styles.tickerText}>{combinedItems[mobileIndex].title}</span>
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
                  <div key={item.id} className={styles.modalItem}>
                    <div className={styles.modalItemMeta}>
                      <span 
                        className={styles.modalCategoryBadge} 
                        style={{ backgroundColor: getCategoryColor(item.category), color: '#000' }}
                      >
                        {item.category.replace('_', ' ')}
                      </span>
                      <span className={styles.modalSource}>
                        {item.source || 'Camp Lawton'}
                      </span>
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
