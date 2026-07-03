'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './AlertsHUD.module.css';
import {
  AlertTriangle, Flame, CloudLightning, Info, Pause, Play,
  Wind, Droplets, ThermometerSun, MapPin, CheckCircle, Satellite,
  Trees, Activity,
} from 'lucide-react';
import type {
  FireAggregatorResponse,
  FireAlertItem,
  FireAlertLevel,
  FireAlertSource,
  SourceHealthStatus,
  WeatherSnapshot,
} from '@/app/api/alerts/fire/route';

const SOURCE_HEALTH_ORDER: FireAlertSource[] = ['NWS', 'USFS', 'FIRMS', 'WFIGS', 'AIRNOW'];

const SOURCE_LABELS: Record<FireAlertSource, string> = {
  NWS: 'NWS',
  USFS: 'USFS',
  FIRMS: 'FIRMS',
  WFIGS: 'WFIGS',
  NOAA_HMS: 'HMS',
  AIRNOW: 'AirNow',
};

export default function AlertsHUD() {
  const [data, setData] = useState<FireAggregatorResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // 1. Live clock — client-only to avoid hydration mismatch
  useEffect(() => {
    setTimeout(() => setCurrentTime(new Date()), 0);
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // 2. Load from localStorage cache immediately for instant render
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = localStorage.getItem('fireAlertCache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as FireAggregatorResponse;
        setTimeout(() => {
          setData(parsed);
          setIsLoading(false);
        }, 0);
      } catch {
        // ignore corrupt cache
      }
    }
  }, []);

  // 3. Fetch live data from unified aggregator
  const fetchFireData = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/fire');
      if (!res.ok) throw new Error(`Fire API returned ${res.status}`);
      const fresh = (await res.json()) as FireAggregatorResponse;
      setData(fresh);
      setIsLoading(false);
      localStorage.setItem('fireAlertCache', JSON.stringify(fresh));
    } catch (err) {
      console.error('Fire alert fetch failed:', err);
      // Already showing cached data if available; don't clear it
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchFireData();
    }, 0);
    const interval = setInterval(fetchFireData, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchFireData]);

  // 4. Auto-rotate through alerts
  useEffect(() => {
    if (!data || data.alerts.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % data.alerts.length);
    }, 12000);
    return () => clearInterval(interval);
  }, [data, isPaused]);

  // Reset index when alert list changes
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [data?.alerts.length]);

  // ─── Render helpers ──────────────────────────────────────────────────────

  const getIcon = (level: FireAlertLevel, source?: FireAlertSource) => {
    if (source === 'FIRMS') return <Satellite className={styles.icon} />;
    if (source === 'WFIGS') return <Flame className={`${styles.icon} ${styles.warnIcon}`} />;
    if (source === 'AIRNOW') return <Wind className={styles.icon} />;
    if (source === 'USFS') return <Trees className={styles.icon} />;
    switch (level) {
      case 'evacuation':
      case 'critical': return <AlertTriangle className={styles.icon} />;
      case 'warning': return <Flame className={styles.icon} />;
      case 'watch': return <CloudLightning className={styles.icon} />;
      case 'normal': return <CheckCircle className={styles.icon} />;
      default: return <Info className={styles.icon} />;
    }
  };

  const healthDot = (status: SourceHealthStatus) => {
    const cls = {
      ok: styles.dotOk,
      degraded: styles.dotDegraded,
      error: styles.dotError,
      'missing-key': styles.dotMissing,
    }[status] || styles.dotMissing;
    const label = { ok: 'OK', degraded: 'Delayed', error: 'Error', 'missing-key': 'No Key' }[status];
    return <span className={`${styles.healthDot} ${cls}`} title={label} />;
  };

  // ─── Loading state ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={styles.hudContainer}>
        <div className={styles.hudBarEmpty}>
          <span className={styles.pulseIndicator} />
          <span>Connecting to fire &amp; weather intelligence feeds...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const alerts: FireAlertItem[] = data.alerts;
  const weather: WeatherSnapshot | null = data.weather;
  const isAllClear = alerts.length === 0;

  let currentAlert: FireAlertItem;
  if (isAllClear) {
    currentAlert = {
      id: 'nominal-weather',
      level: 'normal',
      source: 'NWS',
      title: 'Mt. Lemmon Weather Forecast',
      message: weather ? weather.detailedForecast : 'No active emergency alerts for the Camp Lawton area.',
      updatedAt: new Date().toISOString(),
      confidence: 'official',
      actionability: 'monitor',
    };
  } else {
    currentAlert = alerts[Math.min(currentIndex, alerts.length - 1)] || null;
  }

  if (!currentAlert) return null;

  return (
    <div className={styles.hudContainer}>
      <div className={`${styles.hudBar} ${styles[currentAlert.level] || styles.info}`}>

        {/* Icon */}
        <div className={styles.hudIconWrapper}>
          {getIcon(currentAlert.level, currentAlert.source)}
        </div>

        {/* Main content */}
        <div className={styles.hudContent}>
          <div className={styles.hudHeader}>
            <span className={styles.hudSource}>{currentAlert.title}</span>
            {currentAlert.source && (
              <span className={styles.sourceTag}>{SOURCE_LABELS[currentAlert.source] ?? currentAlert.source}</span>
            )}
          </div>
          <p className={styles.hudMessage}>{currentAlert.message}</p>
          {currentAlert.url && (
            <a href={currentAlert.url} target="_blank" rel="noopener noreferrer" className={styles.alertLink}>
              View official source ↗
            </a>
          )}
        </div>

        {/* Weather snapshot — shown when available */}
        {weather && (
          <div className={styles.weatherBlock}>
            <div className={styles.weatherPrimary}>
              <ThermometerSun size={14} />
              <span className={styles.weatherTemp}>{weather.temp}</span>
              <span className={styles.weatherCond}>{weather.condition}</span>
            </div>
            <div className={styles.weatherStats}>
              <span><Wind size={11} /> {weather.wind}</span>
              <span><Droplets size={11} /> {weather.humidity}</span>
              <span>Rain: {weather.precipChance}</span>
            </div>
          </div>
        )}

        {/* Location + time */}
        <div className={styles.locationBlock}>
          <div className={styles.locStats}>
            <span><MapPin size={11} /> 32.398° N, 110.725° W</span>
            <span>7,950 ft</span>
            {currentTime && (
              <span>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' })} MST</span>
            )}
          </div>
        </div>

        {/* Controls */}
        {!isAllClear && alerts.length > 1 && (
          <div className={styles.hudControls}>
            <span className={styles.hudCounter}>{currentIndex + 1} / {alerts.length}</span>
            <button
              className={styles.togglePauseBtn}
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume Rotation' : 'Freeze Rotation'}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
        )}
      </div>

      {/* Source health footer */}
      <div className={styles.sourceHealthBar}>
        {isAllClear ? (
          <span className={styles.allClearBadge}>✓ All Clear</span>
        ) : (
          <Activity size={10} className={styles.sourceHealthIcon} />
        )}
        {isAllClear && <span className={styles.sourceHealthDivider} />}
        {SOURCE_HEALTH_ORDER.map(src => (
          <span key={src} className={styles.sourceHealthItem}>
            {healthDot(data.sourceHealth[src])}
            <span className={styles.sourceHealthLabel}>{SOURCE_LABELS[src]}</span>
          </span>
        ))}
        {data.lastChecked && (
          <span className={styles.lastChecked}>
            Checked: {new Date(data.lastChecked).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' })}
          </span>
        )}
      </div>
    </div>
  );
}
