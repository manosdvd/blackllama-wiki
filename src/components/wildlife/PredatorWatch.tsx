'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Info,
  MapPin,
  PawPrint,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type {
  PredatorRecency,
  PredatorSighting,
  PredatorWatchResponse,
} from '@/app/api/wildlife/predators/route';
import styles from './WildlifeWatch.module.css';

const CACHE_KEY = 'predatorWatchCache';

function formatObserved(value?: string) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Phoenix',
  });
}

function recencyClass(recency: PredatorRecency) {
  if (recency === 'recent') return styles.caution;
  if (recency === 'within-year') return styles.watch;
  return styles.info;
}

function recencyLabel(recency: PredatorRecency) {
  if (recency === 'recent') return 'recent';
  if (recency === 'within-year') return 'within year';
  return 'historical';
}

function PredatorRow({ sighting }: { sighting: PredatorSighting }) {
  const photoStyle = sighting.photoUrl
    ? { backgroundImage: `url("${sighting.photoUrl.replace(/"/g, '%22')}")` }
    : undefined;

  return (
    <a
      href={sighting.observationUrl || 'https://www.inaturalist.org/observations'}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.sightingRow}
    >
      <div className={`${styles.sightingIcon} ${recencyClass(sighting.recency)}`}>
        {sighting.photoUrl ? (
          <span className={styles.sightingPhoto} style={photoStyle} aria-hidden="true" />
        ) : sighting.species === 'mountain-lion' ? (
          <ShieldAlert size={20} />
        ) : (
          <PawPrint size={20} />
        )}
      </div>
      <div className={styles.sightingContent}>
        <div className={styles.sightingTopLine}>
          <strong>{sighting.commonName}</strong>
          <span className={`${styles.levelBadge} ${recencyClass(sighting.recency)}`}>
            {recencyLabel(sighting.recency)}
          </span>
        </div>
        <p>{sighting.summary}</p>
        <div className={styles.sightingMeta}>
          <span>{formatObserved(sighting.observedAt)}</span>
          {typeof sighting.distanceMiles === 'number' && <span>{sighting.distanceMiles} mi</span>}
          {sighting.approximateLocation && <span>location obscured</span>}
          <span>{sighting.qualityGrade}</span>
        </div>
      </div>
      <ExternalLink size={14} className={styles.externalIcon} />
    </a>
  );
}

export default function PredatorWatch() {
  const [data, setData] = useState<PredatorWatchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = window.localStorage.getItem(CACHE_KEY);
      if (!cached) return;
      try {
        setData(JSON.parse(cached) as PredatorWatchResponse);
        setIsLoading(false);
      } catch {
        window.localStorage.removeItem(CACHE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchPredators = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/wildlife/predators?radiusMiles=15');
      if (!response.ok) throw new Error(`Predator watch API returned ${response.status}`);
      const fresh = await response.json() as PredatorWatchResponse;
      setData(fresh);
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    } catch (error) {
      console.error('Predator watch fetch failed:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchPredators();
    }, 0);
    const interval = window.setInterval(fetchPredators, 15 * 60 * 1000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(interval);
    };
  }, [fetchPredators]);

  if (isLoading && !data) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.pulseDot} />
        <span>Checking bear and mountain lion observations...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.emptyState}>
        <Info size={22} />
        <p>Bear and mountain lion observation data is unavailable.</p>
      </div>
    );
  }

  const years = Math.max(1, Math.round(data.lookbackDays / 365));

  return (
    <div className={styles.habitatBlock}>
      <div className={styles.habitatHeader}>
        <AlertTriangle size={15} />
        <strong>Bear &amp; Lion Watch</strong>
      </div>

      <div className={styles.summaryBar}>
        <div className={`${styles.summaryItem} ${data.summary.blackBear > 0 ? styles.summaryWarn : ''}`}>
          <PawPrint size={16} />
          <strong>{data.summary.blackBear}</strong>
          <span>bear</span>
        </div>
        <div className={`${styles.summaryItem} ${data.summary.mountainLion > 0 ? styles.summaryWarn : ''}`}>
          <ShieldAlert size={16} />
          <strong>{data.summary.mountainLion}</strong>
          <span>lion</span>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={fetchPredators}
          disabled={isRefreshing}
          aria-label="Refresh bear and mountain lion observations"
          title="Refresh bear and mountain lion observations"
        >
          <RefreshCw size={16} className={isRefreshing ? styles.spinning : undefined} />
        </button>
      </div>

      <div className={styles.locationLine}>
        <MapPin size={13} />
        <span>{data.location.radiusMiles}-mile radius • {years}-year public observation search</span>
      </div>

      {data.sightings.length > 0 ? (
        <div className={styles.sightingList}>
          {data.sightings.slice(0, 4).map((sighting) => (
            <PredatorRow key={sighting.id} sighting={sighting} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <PawPrint size={22} />
          <p>No public black bear or mountain lion observations were returned inside this radius for the selected period.</p>
        </div>
      )}

      <div className={styles.locationLine}>
        <Info size={13} />
        <span>{data.note}</span>
      </div>

      <a
        href={data.officialGuidanceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.habitatItem}
      >
        <span>Arizona Game and Fish wildlife guidance</span>
        <small>Official response and coexistence information</small>
      </a>

      <div className={styles.healthBar}>
        <span className={styles.healthItem}>
          <span
            className={`${styles.healthDot} ${
              data.sourceHealth === 'ok'
                ? styles.dotOk
                : data.sourceHealth === 'degraded'
                  ? styles.dotDegraded
                  : styles.dotError
            }`}
          />
          <span className={styles.healthLabel}>iNaturalist</span>
          <span className={styles.healthStatus}>{data.sourceHealth}</span>
        </span>
        <span className={styles.lastChecked}>
          {new Date(data.lastChecked).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Phoenix',
          })}
        </span>
      </div>
    </div>
  );
}
