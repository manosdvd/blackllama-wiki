'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, PawPrint } from 'lucide-react';
import type {
  PredatorSighting,
  PredatorSourceHealth,
  PredatorWatchResponse,
} from '@/app/api/wildlife/predators/route';
import styles from './BearAlertHUD.module.css';

const ALERT_RADIUS_MILES = 5;
const EMERGENCY_RADIUS_MILES = 1;
const ALERT_LOOKBACK_DAYS = 90;
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CACHE_KEY = 'bearHudAlertCache';

interface BearAlertCache {
  cachedAt: string;
  sourceHealth: PredatorSourceHealth;
  sightings: PredatorSighting[];
}

function isQualifyingBearSighting(sighting: PredatorSighting) {
  return sighting.species === 'black-bear'
    && sighting.approximateLocation === false
    && typeof sighting.distanceMiles === 'number'
    && sighting.distanceMiles <= ALERT_RADIUS_MILES
    && typeof sighting.ageDays === 'number'
    && sighting.ageDays <= ALERT_LOOKBACK_DAYS;
}

function sightingTimestamp(sighting: PredatorSighting) {
  if (!sighting.observedAt) return 0;
  return Date.parse(sighting.observedAt) || 0;
}

function sortSightings(a: PredatorSighting, b: PredatorSighting) {
  const aEmergency = (a.distanceMiles ?? Infinity) <= EMERGENCY_RADIUS_MILES ? 1 : 0;
  const bEmergency = (b.distanceMiles ?? Infinity) <= EMERGENCY_RADIUS_MILES ? 1 : 0;
  if (aEmergency !== bEmergency) return bEmergency - aEmergency;

  const distanceDifference = (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
  if (distanceDifference !== 0) return distanceDifference;

  return sightingTimestamp(b) - sightingTimestamp(a);
}

function formatObserved(value?: string) {
  if (!value) return 'date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Phoenix',
  });
}

function ageLabel(ageDays?: number) {
  if (ageDays === 0) return 'today';
  if (ageDays === 1) return '1 day ago';
  if (typeof ageDays === 'number') return `${ageDays} days ago`;
  return 'date unavailable';
}

function readCache(): BearAlertCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BearAlertCache;
    const cachedAt = Date.parse(parsed.cachedAt);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }
    if (!Array.isArray(parsed.sightings)) return null;
    return {
      ...parsed,
      sightings: parsed.sightings.filter(isQualifyingBearSighting),
    };
  } catch {
    window.localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export default function BearAlertHUD() {
  const [sightings, setSightings] = useState<PredatorSighting[]>([]);
  const [sourceHealth, setSourceHealth] = useState<PredatorSourceHealth>('degraded');

  useEffect(() => {
    const cached = readCache();
    if (!cached) return;
    setSightings(cached.sightings);
    setSourceHealth(cached.sourceHealth);
  }, []);

  const fetchBearAlerts = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/wildlife/predators?radiusMiles=${ALERT_RADIUS_MILES}&lookbackDays=${ALERT_LOOKBACK_DAYS}`,
      );
      if (!response.ok) throw new Error(`Predator API returned ${response.status}`);

      const data = await response.json() as PredatorWatchResponse;
      const qualifying = data.sightings
        .filter(isQualifyingBearSighting)
        .sort(sortSightings);

      setSightings(qualifying);
      setSourceHealth(data.sourceHealth);
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        cachedAt: data.lastChecked,
        sourceHealth: data.sourceHealth,
        sightings: qualifying,
      } satisfies BearAlertCache));
    } catch (error) {
      console.error('Bear HUD alert fetch failed:', error);
      setSourceHealth('error');
    }
  }, []);

  useEffect(() => {
    void fetchBearAlerts();
    const interval = window.setInterval(fetchBearAlerts, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchBearAlerts]);

  const strongestSighting = useMemo(
    () => [...sightings].sort(sortSightings)[0],
    [sightings],
  );

  if (!strongestSighting || typeof strongestSighting.distanceMiles !== 'number') return null;

  const isEmergency = strongestSighting.distanceMiles <= EMERGENCY_RADIUS_MILES;
  const reportCount = sightings.length;
  const reportWord = reportCount === 1 ? 'report' : 'reports';
  const title = isEmergency
    ? 'EMERGENCY: BEAR REPORTED WITHIN 1 MILE'
    : 'BEAR ALERT: REPORT WITHIN 5 MILES';
  const action = isEmergency
    ? 'Notify camp leadership immediately and activate the wildlife response plan.'
    : 'Notify camp leadership and review bear precautions.';
  const message = `${strongestSighting.commonName} publicly reported ${strongestSighting.distanceMiles.toFixed(1)} mi from camp on ${formatObserved(strongestSighting.observedAt)} (${ageLabel(strongestSighting.ageDays)}). ${reportCount} qualifying ${reportWord} in the last ${ALERT_LOOKBACK_DAYS} days. ${action} This is not live tracking.`;

  return (
    <section
      className={`${styles.banner} ${isEmergency ? styles.emergency : styles.alert}`}
      role={isEmergency ? 'alert' : 'status'}
      aria-live={isEmergency ? 'assertive' : 'polite'}
      aria-label={title}
    >
      <div className={styles.iconWrap} aria-hidden="true">
        {isEmergency ? <AlertTriangle size={24} /> : <PawPrint size={24} />}
      </div>
      <div className={styles.content}>
        <div className={styles.headingRow}>
          <strong>{title}</strong>
          <span className={styles.sourceTag}>iNaturalist public observation</span>
          <span className={`${styles.healthTag} ${styles[sourceHealth]}`}>{sourceHealth}</span>
        </div>
        <p>{message}</p>
      </div>
      <a
        href={strongestSighting.observationUrl || 'https://www.inaturalist.org/observations'}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.sourceLink}
        aria-label="Open the public bear observation"
      >
        <span>View report</span>
        <ExternalLink size={15} />
      </a>
    </section>
  );
}
