'use client';

import React, { useState, useEffect } from 'react';
import styles from './AlertsHUD.module.css';
import { AlertTriangle, Flame, CloudLightning, Info, Pause, Play, Wind, Droplets, ThermometerSun, MapPin } from 'lucide-react';

type AlertLevel = 'info' | 'warning' | 'critical' | 'fire' | 'fireRed' | 'weather';

interface Alert {
  id: string;
  level: AlertLevel;
  message: string;
  source: string;
  timestamp: string;
  weatherDetails?: {
    temp: string;
    condition: string;
    wind: string;
    humidity: string;
    precip: string;
    forecast: string;
    fetchedAt?: string;
  };
}

export default function AlertsHUD() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // 1. Ticking current time client-side only (avoid hydration mismatch)
  useEffect(() => {
    setCurrentTime(new Date());
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // 2. Load cache immediately on launch (if available) to show instantly
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('cachedWeather');
      if (cached) {
        try {
          const cachedAlert = JSON.parse(cached);
          cachedAlert.source = 'Mt. Lemmon Conditions (Offline Cache)';
          setAlerts([cachedAlert]);
          setIsLoading(false);
        } catch (e) {
          console.error('Failed to parse cached weather on launch', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    async function fetchAllData() {
      try {
        const fetchedAlerts: Alert[] = [];
        const headers = { 'User-Agent': '(camplawton.org, contact@camplawton.org)' };

        // 1. Fetch NWS Alerts
        try {
          const nwsAlertsRes = await fetch('https://api.weather.gov/alerts/active?point=32.39806,-110.725', { headers });
          if (nwsAlertsRes.ok) {
            const data = await nwsAlertsRes.json();
            if (data.features) {
              data.features.forEach((feature: any) => {
                const props = feature.properties;
                let level: AlertLevel = 'info';
                
                if (props.severity === 'Extreme' || props.severity === 'Severe') level = 'critical';
                if (props.severity === 'Moderate') level = 'warning';
                
                const eventName = (props.event || '').toLowerCase();
                if (eventName.includes('fire')) level = 'fire';
                if (eventName.includes('red flag warning')) level = 'fireRed';

                fetchedAlerts.push({
                  id: props.id,
                  level,
                  message: props.headline || props.event,
                  source: props.senderName || 'NWS Weather Alert',
                  timestamp: props.sent
                });
              });
            }
          }
        } catch (e) { console.error('NWS Alerts err', e); }

        // 2. Fetch Coronado Alerts
        try {
          const fsRes = await fetch('/api/alerts/coronado');
          if (fsRes.ok) {
            const fsData = await fsRes.json();
            if (fsData.alerts && fsData.alerts.length > 0) {
              fsData.alerts.forEach((alert: any) => fetchedAlerts.push(alert));
            }
          }
        } catch (e) { console.error('FS Alerts err', e); }

        // 3. Fetch Detailed NWS Weather (Gridpoint TWC/101,56)
        let weatherLoaded = false;
        try {
          // Current Forecast
          const forecastRes = await fetch('https://api.weather.gov/gridpoints/TWC/101,56/forecast', { headers });
          if (forecastRes.ok) {
            const data = await forecastRes.json();
            if (data.properties && data.properties.periods && data.properties.periods.length > 0) {
              const currentPeriod = data.properties.periods[0];
              const nextPeriods = data.properties.periods.slice(1, 6);
              
              // Build a 5 day string for desktop
              const forecastStr = nextPeriods.map((p: any) => `${p.name}: ${p.temperature}°${p.temperatureUnit}`).join(' | ');

              const weatherAlert: Alert = {
                id: 'nws-current-weather',
                level: 'weather',
                message: currentPeriod.detailedForecast,
                source: 'Mt. Lemmon Current Conditions',
                timestamp: currentPeriod.startTime,
                weatherDetails: {
                  temp: `${currentPeriod.temperature}°${currentPeriod.temperatureUnit}`,
                  condition: currentPeriod.shortForecast,
                  wind: currentPeriod.windSpeed,
                  humidity: currentPeriod.relativeHumidity?.value ? `${currentPeriod.relativeHumidity.value}%` : 'N/A',
                  precip: currentPeriod.probabilityOfPrecipitation?.value ? `${currentPeriod.probabilityOfPrecipitation.value}%` : '0%',
                  forecast: forecastStr,
                  fetchedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
              };
              
              fetchedAlerts.unshift(weatherAlert);
              localStorage.setItem('cachedWeather', JSON.stringify(weatherAlert));
              weatherLoaded = true;
            }
          }
        } catch (e) {
          console.warn('NWS Weather fetch failed, attempting to load from cache', e);
        }

        if (!weatherLoaded) {
          const cached = localStorage.getItem('cachedWeather');
          if (cached) {
            try {
              const cachedAlert = JSON.parse(cached);
              // Prepend [CACHED] or similar to indicate it's not live, or just show it
              cachedAlert.source = 'Mt. Lemmon Conditions (Offline Cache)';
              fetchedAlerts.unshift(cachedAlert);
              weatherLoaded = true;
            } catch (e) { console.error('Failed to parse cached weather', e); }
          }
        }

        if (!weatherLoaded) {
          fetchedAlerts.unshift({
            id: 'nws-no-weather',
            level: 'info',
            message: 'No Weather Information Available at this time.',
            source: 'Mt. Lemmon Conditions',
            timestamp: new Date().toISOString()
          });
        }

        // If nothing was fetched and no weather loaded (which shouldn't happen now since we fallback to "No weather"), 
        // add a default fallback so it doesn't say "connecting to satellite"
        if (fetchedAlerts.length === 0) {
          fetchedAlerts.push({
            id: 'fallback-nominal',
            level: 'info',
            message: 'No Active Emergency Alerts.',
            source: 'Lawton Hub',
            timestamp: new Date().toISOString()
          });
        }

        setAlerts(fetchedAlerts);
      } catch (err) {
        console.error('Error fetching alerts dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllData();
    const interval = setInterval(fetchAllData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (alerts.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % alerts.length);
    }, 12000); // Slower rotation for weather
    return () => clearInterval(interval);
  }, [alerts, isPaused]);

  if (isLoading) {
    return (
      <div className={styles.hudContainer}>
        <div className={styles.hudBarEmpty}>
          <span className={styles.pulseIndicator}></span>
          <span>Loading Weather and Safety Feeds...</span>
        </div>
      </div>
    );
  }

  const currentAlert = alerts[currentIndex];

  const getIcon = (level: AlertLevel) => {
    switch (level) {
      case 'fire':
      case 'fireRed': return <Flame className={styles.icon} />;
      case 'critical': return <AlertTriangle className={styles.icon} />;
      case 'warning': return <CloudLightning className={styles.icon} />;
      case 'weather': return <ThermometerSun className={styles.icon} />;
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

          {currentAlert.level === 'weather' && currentAlert.weatherDetails ? (
            <div className={styles.weatherBlock}>
              <div className={styles.weatherPrimary}>
                <span className={styles.weatherTemp}>{currentAlert.weatherDetails.temp}</span>
                <span className={styles.weatherCond}>{currentAlert.weatherDetails.condition}</span>
              </div>
              <div className={styles.weatherStats}>
                <span><Wind size={12}/> {currentAlert.weatherDetails.wind}</span>
                <span><Droplets size={12}/> Hum: {currentAlert.weatherDetails.humidity}</span>
                <span>Precip: {currentAlert.weatherDetails.precip}</span>
              </div>
              <div className={styles.weatherTimeBlock}>
                {currentTime && (
                  <span className={styles.timeItem}>
                    <strong>Time:</strong> {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {currentAlert.weatherDetails.fetchedAt && (
                  <span className={styles.timeItem}>
                    <strong>Updated:</strong> {currentAlert.weatherDetails.fetchedAt}
                  </span>
                )}
              </div>
              <div className={styles.weatherForecastDesktop}>
                <strong>Forecast:</strong> {currentAlert.weatherDetails.forecast}
              </div>
            </div>
          ) : (
             <p className={styles.hudMessage}>{currentAlert.message}</p>
          )}
        </div>

        <div className={styles.locationBlock}>
          <div className={styles.locStats}>
             <span><MapPin size={12}/> 32.398° N, -110.725° W</span>
             <span>Alt: 7,950 ft</span>
          </div>
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
