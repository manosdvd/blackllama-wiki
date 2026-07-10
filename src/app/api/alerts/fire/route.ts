import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { writeServerErrorLog } from '@/lib/server/errorLog';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FireAlertLevel = 'normal' | 'info' | 'watch' | 'warning' | 'critical' | 'evacuation';
export type FireAlertSource = 'NWS' | 'USFS' | 'WFIGS' | 'WILDCAD' | 'PIMA_GIS';
export type SourceHealthStatus = 'ok' | 'degraded' | 'error';
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
const NWS_SCOUT_CAMP_STATION = 'QSLA3';
const PIMA_GIS_ALERT_RADIUS_METERS = 8046.72; // 5 miles
const PIMA_GIS_FIRE_PERIMETERS_URL = 'https://services2.arcgis.com/UTBp78iglGpbqp1B/arcgis/rest/services/Pima_County_CWPP_Fire_Perimeters/FeatureServer/279/query';
const PIMA_GIS_SOURCE_URL = 'https://gisopendata.pima.gov/datasets/pima-county-cwpp-fire-perimeters/about';
// WFIGS ArcGIS bounding box for spatial query (xmin,ymin,xmax,ymax)
const WFIGS_BBOX = '-111.05,32.20,-110.45,32.65';
const ACTIVE_FIRE_ALERT_SOURCES: FireAlertSource[] = ['NWS', 'USFS', 'WFIGS', 'WILDCAD', 'PIMA_GIS'];

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

function combineSourceHealth(...statuses: SourceHealthStatus[]): SourceHealthStatus {
  if (statuses.every((status) => status === 'ok')) return 'ok';
  if (statuses.every((status) => status === 'error')) return 'error';
  return 'degraded';
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

function isActiveFireAlertSource(source: string): source is FireAlertSource {
  return ACTIVE_FIRE_ALERT_SOURCES.includes(source as FireAlertSource);
}

function defaultSourceHealth(): Record<FireAlertSource, SourceHealthStatus> {
  return {
    NWS: 'ok',
    USFS: 'ok',
    WFIGS: 'ok',
    WILDCAD: 'ok',
    PIMA_GIS: 'ok',
  };
}

function sanitizeCachedAlerts(alerts?: FireAlertItem[]) {
  return Array.isArray(alerts)
    ? alerts.filter(alert => isActiveFireAlertSource(String(alert.source)))
    : [];
}

function sanitizeCachedSourceHealth(health?: Record<string, unknown>) {
  const sourceHealth = defaultSourceHealth();
  for (const source of ACTIVE_FIRE_ALERT_SOURCES) {
    const status = health?.[source];
    if (status === 'ok' || status === 'degraded' || status === 'error') {
      sourceHealth[source] = status;
    }
  }
  return sourceHealth;
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

interface NWSForecastPeriod {
  name?: string;
  startTime?: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast?: string;
  detailedForecast?: string;
  windSpeed?: string;
  windDirection?: string;
  relativeHumidity?: {
    value?: number | null;
  };
  probabilityOfPrecipitation?: {
    value?: number | null;
  };
}

interface NWSLatestObservation {
  properties?: {
    timestamp?: string;
    textDescription?: string;
    temperature?: {
      value?: number | null;
    };
    relativeHumidity?: {
      value?: number | null;
    };
    windDirection?: {
      value?: number | null;
    };
    windSpeed?: {
      value?: number | null;
    };
    windGust?: {
      value?: number | null;
    };
  };
}

function celsiusToFahrenheit(value: number) {
  return Math.round((value * 9 / 5) + 32);
}

function kmhToMph(value: number) {
  return Math.round(value * 0.621371);
}

function compassDirection(degrees?: number | null) {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return '';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(degrees / 22.5) % directions.length];
}

function percentLabel(value?: number | null) {
  return value === null || value === undefined ? 'N/A' : `${Math.round(value)}%`;
}

function isFreshObservation(timestamp?: string) {
  if (!timestamp) return false;
  const observedAt = Date.parse(timestamp);
  if (Number.isNaN(observedAt)) return false;
  return Date.now() - observedAt < 2 * 60 * 60 * 1000;
}

function observedWindLabel(observation?: NWSLatestObservation['properties']) {
  const speedKmh = observation?.windSpeed?.value;
  if (speedKmh === null || speedKmh === undefined || !Number.isFinite(speedKmh)) return undefined;
  const speedMph = kmhToMph(speedKmh);
  const direction = compassDirection(observation?.windDirection?.value);
  const gustKmh = observation?.windGust?.value;
  const gust = gustKmh !== null && gustKmh !== undefined && Number.isFinite(gustKmh)
    ? ` gust ${kmhToMph(gustKmh)} mph`
    : '';
  return `${direction ? `${direction} ` : ''}${speedMph} mph${gust}`;
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
    const [dailyRes, hourlyRes, observationRes] = await Promise.all([
      fetch('https://api.weather.gov/gridpoints/TWC/101,56/forecast', {
        headers: NWS_HEADERS,
        next: { revalidate: 300 },
      }),
      fetch('https://api.weather.gov/gridpoints/TWC/101,56/forecast/hourly', {
        headers: NWS_HEADERS,
        next: { revalidate: 300 },
      }),
      fetch(`https://api.weather.gov/stations/${NWS_SCOUT_CAMP_STATION}/observations/latest?require_qc=false`, {
        headers: NWS_HEADERS,
        next: { revalidate: 300 },
      }),
    ]);

    const dailyData = dailyRes.ok ? await dailyRes.json() : null;
    const hourlyData = hourlyRes.ok ? await hourlyRes.json() : null;
    const observationData = observationRes.ok ? await observationRes.json() as NWSLatestObservation : null;
    const dailyPeriods: NWSForecastPeriod[] = dailyData?.properties?.periods || [];
    const hourlyPeriods: NWSForecastPeriod[] = hourlyData?.properties?.periods || [];
    const hourlyCurrent = hourlyPeriods[0];
    const observation = observationData?.properties;
    const useObservation = isFreshObservation(observation?.timestamp) && observation?.temperature?.value !== null && observation?.temperature?.value !== undefined;

    if (!hourlyCurrent && !dailyPeriods.length && !useObservation) {
      return { weather: null, health: 'degraded' };
    }

    const currentTemp = useObservation
      ? `${celsiusToFahrenheit(observation.temperature?.value as number)}°F`
      : hourlyCurrent ? `${hourlyCurrent.temperature}°${hourlyCurrent.temperatureUnit}` : 'N/A';
    const currentCondition = observation?.textDescription?.trim()
      || hourlyCurrent?.shortForecast
      || dailyPeriods[0]?.shortForecast
      || 'Weather available';
    const currentHumidity = useObservation
      ? percentLabel(observation.relativeHumidity?.value)
      : percentLabel(hourlyCurrent?.relativeHumidity?.value);
    const currentWind = observedWindLabel(observation)
      || (hourlyCurrent?.windSpeed ? `${hourlyCurrent.windDirection ? `${hourlyCurrent.windDirection} ` : ''}${hourlyCurrent.windSpeed}` : 'N/A');
    const precipChance = percentLabel(hourlyCurrent?.probabilityOfPrecipitation?.value);

    const next5 = hourlyPeriods.slice(1, 6);
    const forecastStrip = next5.length > 0
      ? next5.map((p) => {
        const time = p.startTime
          ? new Date(p.startTime).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: 'America/Phoenix' })
          : 'Next';
        return `${time}: ${p.temperature}°${p.temperatureUnit}`;
      }).join(' | ')
      : dailyPeriods.slice(1, 6).map((p) => `${p.name}: ${p.temperature}°${p.temperatureUnit}`).join(' | ');
    const detailedForecast = dailyPeriods[0]?.detailedForecast
      || hourlyCurrent?.shortForecast
      || currentCondition;

    return {
      weather: {
        temp: currentTemp,
        condition: currentCondition,
        wind: currentWind,
        humidity: currentHumidity,
        precipChance,
        forecastStrip,
        detailedForecast,
        fetchedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' }),
      },
      health: useObservation ? 'ok' : 'degraded',
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
      if (/no (?:active )?fire restrictions|fire restrictions? (?:have been )?lifted/.test(t)) return 'normal';
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
        if (level === 'normal') return;
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
              if (level === 'normal') return;
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

interface WFIGSFeature {
  attributes: {
    poly_IncidentName?: string | null;
    poly_GISAcres?: number | null;
    poly_DeleteThis?: string | boolean | number | null;
    poly_FeatureStatus?: string | null;
    poly_IsVisible?: string | boolean | number | null;
    poly_DateCurrent?: number | null;
    poly_PolygonDateTime?: number | null;
    attr_FireDiscoveryDateTime?: number | null;
    attr_FireOutDateTime?: number | null;
    attr_ContainmentDateTime?: number | null;
    attr_PercentContained?: number | null;
    attr_IncidentSize?: number | null;
    attr_ModifiedOnDateTime_dt?: number | string | null;
  };
}

function arcGisMillis(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arcGisBoolean(value: string | boolean | number | null | undefined, defaultValue: boolean) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = value.trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  return defaultValue;
}

async function fetchWFIGS(): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  try {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: WFIGS_BBOX,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: [
        'poly_IncidentName',
        'poly_GISAcres',
        'poly_DeleteThis',
        'poly_FeatureStatus',
        'poly_IsVisible',
        'poly_DateCurrent',
        'poly_PolygonDateTime',
        'attr_FireDiscoveryDateTime',
        'attr_FireOutDateTime',
        'attr_ContainmentDateTime',
        'attr_PercentContained',
        'attr_IncidentSize',
        'attr_ModifiedOnDateTime_dt',
      ].join(','),
      returnGeometry: 'false',
      resultRecordCount: '200',
      orderByFields: 'poly_DateCurrent DESC',
      f: 'json',
    });

    const url = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?${params}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return { items: [], health: 'degraded' };
    const data = await res.json() as { features?: WFIGSFeature[]; error?: unknown };
    if (data.error || !Array.isArray(data.features)) return { items: [], health: 'degraded' };

    const freshnessCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const currentFeatures = data.features.filter((feature) => {
      const attributes = feature.attributes;
      const isVisible = arcGisBoolean(attributes.poly_IsVisible, true);
      const isDeleted = arcGisBoolean(attributes.poly_DeleteThis, false);
      const fireOutAt = arcGisMillis(attributes.attr_FireOutDateTime);
      const percentContained = attributes.attr_PercentContained;
      const latestActivity = Math.max(
        arcGisMillis(attributes.poly_DateCurrent),
        arcGisMillis(attributes.poly_PolygonDateTime),
        arcGisMillis(attributes.attr_ModifiedOnDateTime_dt),
        arcGisMillis(attributes.attr_FireDiscoveryDateTime),
      );

      return isVisible
        && !isDeleted
        && fireOutAt === 0
        && (percentContained === undefined || percentContained === null || percentContained < 100)
        && latestActivity >= freshnessCutoff;
    });

    const seenIncidents = new Set<string>();
    const items: FireAlertItem[] = [];

    currentFeatures.forEach((feature, index) => {
      const attributes = feature.attributes;
      const name = attributes.poly_IncidentName?.trim() || 'Unknown Incident';
      const incidentKey = name.toLowerCase();
      if (seenIncidents.has(incidentKey)) return;
      seenIncidents.add(incidentKey);

      const acres = attributes.poly_GISAcres || attributes.attr_IncidentSize;
      const discoveryAt = arcGisDateToIso(attributes.attr_FireDiscoveryDateTime);
      const updatedAt = arcGisDateToIso(attributes.attr_ModifiedOnDateTime_dt)
        || arcGisDateToIso(attributes.poly_DateCurrent)
        || discoveryAt
        || new Date().toISOString();

      items.push({
        id: `wfigs-${index}-${name.replace(/\s+/g, '-').toLowerCase()}`,
        level: 'critical',
        source: 'WFIGS',
        title: `Official Fire Perimeter: ${name}`,
        message: `A current official fire perimeter (${acres ? `${Math.round(acres)} acres` : 'size unknown'}) intersects the Santa Catalina Mountains monitoring area. Review camp evacuation procedures and confirm conditions with official incident sources.`,
        observedAt: discoveryAt,
        updatedAt,
        confidence: 'official',
        actionability: 'contact-leadership',
        url: 'https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-interagency-fire-perimeters/about',
      });
    });

    return { items, health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

interface PimaGisFirePerimeterFeature {
  attributes: {
    OBJECTID?: number;
    IncidentName?: string | null;
    Year?: number | string | null;
    Size_Acres?: number | string | null;
    Date?: number | string | null;
  };
}

function arcGisDateToIso(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

async function fetchPimaGIS(): Promise<{ items: FireAlertItem[]; health: SourceHealthStatus }> {
  const currentYear = new Date().getFullYear();
  const minimumYear = currentYear - 1;

  try {
    const params = new URLSearchParams({
      where: `Year >= ${minimumYear}`,
      geometry: `${CAMP_LON},${CAMP_LAT}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(PIMA_GIS_ALERT_RADIUS_METERS),
      units: 'esriSRUnit_Meter',
      outFields: 'OBJECTID,IncidentName,Year,Size_Acres,Date',
      returnGeometry: 'false',
      f: 'json',
    });

    const res = await fetch(`${PIMA_GIS_FIRE_PERIMETERS_URL}?${params}`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return { items: [], health: 'degraded' };

    const data = await res.json();
    if (data.error) return { items: [], health: 'degraded' };

    const features: PimaGisFirePerimeterFeature[] = data.features || [];
    const items: FireAlertItem[] = features.map((feature, index) => {
      const attrs = feature.attributes || {};
      const year = Number(attrs.Year);
      const name = attrs.IncidentName?.trim() || `Fire perimeter ${attrs.OBJECTID ?? index + 1}`;
      const acresValue = attrs.Size_Acres === null || attrs.Size_Acres === undefined || attrs.Size_Acres === ''
        ? NaN
        : Number(attrs.Size_Acres);
      const acres = Number.isFinite(acresValue)
        ? `${Math.round(acresValue).toLocaleString('en-US')} acres`
        : 'size unknown';
      const level: FireAlertLevel = year >= currentYear ? 'watch' : 'info';

      return {
        id: `pima-gis-${attrs.OBJECTID ?? index}-${Number.isFinite(year) ? year : 'recent'}`,
        level,
        source: 'PIMA_GIS' as FireAlertSource,
        title: `Pima GIS Fire Perimeter: ${name}`,
        message: `Pima County GIS lists a ${Number.isFinite(year) ? year : 'recent'} CWPP fire perimeter within 5 miles of camp (${acres}). This is an official GIS/planning layer, not a live evacuation order; confirm current status with NWS, WildCAD, and official notices.`,
        observedAt: arcGisDateToIso(attrs.Date) ?? (Number.isFinite(year) ? `${year}-01-01T00:00:00.000Z` : undefined),
        updatedAt: new Date().toISOString(),
        confidence: 'official' as Confidence,
        actionability: level === 'watch' ? 'review-plan' : 'monitor',
        url: PIMA_GIS_SOURCE_URL,
      };
    });

    return { items: items.slice(0, 5), health: 'ok' };
  } catch (err) {
    await writeServerErrorLog({
      context: 'alerts.fire.pima_gis',
      message: 'Pima GIS fire perimeter fetch failed.',
      error: err,
      severity: 'warning',
    });
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

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
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
    const sourceHealth = defaultSourceHealth();

    // Run all fetches in parallel — none block each other
    const [
      nwsAlerts,
      nwsWeather,
      usfsAlerts,
      wfigsResult,
      wildCadResult,
      pimaGisResult,
    ] = await Promise.allSettled([
      fetchNWSAlerts(),
      fetchNWSWeather(),
      fetchUSFSAlerts(),
      fetchWFIGS(),
      fetchWildCAD(),
      fetchPimaGIS(),
    ]);

    const resolve = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback;

    const nwsAlertsData = resolve(nwsAlerts, { items: [], health: 'error' as SourceHealthStatus });
    const nwsWeatherData = resolve(nwsWeather, { weather: null, health: 'error' as SourceHealthStatus });
    const usfsData = resolve(usfsAlerts, { items: [], health: 'error' as SourceHealthStatus });
    const wfigsData = resolve(wfigsResult, { items: [], health: 'error' as SourceHealthStatus });
    const wildCadData = resolve(wildCadResult, { items: [], health: 'error' as SourceHealthStatus });
    const pimaGisData = resolve(pimaGisResult, { items: [], health: 'error' as SourceHealthStatus });

    sourceHealth.NWS = combineSourceHealth(nwsAlertsData.health, nwsWeatherData.health);
    sourceHealth.USFS = usfsData.health;
    sourceHealth.WFIGS = wfigsData.health;
    sourceHealth.WILDCAD = wildCadData.health;
    sourceHealth.PIMA_GIS = pimaGisData.health;

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

    if (wildCadData.health !== 'error') {
      finalAlerts.push(...wildCadData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'WILDCAD'));
    }

    if (pimaGisData.health !== 'error') {
      finalAlerts.push(...pimaGisData.items);
    } else if (cachedData && Array.isArray(cachedData.alerts)) {
      finalAlerts.push(...cachedData.alerts.filter(a => a.source === 'PIMA_GIS'));
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
      const alerts = sanitizeCachedAlerts(cachedData.alerts);
      return NextResponse.json({
        ...cachedData,
        alerts,
        overallLevel: highestLevel(alerts.map(a => a.level)),
        sourceHealth: sanitizeCachedSourceHealth(cachedData.sourceHealth),
        lastChecked: cachedData.lastChecked || new Date().toISOString(),
        warning: "Serving cached data from Firestore due to server-side error"
      });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
