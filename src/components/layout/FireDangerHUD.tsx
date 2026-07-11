'use client';

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';

import styles from './FireDangerHUD.module.css';

type FireDangerLevel = 'normal' | 'info' | 'watch' | 'warning' | 'critical';
type FireDangerLabel = 'Low' | 'Moderate' | 'High' | 'Very High' | 'Extreme' | 'Unavailable';

interface FireDangerResponse {
  label: FireDangerLabel;
  level: FireDangerLevel;
  health: 'ok' | 'degraded';
  sourceUrl: string;
  fetchedAt: string;
}

const SOURCE_URL = 'https://www.fs.usda.gov/r03/coronado/alerts';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export default function FireDangerHUD() {
  const [status, setStatus] = useState<FireDangerResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadFireDanger = async () => {
      try {
        const res = await fetch('/api/alerts/fire-danger', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Fire danger API returned ${res.status}`);
        setStatus(await res.json() as FireDangerResponse);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Fire danger fetch failed:', error);
        setStatus({
          label: 'Unavailable',
          level: 'info',
          health: 'degraded',
          sourceUrl: SOURCE_URL,
          fetchedAt: new Date().toISOString(),
        });
      }
    };

    void loadFireDanger();
    const interval = window.setInterval(() => void loadFireDanger(), REFRESH_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const label = status?.label ?? 'Checking…';
  const level = status?.level ?? 'info';
  const sourceUrl = status?.sourceUrl ?? SOURCE_URL;
  const title = status?.health === 'degraded'
    ? 'Coronado National Forest fire danger status is temporarily unavailable. Open the official source.'
    : `Coronado National Forest fire danger: ${label}`;

  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.fireDanger} ${styles[level]}`}
      aria-label={title}
      title={title}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <Flame size={20} />
      </span>
      <span className={styles.content}>
        <span className={styles.label}>Coronado NF Fire Danger</span>
        <span className={styles.value}>{label}</span>
      </span>
      <span className={styles.source}>USFS ↗</span>
    </a>
  );
}
