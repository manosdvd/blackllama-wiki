'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bird,
  ExternalLink,
  Feather,
  Info,
  Leaf,
  MapPin,
  PawPrint,
  RefreshCw,
} from 'lucide-react';
import type {
  WildlifeAggregatorResponse,
  WildlifeCautionLevel,
  WildlifeSighting,
  WildlifeSource,
  WildlifeSourceHealthStatus,
} from '@/app/api/wildlife/nearby/route';
import styles from './WildlifeWatch.module.css';

const SOURCE_ORDER: WildlifeSource[] = ['INATURALIST', 'EBIRD', 'HABIMAP'];

const SOURCE_LABELS: Record<WildlifeSource, string> = {
  INATURALIST: 'iNaturalist',
  EBIRD: 'eBird',
  HABIMAP: 'HabiMap',
};

const STATUS_LABELS: Record<WildlifeSourceHealthStatus, string> = {
  ok: 'OK',
  degraded: 'Delayed',
  error: 'Error',
  'missing-key': 'No Key',
  'needs-config': 'Config',
};

const STATUS_CLASSES: Record<WildlifeSourceHealthStatus, string> = {
  ok: styles.dotOk,
  degraded: styles.dotDegraded,
  error: styles.dotError,
  'missing-key': styles.dotMissing,
  'needs-config': styles.dotMissing,
};

function formatObserved(value?: string) {
  if (!value) return 'Recent';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Phoenix',
  });
}

function cautionClass(level: WildlifeCautionLevel) {
  return {
    caution: styles.caution,
    watch: styles.watch,
    info: styles.info,
  }[level];
}

function SightingIcon({ sighting }: { sighting: WildlifeSighting }) {
  if (sighting.cautionLevel === 'caution') return <AlertTriangle size={18} />;
  if (sighting.category === 'Bird') return <Bird size={18} />;
  if (sighting.category === 'Reptile') return <Leaf size={18} />;
  return <PawPrint size={18} />;
}

function SourceDot({ source, status }: { source: WildlifeSource; status: WildlifeSourceHealthStatus }) {
  return (
    <span className={styles.healthItem}>
      <span className={`${styles.healthDot} ${STATUS_CLASSES[status]}`} aria-hidden="true" title={STATUS_LABELS[status]} />
      <span className={styles.healthLabel}>{SOURCE_LABELS[source]}</span>
      <span className={styles.healthStatus}>{STATUS_LABELS[status]}</span>
    </span>
  );
}

function SightingRow({ sighting }: { sighting: WildlifeSighting }) {
  const photoStyle = sighting.photoUrl
    ? { backgroundImage: `url("${sighting.photoUrl.replace(/"/g, '%22')}")` }
    : undefined;

  const content = (
    <>
      <div className={`${styles.sightingIcon} ${cautionClass(sighting.cautionLevel)}`}>
        {sighting.photoUrl ? (
          <span className={styles.sightingPhoto} style={photoStyle} aria-hidden="true" />
        ) : (
          <SightingIcon sighting={sighting} />
        )}
      </div>
      <div className={styles.sightingContent}>
        <div className={styles.sightingTopLine}>
          <strong>{sighting.commonName}</strong>
          <span className={`${styles.levelBadge} ${cautionClass(sighting.cautionLevel)}`}>
            {sighting.cautionLevel}
          </span>
        </div>
        <p>{sighting.summary}</p>
        <div className={styles.sightingMeta}>
          <span>{SOURCE_LABELS[sighting.source]}</span>
          <span>{sighting.category}</span>
          <span>{formatObserved(sighting.observedAt)}</span>
          {typeof sighting.count === 'number' && <span>{sighting.count} seen</span>}
        </div>
      </div>
      {sighting.observationUrl && <ExternalLink size={14} className={styles.externalIcon} />}
    </>
  );

  if (sighting.observationUrl) {
    return (
      <a href={sighting.observationUrl} target="_blank" rel="noopener noreferrer" className={styles.sightingRow}>
        {content}
      </a>
    );
  }

  return <div className={styles.sightingRow}>{content}</div>;
}

export default function WildlifeWatch() {
  const [data, setData] = useState<WildlifeAggregatorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = window.localStorage.getItem('wildlifeWatchCache');
      if (!cached) return;
      try {
        setData(JSON.parse(cached) as WildlifeAggregatorResponse);
        setIsLoading(false);
      } catch {
        window.localStorage.removeItem('wildlifeWatchCache');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchWildlife = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/wildlife/nearby');
      if (!res.ok) throw new Error(`Wildlife API returned ${res.status}`);
      const fresh = await res.json() as WildlifeAggregatorResponse;
      setData(fresh);
      window.localStorage.setItem('wildlifeWatchCache', JSON.stringify(fresh));
    } catch (error) {
      console.error('Wildlife watch fetch failed:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchWildlife();
    }, 0);
    const interval = window.setInterval(fetchWildlife, 15 * 60 * 1000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(interval);
    };
  }, [fetchWildlife]);

  const visibleSightings = useMemo(() => {
    if (!data?.sightings.length) return [];
    const priority = data.sightings.filter((sighting) => sighting.cautionLevel !== 'info');
    return (priority.length > 0 ? priority : data.sightings).slice(0, 5);
  }, [data]);

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.pulseDot} />
        <span>Loading wildlife observations...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.emptyState}>
        <Info size={22} />
        <p>Wildlife feeds are unavailable.</p>
      </div>
    );
  }

  const miles = Math.round(data.location.radiusKm * 0.621371);

  return (
    <div className={styles.watchPanel}>
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <PawPrint size={16} />
          <strong>{data.summary.totalSightings}</strong>
          <span>sightings</span>
        </div>
        <div className={`${styles.summaryItem} ${data.summary.cautionCount > 0 ? styles.summaryWarn : ''}`}>
          <AlertTriangle size={16} />
          <strong>{data.summary.cautionCount}</strong>
          <span>priority</span>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={fetchWildlife}
          disabled={isRefreshing}
          aria-label="Refresh wildlife observations"
          title="Refresh wildlife observations"
        >
          <RefreshCw size={16} className={isRefreshing ? styles.spinning : undefined} />
        </button>
      </div>

      <div className={styles.locationLine}>
        <MapPin size={13} />
        <span>{data.location.label} radius: {miles} mi</span>
      </div>

      {visibleSightings.length > 0 ? (
        <div className={styles.sightingList}>
          {visibleSightings.map((sighting) => (
            <SightingRow key={sighting.id} sighting={sighting} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Feather size={22} />
          <p>No recent wildlife observations returned for this radius.</p>
        </div>
      )}

      {data.habitats.length > 0 && (
        <div className={styles.habitatBlock}>
          <div className={styles.habitatHeader}>
            <Leaf size={14} />
            <strong>AZGFD HabiMap</strong>
          </div>
          {data.habitats.slice(0, 2).map((record) => (
            <a key={record.id} href={record.url} target="_blank" rel="noopener noreferrer" className={styles.habitatItem}>
              <span>{record.title}</span>
              <small>{record.layerName}</small>
            </a>
          ))}
        </div>
      )}

      <div className={styles.healthBar}>
        {SOURCE_ORDER.map((source) => (
          <SourceDot key={source} source={source} status={data.sourceHealth[source]} />
        ))}
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
