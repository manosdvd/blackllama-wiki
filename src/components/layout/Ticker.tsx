'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import styles from './Ticker.module.css';

interface TickerItem {
  id: string;
  title: string;
  url: string;
  category: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    setShuffledLocalItems([...items].sort(() => 0.5 - Math.random()));
  }, [items]);

  const combinedItems = useMemo(() => {
    // Determine which live items to use (DB takes precedence if it has data)
    const activeLiveItems = dbItems.length > 0 ? dbItems : apiItems;
    // Live data first, then client-side-shuffled local data
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
    // Duplicate the array once for seamless scrolling
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
        scrollRef.current.scrollLeft += 0.4; // Ticker speed
        if (scrollRef.current.scrollLeft >= scrollRef.current.scrollWidth / 2) {
          scrollRef.current.scrollLeft = 0; // Seamless loop reset
        }
      }
      animationId = requestAnimationFrame(scroll);
    };
    animationId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationId);
  }, [isHovered, displayItems]);

  const nextMobile = () => setMobileIndex((p) => (p + 1) % combinedItems.length);
  const prevMobile = () => setMobileIndex((p) => (p - 1 + combinedItems.length) % combinedItems.length);

  if (combinedItems.length === 0) return null;

  return (
    <div className={styles.tickerContainer}>
      <div className={styles.tickerLabel}>
        CAMP FEED
      </div>
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
              [{item.category.replace('_', ' ')}]
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
          <div className={`${styles.tickerItem} ${styles.mobileItem}`}>
            <span className={styles.tickerCategory} style={{ color: getCategoryColor(combinedItems[mobileIndex].category) }}>
              [{combinedItems[mobileIndex].category.replace('_', ' ')}]
            </span>
            {combinedItems[mobileIndex].url ? (
              <Link href={combinedItems[mobileIndex].url} className={styles.tickerLink}>
                {combinedItems[mobileIndex].title}
              </Link>
            ) : (
              <span className={styles.tickerText}>{combinedItems[mobileIndex].title}</span>
            )}
          </div>
        )}
        <button onClick={nextMobile} className={styles.arrowBtn}>▶</button>
      </div>
    </div>
  );
}
