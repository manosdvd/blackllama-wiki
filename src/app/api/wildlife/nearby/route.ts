import { NextResponse } from 'next/server';

export type WildlifeSource = 'INATURALIST' | 'EBIRD' | 'HABIMAP';
export type WildlifeSourceHealthStatus = 'ok' | 'degraded' | 'error' | 'missing-key' | 'needs-config';
export type WildlifeCautionLevel = 'info' | 'watch' | 'caution';

export interface WildlifeCoordinates {
  lat: number;
  lng: number;
}

export interface WildlifeSighting {
  id: string;
  source: WildlifeSource;
  commonName: string;
  scientificName?: string;
  category: string;
  observedAt?: string;
  place?: string;
  distanceMiles?: number;
  count?: number;
  observationUrl?: string;
  photoUrl?: string;
  coordinates?: WildlifeCoordinates;
  cautionLevel: WildlifeCautionLevel;
  summary: string;
  confidence: string;
}

export interface HabitatRecord {
  id: string;
  source: 'HABIMAP';
  title: string;
  layerName: string;
  details: string;
  url?: string;
  confidence: 'official';
}

export interface WildlifeAggregatorResponse {
  location: {
    label: string;
    lat: number;
    lng: number;
    radiusKm: number;
  };
  sightings: WildlifeSighting[];
  habitats: HabitatRecord[];
  sourceHealth: Record<WildlifeSource, WildlifeSourceHealthStatus>;
  summary: {
    totalSightings: number;
    cautionCount: number;
    watchCount: number;
    mammalCount: number;
    reptileCount: number;
    birdCount: number;
  };
  lastChecked: string;
}

interface SourceResult<T> {
  items: T[];
  health: WildlifeSourceHealthStatus;
}

interface INaturalistObservation {
  id?: number;
  observed_on?: string | null;
  time_observed_at?: string | null;
  uri?: string;
  place_guess?: string | null;
  quality_grade?: string | null;
  location?: string | null;
  geojson?: {
    coordinates?: unknown;
  } | null;
  taxon?: {
    name?: string | null;
    preferred_common_name?: string | null;
    iconic_taxon_name?: string | null;
  } | null;
  photos?: Array<{
    url?: string | null;
    medium_url?: string | null;
    square_url?: string | null;
  }>;
}

interface EBirdObservation {
  speciesCode?: string;
  comName?: string;
  sciName?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  lat?: number;
  lng?: number;
  obsValid?: boolean;
  obsReviewed?: boolean;
  subId?: string;
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  error?: {
    message?: string;
  };
}

interface ArcGisLayerMetadata {
  name?: string;
  title?: string;
  error?: {
    message?: string;
  };
}

const CAMP_LAT = 32.398;
const CAMP_LNG = -110.725;
const DEFAULT_RADIUS_KM = 25;
const MAX_RADIUS_KM = 80;

const JSON_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'CampLawtonStaffHub/1.0 (wildlife integration)',
};

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseNumberParam(searchParams: URLSearchParams, name: string, fallback: number, min: number, max: number) {
  const raw = searchParams.get(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function haversineMiles(a: WildlifeCoordinates, b: WildlifeCoordinates) {
  const earthRadiusKm = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 0.621371;
}

function categoryFromIconicTaxon(iconicTaxon?: string | null) {
  switch (iconicTaxon) {
    case 'Mammalia':
      return 'Mammal';
    case 'Reptilia':
      return 'Reptile';
    case 'Aves':
      return 'Bird';
    case 'Amphibia':
      return 'Amphibian';
    default:
      return 'Wildlife';
  }
}

function classifyCaution(commonName: string, scientificName?: string) {
  const text = `${commonName} ${scientificName ?? ''}`.toLowerCase();

  if (
    text.includes('bear')
    || text.includes('ursus')
    || text.includes('mountain lion')
    || text.includes('cougar')
    || text.includes('puma concolor')
    || text.includes('rattlesnake')
    || text.includes('crotalus')
    || text.includes('sistrurus')
    || text.includes('gila monster')
    || text.includes('heloderma')
    || text.includes('coral snake')
    || text.includes('micruroides')
  ) {
    return {
      level: 'caution' as WildlifeCautionLevel,
      summary: 'Priority wildlife observation near camp.',
    };
  }

  if (
    text.includes('bobcat')
    || text.includes('lynx')
    || text.includes('coyote')
    || text.includes('canis latrans')
    || text.includes('javelina')
    || text.includes('peccary')
    || text.includes('fox')
    || text.includes('skunk')
    || text.includes('badger')
  ) {
    return {
      level: 'watch' as WildlifeCautionLevel,
      summary: 'Notable wildlife observation near camp.',
    };
  }

  return {
    level: 'info' as WildlifeCautionLevel,
    summary: 'Recent wildlife observation near camp.',
  };
}

function parseINaturalistCoordinates(observation: INaturalistObservation): WildlifeCoordinates | undefined {
  const coords = observation.geojson?.coordinates;
  if (
    Array.isArray(coords)
    && coords.length >= 2
    && typeof coords[0] === 'number'
    && typeof coords[1] === 'number'
  ) {
    return { lng: coords[0], lat: coords[1] };
  }

  const location = observation.location;
  if (!location) return undefined;
  const [latRaw, lngRaw] = location.split(',');
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function iNaturalistPhotoUrl(observation: INaturalistObservation) {
  const photo = observation.photos?.[0];
  return photo?.medium_url ?? photo?.url?.replace('/square.', '/medium.') ?? photo?.square_url ?? undefined;
}

async function fetchINaturalistSightings(location: WildlifeCoordinates, radiusKm: number): Promise<SourceResult<WildlifeSighting>> {
  try {
    const params = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      radius: String(radiusKm),
      order: 'desc',
      order_by: 'observed_on',
      per_page: '48',
      photos: 'true',
      captive: 'false',
      locale: 'en-US',
    });
    params.append('quality_grade', 'research');
    params.append('quality_grade', 'needs_id');
    params.append('iconic_taxa', 'Mammalia');
    params.append('iconic_taxa', 'Reptilia');

    const res = await fetch(`https://api.inaturalist.org/v1/observations?${params.toString()}`, {
      headers: JSON_HEADERS,
      next: { revalidate: 900 },
    });

    if (!res.ok) return { items: [], health: 'degraded' };
    const data = await res.json() as { results?: INaturalistObservation[] };
    const observations = Array.isArray(data.results) ? data.results : [];

    const items = observations.map((observation): WildlifeSighting | null => {
      const commonName = observation.taxon?.preferred_common_name
        || observation.taxon?.name
        || 'Unidentified wildlife';
      const scientificName = observation.taxon?.name ?? undefined;
      const coordinates = parseINaturalistCoordinates(observation);
      const caution = classifyCaution(commonName, scientificName);
      const category = categoryFromIconicTaxon(observation.taxon?.iconic_taxon_name);
      const distanceMiles = coordinates ? roundDistance(haversineMiles(location, coordinates)) : undefined;

      return {
        id: `inat-${observation.id ?? `${commonName}-${observation.observed_on ?? 'unknown'}`}`,
        source: 'INATURALIST',
        commonName,
        scientificName,
        category,
        observedAt: observation.time_observed_at ?? observation.observed_on ?? undefined,
        place: observation.place_guess ?? undefined,
        distanceMiles,
        observationUrl: observation.uri,
        photoUrl: iNaturalistPhotoUrl(observation),
        coordinates,
        cautionLevel: caution.level,
        summary: distanceMiles === undefined ? caution.summary : `${caution.summary} ${distanceMiles} mi from camp.`,
        confidence: observation.quality_grade === 'research' ? 'research-grade' : 'community',
      };
    }).filter((item): item is WildlifeSighting => item !== null);

    return { items, health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

async function fetchEBirdSightings(location: WildlifeCoordinates, radiusKm: number): Promise<SourceResult<WildlifeSighting>> {
  const token = envValue('EBIRD_API_KEY', 'EBIRD_TOKEN', 'CORNELL_EBIRD_API_KEY');
  if (!token) return { items: [], health: 'missing-key' };

  try {
    const params = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      dist: String(Math.min(Math.ceil(radiusKm), 50)),
      back: '14',
      maxResults: '40',
      includeProvisional: 'true',
    });

    const res = await fetch(`https://api.ebird.org/v2/data/obs/geo/recent?${params.toString()}`, {
      headers: {
        ...JSON_HEADERS,
        'X-eBirdApiToken': token,
      },
      next: { revalidate: 900 },
    });

    if (res.status === 401 || res.status === 403) return { items: [], health: 'error' };
    if (!res.ok) return { items: [], health: 'degraded' };

    const observations = await res.json() as EBirdObservation[];
    if (!Array.isArray(observations)) return { items: [], health: 'degraded' };

    const items = observations.map((observation): WildlifeSighting => {
      const coordinates = typeof observation.lat === 'number' && typeof observation.lng === 'number'
        ? { lat: observation.lat, lng: observation.lng }
        : undefined;
      const distanceMiles = coordinates ? roundDistance(haversineMiles(location, coordinates)) : undefined;
      const checklistUrl = observation.subId ? `https://ebird.org/checklist/${observation.subId}` : undefined;

      return {
        id: `ebird-${observation.subId ?? observation.speciesCode ?? observation.comName}-${observation.obsDt ?? 'unknown'}`,
        source: 'EBIRD',
        commonName: observation.comName ?? 'Bird observation',
        scientificName: observation.sciName,
        category: 'Bird',
        observedAt: observation.obsDt,
        place: observation.locName,
        distanceMiles,
        count: observation.howMany,
        observationUrl: checklistUrl,
        coordinates,
        cautionLevel: 'info',
        summary: distanceMiles === undefined ? 'Recent bird observation near camp.' : `Recent bird observation ${distanceMiles} mi from camp.`,
        confidence: observation.obsReviewed ? 'reviewed' : observation.obsValid ? 'valid' : 'provisional',
      };
    });

    return { items, health: 'ok' };
  } catch {
    return { items: [], health: 'error' };
  }
}

function configuredHabiMapLayers() {
  const raw = envValue('HABIMAP_LAYER_URLS', 'AZGFD_HABIMAP_LAYER_URLS');
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function normalizeArcGisLayerUrl(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/query') ? trimmed.slice(0, -6) : trimmed;
}

function attrValue(attributes: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(attributes);
  for (const candidate of candidates) {
    const match = entries.find(([key]) => key.toLowerCase() === candidate.toLowerCase());
    if (match && match[1] !== null && match[1] !== undefined && String(match[1]).trim()) {
      return String(match[1]);
    }
  }
  return undefined;
}

function usefulAttributeLines(attributes: Record<string, unknown>) {
  const blocked = new Set(['objectid', 'fid', 'shape', 'shape_area', 'shape_length', 'globalid']);
  return Object.entries(attributes)
    .filter(([key, value]) => !blocked.has(key.toLowerCase()) && value !== null && value !== undefined && String(value).trim())
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

async function queryHabiMapLayer(rawLayerUrl: string, location: WildlifeCoordinates, radiusKm: number, layerIndex: number) {
  const layerUrl = normalizeArcGisLayerUrl(rawLayerUrl);
  const metadataUrl = new URL(layerUrl);
  metadataUrl.searchParams.set('f', 'json');

  const queryUrl = new URL(`${layerUrl}/query`);
  queryUrl.searchParams.set('f', 'json');
  queryUrl.searchParams.set('where', '1=1');
  queryUrl.searchParams.set('geometry', JSON.stringify({
    x: location.lng,
    y: location.lat,
    spatialReference: { wkid: 4326 },
  }));
  queryUrl.searchParams.set('geometryType', 'esriGeometryPoint');
  queryUrl.searchParams.set('inSR', '4326');
  queryUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  queryUrl.searchParams.set('distance', String(Math.round(radiusKm * 1000)));
  queryUrl.searchParams.set('units', 'esriSRUnit_Meter');
  queryUrl.searchParams.set('outFields', '*');
  queryUrl.searchParams.set('returnGeometry', 'false');
  queryUrl.searchParams.set('resultRecordCount', '8');

  const [metadataResponse, queryResponse] = await Promise.all([
    fetch(metadataUrl, { headers: JSON_HEADERS, next: { revalidate: 900 } }),
    fetch(queryUrl, { headers: JSON_HEADERS, next: { revalidate: 900 } }),
  ]);

  const metadata = metadataResponse.ok ? await metadataResponse.json() as ArcGisLayerMetadata : null;
  const layerName = metadata?.name || metadata?.title || `HabiMap layer ${layerIndex + 1}`;
  if (metadata?.error?.message) throw new Error(metadata.error.message);
  if (!queryResponse.ok) throw new Error(`HabiMap layer returned ${queryResponse.status}`);

  const data = await queryResponse.json() as ArcGisQueryResponse;
  if (data.error?.message) throw new Error(data.error.message);

  const features = Array.isArray(data.features) ? data.features : [];
  return features.map((feature, featureIndex): HabitatRecord => {
    const attributes = feature.attributes ?? {};
    const title = attrValue(attributes, [
      'COMMONNAME',
      'CommonName',
      'Species',
      'SPECIES',
      'S_NAME',
      'NAME',
      'LABEL',
      'HABITAT',
      'CLASS',
    ]) ?? layerName;
    const details = usefulAttributeLines(attributes).join(' | ') || 'Official AZGFD HabiMap feature intersects this camp radius.';

    return {
      id: `habimap-${layerIndex}-${featureIndex}-${attrValue(attributes, ['OBJECTID', 'FID', 'GLOBALID']) ?? title}`,
      source: 'HABIMAP',
      title,
      layerName,
      details,
      url: layerUrl,
      confidence: 'official',
    };
  });
}

async function fetchHabiMapRecords(location: WildlifeCoordinates, radiusKm: number): Promise<SourceResult<HabitatRecord>> {
  const layers = configuredHabiMapLayers();
  if (layers.length === 0) return { items: [], health: 'needs-config' };

  const results = await Promise.allSettled(
    layers.map((layerUrl, index) => queryHabiMapLayer(layerUrl, location, radiusKm, index))
  );

  const records = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const failedCount = results.filter((result) => result.status === 'rejected').length;

  if (failedCount === results.length) return { items: [], health: 'error' };
  return {
    items: records.slice(0, 12),
    health: failedCount > 0 ? 'degraded' : 'ok',
  };
}

function sightingSortScore(sighting: WildlifeSighting) {
  const cautionScore = { caution: 3, watch: 2, info: 1 }[sighting.cautionLevel];
  const dateScore = sighting.observedAt ? Date.parse(sighting.observedAt) || 0 : 0;
  const distanceScore = sighting.distanceMiles === undefined ? 0 : Math.max(0, 100 - sighting.distanceMiles);
  return cautionScore * 1_000_000_000_000_000 + dateScore + distanceScore;
}

function summarize(sightings: WildlifeSighting[]): WildlifeAggregatorResponse['summary'] {
  return {
    totalSightings: sightings.length,
    cautionCount: sightings.filter((item) => item.cautionLevel === 'caution').length,
    watchCount: sightings.filter((item) => item.cautionLevel === 'watch').length,
    mammalCount: sightings.filter((item) => item.category === 'Mammal').length,
    reptileCount: sightings.filter((item) => item.category === 'Reptile').length,
    birdCount: sightings.filter((item) => item.category === 'Bird').length,
  };
}

function resolve<T>(result: PromiseSettledResult<SourceResult<T>>, fallbackHealth: WildlifeSourceHealthStatus): SourceResult<T> {
  return result.status === 'fulfilled' ? result.value : { items: [], health: fallbackHealth };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const location = {
    lat: parseNumberParam(url.searchParams, 'lat', CAMP_LAT, -90, 90),
    lng: parseNumberParam(url.searchParams, 'lng', CAMP_LNG, -180, 180),
  };
  const radiusKm = parseNumberParam(url.searchParams, 'radiusKm', DEFAULT_RADIUS_KM, 1, MAX_RADIUS_KM);

  const [iNaturalistResult, eBirdResult, habiMapResult] = await Promise.allSettled([
    fetchINaturalistSightings(location, radiusKm),
    fetchEBirdSightings(location, radiusKm),
    fetchHabiMapRecords(location, radiusKm),
  ]);

  const iNaturalist = resolve(iNaturalistResult, 'error');
  const eBird = resolve(eBirdResult, envValue('EBIRD_API_KEY', 'EBIRD_TOKEN', 'CORNELL_EBIRD_API_KEY') ? 'error' : 'missing-key');
  const habiMap = resolve(habiMapResult, configuredHabiMapLayers().length > 0 ? 'error' : 'needs-config');

  const sightings = [...iNaturalist.items, ...eBird.items]
    .sort((a, b) => sightingSortScore(b) - sightingSortScore(a))
    .slice(0, 72);

  const response: WildlifeAggregatorResponse = {
    location: {
      label: 'Camp Lawton / Mount Lemmon',
      lat: location.lat,
      lng: location.lng,
      radiusKm,
    },
    sightings,
    habitats: habiMap.items,
    sourceHealth: {
      INATURALIST: iNaturalist.health,
      EBIRD: eBird.health,
      HABIMAP: habiMap.health,
    },
    summary: summarize(sightings),
    lastChecked: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
    },
  });
}
