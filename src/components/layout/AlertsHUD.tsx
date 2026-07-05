'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './AlertsHUD.module.css';
import {
  AlertTriangle, Flame, CloudLightning, Info,
  Wind, Droplets, ThermometerSun, MapPin, CheckCircle, Satellite,
  Trees, Activity, ChevronLeft, ChevronRight, Clock,
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
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

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
    if (!data || data.alerts.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % data.alerts.length);
    }, 12000);
    return () => clearInterval(interval);
  }, [data]);

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
    return (
      <span className={styles.healthDotWrapper}>
        <span className={`${styles.healthDot} ${cls}`} aria-hidden="true" title={label} />
        <span className={styles.healthDotLabel}>{label}</span>
      </span>
    );
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
  const activeAlertIndex = Math.min(currentIndex, Math.max(alerts.length - 1, 0));
  const activeLevel = isAllClear ? 'normal' : alerts[0]?.level || 'info';

  const nextAlert = () => {
    if (alerts.length <= 1) return;
    setCurrentIndex(prev => (prev + 1) % alerts.length);
  };

  const previousAlert = () => {
    if (alerts.length <= 1) return;
    setCurrentIndex(prev => (prev - 1 + alerts.length) % alerts.length);
  };

  const renderWeatherBlock = () => (
    <button
      type="button"
      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
      className={`${styles.weatherBlock} ${styles.weatherButton} ${isDetailsExpanded ? styles.weatherActive : ''}`}
      aria-expanded={isDetailsExpanded}
      aria-controls="hud-details-panel"
      title="Click for detailed weather and coordinates"
    >
      <ThermometerSun size={16} />
      <span className={styles.weatherTemp}>{weather?.temp || '--'}</span>
      <span className={styles.weatherCond}>({weather?.condition || 'Weather unavailable'}) • Click for Details</span>
    </button>
  );

  const renderAlertCard = (alert: FireAlertItem, index: number) => {
    const cardContent = (
      <>
        <div className={styles.hudIconWrapper}>
          {getIcon(alert.level, alert.source)}
        </div>
        <div className={styles.hudContent}>
          <div className={styles.hudHeader}>
            <span className={styles.hudSource}>{alert.title}</span>
            {alert.source && (
              <span className={styles.sourceTag}>{SOURCE_LABELS[alert.source] ?? alert.source}</span>
            )}
          </div>
          <p className={styles.hudMessage}>{alert.message}</p>
          {alert.url && (
            <span className={styles.alertLinkFake}>
              View official source ↗
            </span>
          )}
        </div>
      </>
    );

    const cardClass = `${styles.alertCard} ${styles[alert.level] || styles.info} ${index === activeAlertIndex ? styles.activeAlert : ''} ${alert.url ? styles.clickableAlertCard : ''}`;

    if (alert.url) {
      return (
        <a
          key={alert.id}
          href={alert.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cardClass}
        >
          {cardContent}
        </a>
      );
    }

    return (
      <article key={alert.id} className={cardClass}>
        {cardContent}
      </article>
    );
  };

  return (
    <div className={styles.hudContainer}>
      <div className={`${styles.hudBar} ${styles[activeLevel] || styles.info} ${isAllClear ? styles.allClearMode : styles.alertMode}`}>
        {isAllClear ? (
          <>
            {renderWeatherBlock()}
            <div className={styles.allClearPanel}>
              <CheckCircle className={styles.icon} />
              <div className={styles.hudContent}>
                <div className={styles.hudHeader}>
                  <span className={styles.hudSource}>No active emergency alerts</span>
                  <span className={styles.sourceTag}>Camp Lawton</span>
                </div>
                <p className={styles.hudMessage}>
                  {weather?.detailedForecast || 'Fire, weather, smoke, and forest feeds are nominal for the Camp Lawton area.'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.mobileAlertArrow}
              onClick={previousAlert}
              disabled={alerts.length <= 1}
              aria-label="Previous alert"
            >
              <ChevronLeft size={18} />
            </button>

            <div className={styles.alertQueue}>
              {alerts.map(renderAlertCard)}
            </div>

            <button
              type="button"
              className={styles.mobileAlertArrow}
              onClick={nextAlert}
              disabled={alerts.length <= 1}
              aria-label="Next alert"
            >
              <ChevronRight size={18} />
            </button>

            {renderWeatherBlock()}
          </>
        )}

        {!isAllClear && alerts.length > 1 && (
          <div className={styles.mobileAlertCounter}>
            {activeAlertIndex + 1} / {alerts.length}
          </div>
        )}
      </div>

      {/* Collapsible Station Details Drawer (Move coordinate/elevation clutter here) */}
      {isDetailsExpanded && (
        <div id="hud-details-panel" className={styles.detailsPanel} aria-label="Detailed Weather and Station Info">
          <div className={styles.detailsGrid}>
            <div className={styles.detailsColumn}>
              <h4>Station & Coordinates</h4>
              <div className={styles.detailsItem}>
                <MapPin size={14} />
                <span><strong>Location:</strong> Mount Lemmon (7,950 ft elevation)</span>
              </div>
              <div className={styles.detailsItem}>
                <MapPin size={14} />
                <span><strong>Coordinates:</strong> 32.398° N, 110.725° W</span>
              </div>
              {currentTime && (
                <div className={styles.detailsItem}>
                  <Clock size={14} />
                  <span><strong>Station Time:</strong> {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Phoenix' })} MST</span>
                </div>
              )}
            </div>

            <div className={styles.detailsColumn}>
              <h4>Detailed Weather Conditions</h4>
              <div className={styles.detailsItem}>
                <Wind size={14} />
                <span><strong>Wind Speed:</strong> {weather?.wind || '--'}</span>
              </div>
              <div className={styles.detailsItem}>
                <Droplets size={14} />
                <span><strong>Humidity:</strong> {weather?.humidity || '--'}</span>
              </div>
              <div className={styles.detailsItem}>
                <CloudLightning size={14} />
                <span><strong>Precipitation:</strong> {weather?.precipChance || '--'}</span>
              </div>
              <div className={styles.detailsItem}>
                <ThermometerSun size={14} />
                <span><strong>Condition:</strong> {weather?.detailedForecast || 'Detailed forecast unavailable.'}</span>
              </div>
              <a
                href="https://forecast.weather.gov/MapClick.php?lat=32.39806&amp;lon=-110.725"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.nwsExternalLink}
              >
                Open Official NWS Forecast Page ↗
              </a>
            </div>
          </div>
        </div>
      )}

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
