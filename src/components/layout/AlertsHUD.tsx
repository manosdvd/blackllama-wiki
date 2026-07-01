'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './AlertsHUD.module.css';
import { AlertTriangle, Flame, CloudLightning, Info, Pause, Play } from 'lucide-react';

type AlertLevel = 'info' | 'warning' | 'critical' | 'fire';

interface Alert {
  id: string;
  level: AlertLevel;
  message: string;
  source: string;
  timestamp: string;
}

export default function AlertsHUD() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real NWS alerts for Mt Lemmon
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const response = await fetch('https://api.weather.gov/alerts/active?point=32.39806,-110.725', {
          headers: {
            'User-Agent': '(camplawton.org, contact@camplawton.org)' // NWS requires a User-Agent
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch NWS alerts');
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const formattedAlerts: Alert[] = data.features.map((feature: any) => {
            const props = feature.properties;
            
            // Map severity to our internal levels
            let level: AlertLevel = 'info';
            if (props.severity === 'Extreme' || props.severity === 'Severe') level = 'critical';
            if (props.severity === 'Moderate') level = 'warning';
            
            // Detect Fire specifically
            if (props.event && props.event.toLowerCase().includes('fire')) {
              level = 'fire';
            }

            return {
              id: props.id,
              level,
              message: props.headline || props.event,
              source: props.senderName || 'NWS',
              timestamp: props.sent
            };
          });
          setAlerts(formattedAlerts);
        } else {
          // No active alerts, we can leave the array empty or provide a mock for testing
          setAlerts([]);
        }
      } catch (err) {
        console.error('Error fetching alerts:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAlerts();
    
    // Poll every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (alerts.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % alerts.length);
    }, 8000); // Rotate every 8 seconds
    return () => clearInterval(interval);
  }, [alerts, isPaused]);

  if (isLoading) {
    return (
      <div className={styles.hudContainer}>
        <div className={styles.hudBarEmpty}>
          <span className={styles.pulseIndicator}></span>
          <span>CONNECTING TO SATELLITE...</span>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className={styles.hudContainer}>
        <div className={styles.hudBarEmpty}>
          <span className={styles.pulseIndicatorNominal}></span>
          <span>SYSTEMS NOMINAL - NO ACTIVE EMERGENCY ALERTS</span>
        </div>
      </div>
    );
  }

  const currentAlert = alerts[currentIndex];

  const getIcon = (level: AlertLevel) => {
    switch (level) {
      case 'fire': return <Flame className={styles.icon} />;
      case 'critical': return <AlertTriangle className={styles.icon} />;
      case 'warning': return <CloudLightning className={styles.icon} />;
      case 'info': return <Info className={styles.icon} />;
      default: return <Info className={styles.icon} />;
    }
  };

  return (
    <div className={styles.hudContainer}>
      <div className={`${styles.hudBar} ${styles[currentAlert.level]}`}>
        <div className={styles.hudIconWrapper}>
          {getIcon(currentAlert.level)}
        </div>
        <div className={styles.hudContent}>
          <div className={styles.hudHeader}>
            <span className={styles.hudSource}>{currentAlert.source}</span>
          </div>
          <p className={styles.hudMessage}>{currentAlert.message}</p>
        </div>
        <div className={styles.hudControls}>
          <span className={styles.hudCounter}>
            {currentIndex + 1} / {alerts.length}
          </span>
          {alerts.length > 1 && (
            <button 
              className={styles.togglePauseBtn}
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume Rotation" : "Freeze Rotation"}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
