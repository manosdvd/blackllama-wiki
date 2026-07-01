import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  try {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountStr) {
      const serviceAccount = JSON.parse(serviceAccountStr);
      initializeApp({
        credential: cert(serviceAccount)
      });
    } else {
       initializeApp();
    }
  } catch (e) {
    console.warn("Firebase Admin Initialization Warning:", e);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type FireAlertLevel = 'normal' | 'info' | 'watch' | 'warning' | 'critical' | 'evacuation';
export type FireAlertSource = 'NWS' | 'USFS' | 'FIRMS' | 'WFIGS' | 'NOAA_HMS' | 'AIRNOW';
export type SourceHealthStatus = 'ok' | 'degraded' | 'error' | 'missing-key';
export type Confidence = 'official' | 'high' | 'medium' | 'low';
export type Actionability = 'monitor' | 'review-plan' | 'contact-leadership' | 'follow-official-orders';

export interface FireAlertItem {
  id: string;
  level: FireAlertLevel;
  source: FireAlertSource;
  title: string;
  message: string;
  observedAt?: string;
  updatedAt: string;
  expiresAt?: string;
  distanceMilesFromCamp?: number;
  confidence: Confidence;
  actionability: Actionability;
  url?: string;
}

export interface WeatherSnapshot {
  temp: string;
  condition: string;
  wind: string;
  humidity: string;
  precipChance: string;
  forecastStrip: string;
  detailedForecast: string;
  fetchedAt: string;
}

export interface FireAggregatorResponse {
  overallLevel: FireAlertLevel;
  alerts: FireAlertItem[];
  weather: WeatherSnapshot | null;
  sourceHealth: Record<FireAlertSource, SourceHealthStatus>;
  lastChecked: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CAMP_LAT = 32.39806;
const CAMP_LON = -110.725;
// Santa Catalina Mountains FIRMS bounding box: west,south,east,north
const FIRMS_BBOX = '-111.05,32.20,-110.45,32.65';
// WFIGS ArcGIS bounding box for spatial query (xmin,ymin,xmax,ymax)
const WFIGS_BBOX = '-111.05,32.20,-110.45,32.65';

const NWS_HEADERS = {
  'User-Agent': 'CampLawtonStaffHub/1.0 (contact@camplawton.org)',
  'Accept': 'application/geo+json',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function levelToScore(level: FireAlertLevel): number {
  const scores: Record<FireAlertLevel, number> = {
    normal: 0, info: 1, watch: 2, warning: 3, critical: 4, evacuation: 5,
  };
  return scores[level];
}

function highestLevel(levels: FireAlertLevel[]): FireAlertLevel {
  return levels.reduce((best, current) =>
    levelToScore(current) > levelToScore(best) ? current : best,
    'normal' as FireAlertLevel
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

// ─── Source Fetchers ─────────────────────────────────────────────────────────

async function fetchNWSAlerts(): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${CAMP_LAT},${CAMP_LON}`,
      { headers: NWS_HEADERS, next: { revalidate: 300 } }
    );
    if (!res.ok) return { items: [], health: 'degraded' };
    const data = await res.json();

    const items: FireAlertItem[] = (data.features || []).map((feature: {
      properties: {
        id: string;
        severity: string;
        event: string;
        headline: string;
        description: string;
        senderName: string;
        sent: string;
        expires: string;
        uri: string;
      };
    }) => {
      const props = feature.properties;
      const eventLower = (props.event || '').toLowerCase();

      let level: FireAlertLevel = 'info';
      if (eventLower.includes('evacuation')) level = 'evacuation';
      else if (eventLower.includes('red flag warning') || eventLower.includes('fire weather watch') && props.severity === 'Extreme') level = 'critical';
      else if (props.severity === 'Extreme' || props.severity === 'Severe') level = 'critical';
      else if (eventLower.includes('fire') || eventLower.includes('red flag')) level = 'warning';
      else if (props.severity === 'Moderate') level = 'warning';
      else if (eventLower.includes('watch') || eventLower.includes('wind') || eventLower.includes('heat')) level = 'watch';

      const actionability: Actionability = level === 'evacuation' ? 'follow-official-orders'
        : level === 'critical' ? 'contact-leadership'
        : level === 'warning' ? 'review-plan'
        : 'monitor';

      return {
        id: props.id || `nws-${Date.now()}`,
        level,
        source: 'NWS' as FireAlertSource,
        title: props.event || 'NWS Alert',
        message: props.headline || props.description?.slice(0, 200) || props.event,
        observedAt: props.sent,
        updatedAt: props.sent,
        expiresAt: props.expires,
        confidence: 'official' as Confidence,
        actionability,
        url: props.uri,
      };
    });

    return { items, health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

async function fetchNWSWeather(): Promise<{ weather: WeatherSnapshot | null; health: SourceHealthStatus }> {
  try {
    const res = await fetch(
      'https://api.weather.gov/gridpoints/TWC/101,56/forecast',
      { headers: NWS_HEADERS, next: { revalidate: 300 } }
    );
    if (!res.ok) return { weather: null, health: 'degraded' };
    const data = await res.json();
    const periods = data?.properties?.periods || [];
    if (!periods.length) return { weather: null, health: 'degraded' };

    const current = periods[0];
    const next5 = periods.slice(1, 6);
    const forecastStrip = next5.map((p: { name: string; temperature: number; temperatureUnit: string }) =>
      `${p.name}: ${p.temperature}°${p.temperatureUnit}`
    ).join(' | ');

    return {
      weather: {
        temp: `${current.temperature}°${current.temperatureUnit}`,
        condition: current.shortForecast,
        wind: current.windSpeed || 'N/A',
        humidity: current.relativeHumidity?.value ? `${current.relativeHumidity.value}%` : 'N/A',
        precipChance: current.probabilityOfPrecipitation?.value ? `${current.probabilityOfPrecipitation.value}%` : '0%',
        forecastStrip,
        detailedForecast: current.detailedForecast || current.shortForecast || '',
        fetchedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' }),
      },
      health: 'ok',
    };
  } catch {
    return { weather: null, health: 'error' };
  }
}

async function fetchUSFSAlerts(): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  const urls = [
    'https://www.fs.usda.gov/r03/coronado/alerts',
    'https://www.fs.usda.gov/alerts/coronado/alerts-notices',
  ];

  let html = '';
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CampLawtonStaffHub/1.0 (contact@camplawton.org)' },
        next: { revalidate: 3600 },
      });
      if (res.ok) { html = await res.text(); break; }
    } catch { /* try next */ }
  }

  if (!html) return { items: [], health: 'degraded' };

  try {
    const { load } = await import('cheerio');
    const $ = load(html);
    const items: FireAlertItem[] = [];

    const levelFromText = (text: string): FireAlertLevel => {
      const t = text.toLowerCase();
      if (t.includes('evacuation') || t.includes('critical closure')) return 'critical';
      if (t.includes('closure') || t.includes('fire restriction') || t.includes('red flag') || t.includes('fire')) return 'warning';
      if (t.includes('caution') || t.includes('watch')) return 'watch';
      return 'info';
    };

    // Strategy 1: article / view-row items
    $('article, .view-row, .views-row').each((i, el) => {
      const title = $(el).find('h2,h3,h4,.views-field-title').first().text().trim();
      const body = $(el).find('p,.views-field-body').first().text().trim();
      const href = $(el).find('a').first().attr('href');
      if (title) {
        const level = levelFromText(title + ' ' + body);
        items.push({
          id: `usfs-${i}`,
          level,
          source: 'USFS',
          title: title.slice(0, 120),
          message: body || title,
          updatedAt: new Date().toISOString(),
          confidence: 'official',
          actionability: level === 'critical' ? 'contact-leadership' : level === 'warning' ? 'review-plan' : 'monitor',
          url: href ? (href.startsWith('http') ? href : `https://www.fs.usda.gov${href}`) : undefined,
        });
      }
    });

    // Strategy 2: list items under alert headings
    if (items.length === 0) {
      $('h2,h3').each((_, heading) => {
        const ht = $(heading).text().toLowerCase();
        if (ht.includes('alert') || ht.includes('closure') || ht.includes('restriction')) {
          $(heading).nextAll('ul').first().find('li').each((i, li) => {
            const text = $(li).text().trim();
            const href = $(li).find('a').first().attr('href');
            if (text) {
              const level = levelFromText(text);
              items.push({
                id: `usfs-li-${i}`,
                level,
                source: 'USFS',
                title: text.slice(0, 120),
                message: text,
                updatedAt: new Date().toISOString(),
                confidence: 'official',
                actionability: level === 'critical' ? 'contact-leadership' : level === 'warning' ? 'review-plan' : 'monitor',
                url: href ? (href.startsWith('http') ? href : `https://www.fs.usda.gov${href}`) : undefined,
              });
            }
          });
        }
      });
    }

    return { items: items.slice(0, 8), health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

interface FirmsRow {
  latitude: string;
  longitude: string;
  bright_ti4?: string;
  bright_t31?: string;
  frp?: string;
  confidence?: string;
  acq_date?: string;
  acq_time?: string;
}

function parseFirmsCSV(csv: string): FirmsRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i]?.trim() ?? ''; });
    return row as unknown as FirmsRow;
  });
}

async function fetchFIRMS(firmsKey: string): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  const sources = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
  const allRows: Array<FirmsRow & { sourceName: string }> = [];

  for (const src of sources) {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/${src}/${FIRMS_BBOX}/1`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (res.ok) {
        const text = await res.text();
        if (!text.includes('Invalid') && !text.includes('error')) {
          const rows = parseFirmsCSV(text);
          rows.forEach(r => allRows.push({ ...r, sourceName: src }));
        }
      }
    } catch {
      // skip source
    }
  }

  if (allRows.length === 0) {
    return { items: [], health: 'ok' };
  }

  // Cluster nearby detections — deduplicate within ~5km
  const clustered: typeof allRows = [];
  for (const row of allRows) {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;
    const isDuplicate = clustered.some(r => {
      const d = haversineKm(lat, lon, parseFloat(r.latitude), parseFloat(r.longitude));
      return d < 5;
    });
    if (!isDuplicate) clustered.push(row);
  }

  const items: FireAlertItem[] = clustered.map((row, i) => {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    const distKm = haversineKm(lat, lon, CAMP_LAT, CAMP_LON);
    const distMiles = kmToMiles(distKm);

    const level: FireAlertLevel = distMiles < 5 ? 'critical'
      : distMiles < 15 ? 'warning'
      : 'watch';

    return {
      id: `firms-${i}-${row.acq_date}-${row.acq_time}`,
      level,
      source: 'FIRMS' as FireAlertSource,
      title: `Satellite Heat Detection${distMiles < 99 ? ` (~${Math.round(distMiles)} mi from camp)` : ''}`,
      message: `Satellite sensor detected a heat signature in the Santa Catalina Mountains area. This is a pixel-level detection, not a confirmed fire location. Distance from camp: ~${Math.round(distMiles)} miles. Source: ${row.sourceName}.`,
      observedAt: row.acq_date ? `${row.acq_date}T${row.acq_time?.slice(0, 2) ?? '00'}:${row.acq_time?.slice(2) ?? '00'}:00Z` : undefined,
      updatedAt: new Date().toISOString(),
      distanceMilesFromCamp: Math.round(distMiles),
      confidence: 'medium' as Confidence,
      actionability: level === 'critical' ? 'contact-leadership' : level === 'warning' ? 'review-plan' : 'monitor',
    };
  });

  return { items, health: 'ok' };
}

interface WFIGSFeature {
  attributes: {
    poly_IncidentName?: string;
    attr_FireDiscoveryDateTime?: number;
    attr_IncidentSize?: number;
    irwin_ModifiedOnDateTime_dt?: string;
    GISAcres?: number;
  };
  geometry?: { rings?: number[][][] };
}

async function fetchWFIGS(): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  try {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: WFIGS_BBOX,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'poly_IncidentName,attr_FireDiscoveryDateTime,attr_IncidentSize,irwin_ModifiedOnDateTime_dt,GISAcres',
      returnGeometry: 'false',
      f: 'json',
    });

    const url = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?${params}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return { items: [], health: 'degraded' };
    const data = await res.json();

    const features: WFIGSFeature[] = data.features || [];
    if (features.length === 0) return { items: [], health: 'ok' };

    const items: FireAlertItem[] = features.map((f, i) => {
      const name = f.attributes.poly_IncidentName || 'Unknown Incident';
      const acres = f.attributes.GISAcres || f.attributes.attr_IncidentSize;
      const discoveryTs = f.attributes.attr_FireDiscoveryDateTime;
      return {
        id: `wfigs-${i}-${name.replace(/\s+/g, '-').toLowerCase()}`,
        level: 'critical' as FireAlertLevel,
        source: 'WFIGS' as FireAlertSource,
        title: `Official Fire Perimeter: ${name}`,
        message: `An official mapped fire perimeter (${acres ? Math.round(acres) + ' acres' : 'size unknown'}) is intersecting or is very near the Santa Catalina Mountains area. This is a confirmed, tracked wildfire incident. Review camp evacuation procedures.`,
        observedAt: discoveryTs ? new Date(discoveryTs).toISOString() : undefined,
        updatedAt: f.attributes.irwin_ModifiedOnDateTime_dt || new Date().toISOString(),
        confidence: 'official' as Confidence,
        actionability: 'contact-leadership' as Actionability,
      };
    });

    return { items, health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

async function fetchAirNow(airNowKey: string): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  try {
    const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=85619&distance=50&API_KEY=${airNowKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return { items: [], health: 'degraded' };
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) return { items: [], health: 'ok' };

    // Find worst AQI reading
    const worst = data.reduce((prev: { AQI: number }, curr: { AQI: number }) => curr.AQI > prev.AQI ? curr : prev);
    const aqi = worst.AQI;
    const category = worst.Category?.Name || 'Unknown';
    const pollutant = worst.ParameterName || 'PM2.5';

    let level: FireAlertLevel = 'info';
    if (aqi >= 301) level = 'critical';
    else if (aqi >= 201) level = 'warning';
    else if (aqi >= 151) level = 'warning';
    else if (aqi >= 101) level = 'watch';
    else if (aqi >= 51) level = 'info';

    if (level === 'info') return { items: [], health: 'ok' }; // Don't emit good/moderate AQI as an alert

    const item: FireAlertItem = {
      id: `airnow-${Date.now()}`,
      level,
      source: 'AIRNOW' as FireAlertSource,
      title: `Air Quality: ${category} (AQI ${aqi})`,
      message: `${pollutant} AQI is ${aqi} (${category}) near camp. ${aqi >= 151 ? 'Limit outdoor activity. Smoke may be affecting air quality.' : 'Air quality is elevated — monitor conditions.'}`,
      updatedAt: new Date().toISOString(),
      confidence: 'high' as Confidence,
      actionability: aqi >= 201 ? 'contact-leadership' : 'review-plan',
      url: 'https://www.airnow.gov/',
    };

    return { items: [item], health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function GET() {
  const firmsKey = process.env.FIRMS_MAP_KEY;
  const airNowKey = process.env.AIRNOW_API_KEY;

  const db = getFirestore();
  let cachedData: FireAggregatorResponse | null = null;

  // 1. Pre-load cache from Firestore
  try {
    const docRef = db.collection('alertsCache').doc('latest');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      cachedData = docSnap.data() as FireAggregatorResponse;
    }
  } catch (cacheErr) {
    console.warn("Could not read alertsCache from Firestore:", cacheErr);
  }

  try {
    const sourceHealth: Record<FireAlertSource, SourceHealthStatus> = {
      NWS: 'ok',
      USFS: 'ok',
      FIRMS: firmsKey ? 'ok' : 'missing-key',
      WFIGS: 'ok',
      NOAA_HMS: 'ok',
      AIRNOW: airNowKey ? 'ok' : 'missing-key',
    };

    // Run all fetches in parallel — none block each other
    const [
      nwsAlerts,
      nwsWeather,
      usfsAlerts,
      firmsResult,
      wfigsResult,
      airNowResult,
    ] = await Promise.allSettled([
      fetchNWSAlerts(),
      fetchNWSWeather(),
      fetchUSFSAlerts(),
      firmsKey ? fetchFIRMS(firmsKey) : Promise.resolve({ items: [], health: 'missing-key' as SourceHealthStatus }),
      fetchWFIGS(),
      airNowKey ? fetchAirNow(airNowKey) : Promise.resolve({ items: [], health: 'missing-key' as SourceHealthStatus }),
    ]);

    const resolve = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback;

    const nwsAlertsData = resolve(nwsAlerts, { items: [], health: 'error' as SourceHealthStatus });
    const nwsWeatherData = resolve(nwsWeather, { weather: null, health: 'error' as SourceHealthStatus });
    const usfsData = resolve(usfsAlerts, { items: [], health: 'error' as SourceHealthStatus });
    const firmsData = resolve(firmsResult, { items: [], health: firmsKey ? 'error' : 'missing-key' } as { items: FireAlertItem[]; health: SourceHealthStatus });
    const wfigsData = resolve(wfigsResult, { items: [], health: 'error' as SourceHealthStatus });
    const airNowData = resolve(airNowResult, { items: [], health: airNowKey ? 'error' : 'missing-key' } as { items: FireAlertItem[]; health: SourceHealthStatus });

    sourceHealth.NWS = nwsAlertsData.health;
    sourceHealth.USFS = usfsData.health;
    sourceHealth.FIRMS = firmsData.health;
    sourceHealth.WFIGS = wfigsData.health;
    sourceHealth.AIRNOW = airNowData.health;

    // 2. Fallback merging for failed sources
    const finalAlerts: FireAlertItem[] = [];

    if (nwsAlertsData.health !== 'error') {
      finalAlerts.push(...nwsAlertsData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'NWS'));
    }

    if (usfsData.health !== 'error') {
      finalAlerts.push(...usfsData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'USFS'));
    }

    if (wfigsData.health !== 'error') {
      finalAlerts.push(...wfigsData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'WFIGS'));
    }

    if (firmsData.health !== 'error') {
      finalAlerts.push(...firmsData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'FIRMS'));
    }

    if (airNowData.health !== 'error') {
      finalAlerts.push(...airNowData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'AIRNOW'));
    }

    // Sort aggregated final alerts by severity
    finalAlerts.sort((a, b) => levelToScore(b.level) - levelToScore(a.level));

    const overallLevel = highestLevel(finalAlerts.map(a => a.level));

    // 3. Weather fallback handling
    let finalWeather = nwsWeatherData.weather;
    if (!finalWeather && cachedData && cachedData.weather) {
      finalWeather = cachedData.weather;
      if (sourceHealth.NWS === 'error') {
        sourceHealth.NWS = 'degraded'; // weather retrieved from cache, mark as degraded rather than pure error
      }
    }

    const response: FireAggregatorResponse = {
      overallLevel,
      alerts: finalAlerts,
      weather: finalWeather,
      sourceHealth,
      lastChecked: new Date().toISOString(),
    };

    // 4. Save to Firestore cache back
    try {
      await db.collection('alertsCache').doc('latest').set(response);
    } catch (saveErr) {
      console.warn("Could not save alertsCache to Firestore:", saveErr);
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });

  } catch (err) {
    console.error("Critical error in fire aggregator, falling back to cache:", err);
    if (cachedData) {
      return NextResponse.json({
        ...cachedData,
        lastChecked: cachedData.lastChecked || new Date().toISOString(),
        warning: "Serving cached data from Firestore due to server-side error"
      });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
