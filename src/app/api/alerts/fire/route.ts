import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { writeServerErrorLog } from '@/lib/server/errorLog';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FireAlertLevel = 'normal' | 'info' | 'watch' | 'warning' | 'critical' | 'evacuation';
export type FireAlertSource = 'NWS' | 'USFS' | 'FIRMS' | 'WFIGS' | 'NOAA_HMS' | 'AIRNOW' | 'WILDCAD' | 'FIREPING';
export type SourceHealthStatus = 'ok' | 'degraded' | 'error' | 'missing-key' | 'auth-error';
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
const WILDCAD_ALERT_RADIUS_MILES = 10;
const WILDCAD_LOCATION = 'MT BIGALOW';
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

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function classifyNWSAlert(event: string, severity: string): FireAlertLevel {
  const text = `${event} ${severity}`.toLowerCase();

  if (text.includes('evacuation')) return 'evacuation';
  if (
    text.includes('red flag warning')
    || text.includes('extreme wind warning')
    || text.includes('severe thunderstorm warning')
    || text.includes('flash flood warning')
    || text.includes('dust storm warning')
    || text.includes('excessive heat warning')
    || severity === 'Extreme'
  ) return 'critical';

  if (
    text.includes('fire weather watch')
    || text.includes('red flag')
    || text.includes('severe thunderstorm watch')
    || text.includes('flood warning')
    || text.includes('high wind warning')
    || text.includes('winter storm warning')
    || severity === 'Severe'
  ) return 'warning';

  if (
    text.includes('watch')
    || text.includes('advisory')
    || text.includes('wind')
    || text.includes('heat')
    || severity === 'Moderate'
  ) return 'watch';

  return 'info';
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
      const level = classifyNWSAlert(props.event || '', props.severity || '');

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
    if (!res.ok) {
      console.warn(`AirNow fetch returned ${res.status} ${res.statusText}`);
      if (res.status === 401 || res.status === 403) return { items: [], health: 'auth-error' };
      return { items: [], health: 'degraded' };
    }
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

// ─── WildCAD Dispatch (Tucson Interagency Dispatch - AZTDC) ──────────────────

async function fetchWildCAD(): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  try {
    const wildCadUrl = new URL('https://snknmqmon6.execute-api.us-west-2.amazonaws.com/centers/AZTDC/incidents');
    wildCadUrl.searchParams.set('loc', WILDCAD_LOCATION);

    const res = await fetch(wildCadUrl, {
      next: { revalidate: 300 }
    });
    if (!res.ok) return { items: [], health: 'degraded' };

    const json = await res.json();
    const data = (Array.isArray(json) ? json[0]?.data : json?.data) || [];
    const items: FireAlertItem[] = [];

    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    for (const item of data) {
      const lat = parseFloat(item.latitude);
      let lon = parseFloat(item.longitude);
      if (isNaN(lat) || isNaN(lon)) continue;

      // Correct positive longitude quirk in WildCAD
      if (lon > 0) lon = -lon;

      const distMiles = kmToMiles(haversineKm(lat, lon, CAMP_LAT, CAMP_LON));
      if (distMiles > WILDCAD_ALERT_RADIUS_MILES) continue;

      const dateMs = new Date(item.date).getTime();
      const ageMs = now - dateMs;

      // Parse fire status
      let isOut = false;
      let outDateMs: number | null = null;
      try {
        const status = JSON.parse(item.fire_status || '{}');
        if (status.out) {
          isOut = true;
          outDateMs = new Date(status.out).getTime();
        }
      } catch {
        // Assume active if not parseable
      }

      // Proximity/recency filtering logic:
      // - Active incidents: must be within the last 7 days to avoid showing stale entries left open by dispatchers.
      // - Controlled/Out incidents: must have gone out or been reported within the last 24 hours.
      if (isOut) {
        const outAgeMs = outDateMs ? now - outDateMs : ageMs;
        if (outAgeMs > ONE_DAY_MS) continue;
      } else {
        if (ageMs > SEVEN_DAYS_MS) continue;
      }

      const name = item.name || 'Unnamed Incident';
      const type = item.type || 'Dispatch Incident';
      const comment = item.webComment || '';

      // Skip false alarms that are out or older than 6 hours
      if (type.toLowerCase() === 'false alarm') {
        if (isOut || ageMs > 6 * 60 * 60 * 1000) continue;
      }

      // Determine level
      let level: FireAlertLevel = 'info';
      if (!isOut) {
        const isWildfire = type.toLowerCase().includes('wildfire') || type.toLowerCase().includes('fire');
        const isSmoke = type.toLowerCase().includes('smoke');

        if (isWildfire) {
          level = distMiles < 5 ? 'critical'
            : distMiles < 15 ? 'warning'
            : 'watch';
        } else if (isSmoke) {
          level = distMiles < 5 ? 'warning'
            : distMiles < 15 ? 'watch'
            : 'info';
        } else {
          level = distMiles < 10 ? 'watch' : 'info';
        }
      } else {
        level = 'info'; // Completed/Out is always informational
      }

      const formattedTime = new Date(item.date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Phoenix'
      });

      const title = `Tucson Dispatch: ${name} [${type}]`;
      const message = `${comment || 'Incident reported.'} Status: ${isOut ? 'OUT' : 'ACTIVE'}. Dispatched at ${formattedTime} MST. Distance from camp: ~${Math.round(distMiles)} mi.`;

      items.push({
        id: `wildcad-${item.uuid || item.inc_num || String(dateMs)}`,
        level,
        source: 'WILDCAD',
        title,
        message,
        observedAt: new Date(item.date).toISOString(),
        updatedAt: new Date().toISOString(),
        distanceMilesFromCamp: Math.round(distMiles),
        confidence: 'high',
        actionability: level === 'critical' ? 'contact-leadership' : level === 'warning' ? 'review-plan' : 'monitor',
        url: 'https://www.wildwebe.net/?dc_name=AZTDC',
      });
    }

    // Sort by level severity first, then closest distance
    items.sort((a, b) => {
      const levelDiff = levelToScore(b.level) - levelToScore(a.level);
      if (levelDiff !== 0) return levelDiff;
      return (a.distanceMilesFromCamp ?? 99) - (b.distanceMilesFromCamp ?? 99);
    });

    return { items: items.slice(0, 8), health: 'ok' };
  } catch (err) {
    await writeServerErrorLog({
      context: 'alerts.fire.wildcad',
      message: 'WildCAD fetch failed.',
      error: err,
      severity: 'warning',
    });
    return { items: [], health: 'error' };
  }
}

// ─── FirePing / GOES-style Fire Detection Feed ──────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function firepingRowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const candidates = [
    payload.items,
    payload.results,
    payload.detections,
    payload.features,
    payload.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }

  return [];
}

async function fetchFireping(firepingKey: string): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  const endpoint = envValue('FIREPING_API_URL');
  if (!endpoint) return { items: [], health: 'degraded' };

  try {
    const res = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${firepingKey}`,
        'X-API-Key': firepingKey,
      },
      next: { revalidate: 300 },
    });

    if (res.status === 401 || res.status === 403) return { items: [], health: 'auth-error' };
    if (!res.ok) return { items: [], health: 'degraded' };

    const payload = await res.json();
    const rows = firepingRowsFromPayload(payload);

    const items: FireAlertItem[] = rows.flatMap((row, index) => {
      const attributes = isRecord(row.attributes) ? row.attributes : row;
      const geometry = isRecord(row.geometry) ? row.geometry : undefined;
      const lat = numberField(attributes, ['latitude', 'lat', 'y'])
        ?? (geometry ? numberField(geometry, ['latitude', 'lat', 'y']) : undefined);
      const lon = numberField(attributes, ['longitude', 'lon', 'lng', 'x'])
        ?? (geometry ? numberField(geometry, ['longitude', 'lon', 'lng', 'x']) : undefined);

      if (lat === undefined || lon === undefined) return [];

      const distMiles = kmToMiles(haversineKm(lat, lon, CAMP_LAT, CAMP_LON));
      const level: FireAlertLevel = distMiles < 5 ? 'critical'
        : distMiles < 15 ? 'warning'
        : 'watch';
      const observedAt = stringField(attributes, ['observedAt', 'observed_at', 'timestamp', 'time', 'acq_datetime', 'date']);
      const confidence = stringField(attributes, ['confidence', 'quality', 'status']) ?? 'satellite';

      return [{
        id: `fireping-${stringField(attributes, ['id', 'uuid', 'objectid']) ?? `${index}-${Math.round(lat * 1000)}-${Math.round(lon * 1000)}`}`,
        level,
        source: 'FIREPING' as FireAlertSource,
        title: `FirePing Satellite Detection (~${Math.round(distMiles)} mi from camp)`,
        message: `FirePing reported a satellite fire/heat detection near the Santa Catalina Mountains. Treat as a sensor detection until confirmed by official sources. Confidence: ${confidence}.`,
        observedAt,
        updatedAt: new Date().toISOString(),
        distanceMilesFromCamp: Math.round(distMiles),
        confidence: 'medium' as Confidence,
        actionability: level === 'critical' ? 'contact-leadership' : level === 'warning' ? 'review-plan' : 'monitor',
        url: stringField(attributes, ['url', 'link']),
      }];
    });

    return { items: items.slice(0, 8), health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const firmsKey = envValue('FIRMS_MAP_KEY', 'NASA_FIRMS_MAP_KEY', 'FIRMS_API_KEY');
  const airNowKey = envValue('AIRNOW_API_KEY', 'AIR_NOW_API_KEY');
  const firepingKey = envValue('FIREPING_API_KEY');

  const db = getAdminDb();
  let cachedData: FireAggregatorResponse | null = null;

  // 1. Pre-load cache from Firestore
  try {
    const docRef = db.collection('alertsCache').doc('latest');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      cachedData = docSnap.data() as FireAggregatorResponse;
    }
  } catch (cacheErr) {
    await writeServerErrorLog({
      context: 'alerts.fire.cache_read',
      message: 'Could not read alertsCache from Firestore.',
      error: cacheErr,
      severity: 'warning',
      request,
    });
  }

  try {
    const sourceHealth: Record<FireAlertSource, SourceHealthStatus> = {
      NWS: 'ok',
      USFS: 'ok',
      FIRMS: firmsKey ? 'ok' : 'missing-key',
      WFIGS: 'ok',
      NOAA_HMS: 'ok',
      AIRNOW: airNowKey ? 'ok' : 'missing-key',
      WILDCAD: 'ok',
      FIREPING: firepingKey ? 'ok' : 'missing-key',
    };

    // Run all fetches in parallel — none block each other
    const [
      nwsAlerts,
      nwsWeather,
      usfsAlerts,
      firmsResult,
      wfigsResult,
      airNowResult,
      wildCadResult,
      firepingResult,
    ] = await Promise.allSettled([
      fetchNWSAlerts(),
      fetchNWSWeather(),
      fetchUSFSAlerts(),
      firmsKey ? fetchFIRMS(firmsKey) : Promise.resolve({ items: [], health: 'missing-key' as SourceHealthStatus }),
      fetchWFIGS(),
      airNowKey ? fetchAirNow(airNowKey) : Promise.resolve({ items: [], health: 'missing-key' as SourceHealthStatus }),
      fetchWildCAD(),
      firepingKey ? fetchFireping(firepingKey) : Promise.resolve({ items: [], health: 'missing-key' as SourceHealthStatus }),
    ]);

    const resolve = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback;

    const nwsAlertsData = resolve(nwsAlerts, { items: [], health: 'error' as SourceHealthStatus });
    const nwsWeatherData = resolve(nwsWeather, { weather: null, health: 'error' as SourceHealthStatus });
    const usfsData = resolve(usfsAlerts, { items: [], health: 'error' as SourceHealthStatus });
    const firmsData = resolve(firmsResult, { items: [], health: firmsKey ? 'error' : 'missing-key' } as { items: FireAlertItem[]; health: SourceHealthStatus });
    const wfigsData = resolve(wfigsResult, { items: [], health: 'error' as SourceHealthStatus });
    const airNowData = resolve(airNowResult, { items: [], health: airNowKey ? 'error' : 'missing-key' } as { items: FireAlertItem[]; health: SourceHealthStatus });
    const wildCadData = resolve(wildCadResult, { items: [], health: 'error' as SourceHealthStatus });
    const firepingData = resolve(firepingResult, { items: [], health: firepingKey ? 'error' : 'missing-key' } as { items: FireAlertItem[]; health: SourceHealthStatus });

    sourceHealth.NWS = nwsAlertsData.health;
    sourceHealth.USFS = usfsData.health;
    sourceHealth.FIRMS = firmsData.health;
    sourceHealth.WFIGS = wfigsData.health;
    sourceHealth.AIRNOW = airNowData.health;
    sourceHealth.WILDCAD = wildCadData.health;
    sourceHealth.FIREPING = firepingData.health;

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

    if (wildCadData.health !== 'error') {
      finalAlerts.push(...wildCadData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'WILDCAD'));
    }

    if (firepingData.health !== 'error') {
      finalAlerts.push(...firepingData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'FIREPING'));
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
      await writeServerErrorLog({
        context: 'alerts.fire.cache_write',
        message: 'Could not save alertsCache to Firestore.',
        error: saveErr,
        severity: 'warning',
        request,
        metadata: {
          alertCount: finalAlerts.length,
          sourceHealth,
        },
      });
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });

  } catch (err) {
    await writeServerErrorLog({
      context: 'alerts.fire.fatal',
      message: 'Critical error in fire aggregator.',
      error: err,
      severity: 'critical',
      request,
      metadata: { hasCachedData: !!cachedData },
    });
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
