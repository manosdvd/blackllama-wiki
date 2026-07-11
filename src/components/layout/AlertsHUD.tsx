'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './AlertsHUD.module.css';
import {
  AlertTriangle, Flame, CloudLightning, Info,
  Wind, Droplets, ThermometerSun, MapPin, CheckCircle,
  Trees, Activity, ChevronLeft, ChevronRight, Clock, Radio,
} from 'lucide-react';
import type {
  FireAggregatorResponse,
  FireAlertItem,
  FireAlertLevel,
  FireAlertSource,
  SourceHealthStatus,
  WeatherSnapshot,
} from '@/app/api/alerts/fire/route';

const SOURCE_HEALTH_ORDER: FireAlertSource[] = ['NWS', 'USFS', 'WFIGS', 'PIMA_GIS', 'WILDCAD'];

const SOURCE_LABELS: Record<FireAlertSource, string> = {
  NWS: 'NWS',
  USFS: 'USFS',
  WFIGS: 'WFIGS',
  WILDCAD: 'WildCAD',
  PIMA_GIS: 'PimaGIS',
};

const SOURCE_FALLBACK_URLS: Record<FireAlertSource, string> = {
  NWS: 'https://forecast.weather.gov/MapClick.php?lat=32.39806&lon=-110.725',
  USFS: 'https://www.fs.usda.gov/r03/coronado/alerts',
  WFIGS: 'https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-interagency-fire-perimeters/about',
  WILDCAD: 'https://www.wildwebe.net/?dc_name=AZTDC',
  PIMA_GIS: 'https://gisopendata.pima.gov/datasets/pima-county-cwpp-fire-perimeters/about',
};

function alertTimestamp(alert: FireAlertItem) {
  const parsed = Date.parse(alert.observedAt || alert.updatedAt || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isCurrentAlertSource(source: string): source is FireAlertSource {
  return Object.prototype.hasOwnProperty.call(SOURCE_LABELS, source);
}

function sanitizeFireData(data: FireAggregatorResponse): FireAggregatorResponse {
  return {
    ...data,
    alerts: Array.isArray(data.alerts)
      ? data.alerts.filter(alert => isCurrentAlertSource(String(alert.source)))
      : [],
  };
}

export default function AlertsHUD() {
  const [data, setData] = useState<FireAggregatorResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const alertRefs = useRef<Record<string, HTMLElement | null>>({});

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
        const parsed = sanitizeFireData(JSON.parse(cached) as FireAggregatorResponse);
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
      const fresh = sanitizeFireData((await res.json()) as FireAggregatorResponse);
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
    const interval = setInterval(fetchFireData, 15 * 60 * 1000);
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
    if (source === 'WFIGS') return <Flame className={`${styles.icon} ${styles.warnIcon}`} />;
    if (source === 'PIMA_GIS') return <MapPin className={styles.icon} />;
    if (source === 'USFS') return <Trees className={styles.icon} />;
    if (source === 'WILDCAD') return <Radio className={styles.icon} />;
    switch (level) {
      case 'evacuation':
      case 'critical': return <AlertTriangle className={styles.icon} />;
      case 'warning': return <Flame className={styles.icon} />;
      case 'watch': return <CloudLightning className={styles.icon} />;
      case 'normal': return <CheckCircle className={styles.icon} />;
      default: return <Info className={styles.icon} />;
    }
  };

  const healthDot = (status?: SourceHealthStatus) => {
    const normalizedStatus = status ?? 'degraded';
    const cls = {
      ok: styles.dotOk,
      degraded: styles.dotDegraded,
      error: styles.dotError,
    }[normalizedStatus] || styles.dotMissing;
    const label = { ok: 'OK', degraded: 'Delayed', error: 'Error' }[normalizedStatus];
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

  const latestAlertForSource = (source: FireAlertSource) => {
    return alerts
      .map((alert, index) => ({ alert, index }))
      .filter(({ alert }) => alert.source === source)
      .sort((a, b) => alertTimestamp(b.alert) - alertTimestamp(a.alert))[0];
  };

  const openFallbackSource = (source: FireAlertSource) => {
    window.open(SOURCE_FALLBACK_URLS[source], '_blank', 'noopener,noreferrer');
  };

  const handleSourceHealthClick = (source: FireAlertSource) => {
    const match = latestAlertForSource(source);
    if (!match) {
      openFallbackSource(source);
      return;
    }

    setCurrentIndex(match.index);
    window.setTimeout(() => {
      alertRefs.current[match.alert.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }, 0);
  };

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
          ref={(node) => { alertRefs.current[alert.id] = node; }}
          className={cardClass}
        >
          {cardContent}
        </a>
      );
    }

    return (
      <article
        key={alert.id}
        ref={(node) => { alertRefs.current[alert.id] = node; }}
        className={cardClass}
      >
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

      {/* Spectacular Full-Screen / Large Modal Weather & Forecast */}
      {isDetailsExpanded && (
        <div className={styles.weatherModalOverlay} onClick={() => setIsDetailsExpanded(false)}>
          <div 
            id="hud-details-panel" 
            className={styles.weatherModal} 
            aria-label="Detailed Weather and Forecast"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
          >
            {/* Background Image Container */}
            <div className={styles.weatherModalBg} style={{ backgroundImage: 'url(/images/weather-bg.png)' }}>
              <div className={styles.weatherModalGradient} />
            </div>

            {/* Modal Content */}
            <div className={styles.weatherModalContent}>
              <div className={styles.weatherModalHeader}>
                <h2>Camp Lawton Weather Intelligence</h2>
                <button 
                  className={styles.weatherModalClose} 
                  onClick={() => setIsDetailsExpanded(false)}
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>

              <div className={styles.forecastContainer}>
                {/* Current Conditions Block */}
                <div className={styles.currentWeatherSection}>
                  <div className={styles.currentTempLarge}>
                    {weather?.periods?.[0]?.icon ? (
                      <img src={weather.periods[0].icon} alt="Weather Icon" className={styles.currentIcon} />
                    ) : (
                      <ThermometerSun size={64} className={styles.currentIcon} />
                    )}
                    <div className={styles.currentTempGroup}>
                      <span className={styles.currentTempText}>{weather?.temp || '--'}</span>
                      <span className={styles.currentConditionText}>{weather?.detailedForecast || 'Detailed forecast unavailable.'}</span>
                    </div>
                  </div>
                  
                  <div className={styles.currentConditionsList}>
                    <div className={styles.currentConditionItem}>
                      <div className={styles.condIcon}><Wind size={20} /></div>
                      <div className={styles.condData}>
                        <span className={styles.condLabel}>Wind</span>
                        <span className={styles.condValue}>{weather?.wind || '--'}</span>
                      </div>
                    </div>
                    <div className={styles.currentConditionItem}>
                      <div className={styles.condIcon}><Droplets size={20} /></div>
                      <div className={styles.condData}>
                        <span className={styles.condLabel}>Humidity</span>
                        <span className={styles.condValue}>{weather?.humidity || '--'}</span>
                      </div>
                    </div>
                    <div className={styles.currentConditionItem}>
                      <div className={styles.condIcon}><CloudLightning size={20} /></div>
                      <div className={styles.condData}>
                        <span className={styles.condLabel}>Precip Chance</span>
                        <span className={styles.condValue}>{weather?.precipChance || '--'}</span>
                      </div>
                    </div>
                    <div className={styles.currentConditionItem}>
                      <div className={styles.condIcon}><MapPin size={20} /></div>
                      <div className={styles.condData}>
                        <span className={styles.condLabel}>Location</span>
                        <span className={styles.condValue}>Mt Lemmon (32.398°N)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Extended Forecast Grid */}
                {weather?.periods && weather.periods.length > 0 && (
                  <div className={styles.forecastScrollWrapper}>
                    <h3 className={styles.forecastSectionTitle}>Extended Forecast</h3>
                    <div className={styles.forecastGrid}>
                      {weather.periods.slice(1, 14).map((period, idx) => (
                        <div key={idx} className={styles.forecastCard}>
                          <span className={styles.forecastDayName}>{period.name}</span>
                          {period.icon ? (
                            <img src={period.icon} alt={period.shortForecast} className={styles.forecastIcon} />
                          ) : (
                            <ThermometerSun size={32} className={styles.forecastIcon} />
                          )}
                          <span className={styles.forecastTemp}>{period.temperature}&deg;{period.temperatureUnit}</span>
                          <span className={styles.forecastShort}>{period.shortForecast}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className={styles.weatherModalFooter}>
                  {currentTime && (
                    <span className={styles.obsTime}>
                      <Clock size={14} /> Observed: {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' })} MST
                    </span>
                  )}
                  <a
                    href="https://forecast.weather.gov/MapClick.php?lat=32.39806&lon=-110.725"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.nwsExternalLink}
                  >
                    Open Official NWS Forecast ↗
                  </a>
                </div>
              </div>
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
        {SOURCE_HEALTH_ORDER.map(src => {
          const matchingAlert = latestAlertForSource(src);
          const actionLabel = matchingAlert
            ? `Show latest ${SOURCE_LABELS[src]} alert`
            : `Open ${SOURCE_LABELS[src]} source page`;
          return (
            <button
              key={src}
              type="button"
              className={`${styles.sourceHealthItem} ${matchingAlert ? styles.sourceHealthHasAlert : ''}`}
              onClick={() => handleSourceHealthClick(src)}
              aria-label={actionLabel}
              title={actionLabel}
            >
              {healthDot(data.sourceHealth[src])}
              <span className={styles.sourceHealthLabel}>{SOURCE_LABELS[src]}</span>
            </button>
          );
        })}
        {data.lastChecked && (
          <span className={styles.lastChecked}>
            Checked: {new Date(data.lastChecked).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' })}
          </span>
        )}
      </div>
    </div>
  );
}
