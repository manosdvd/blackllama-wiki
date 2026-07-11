import { NextResponse } from 'next/server';

export type PredatorSpecies = 'black-bear' | 'mountain-lion';
export type PredatorRecency = 'recent' | 'within-year' | 'historical';
export type PredatorSourceHealth = 'ok' | 'degraded' | 'error';

export interface PredatorSighting {
  id: string;
  species: PredatorSpecies;
  commonName: string;
  scientificName: string;
  observedAt?: string;
  place?: string;
  distanceMiles?: number;
  approximateLocation: boolean;
  observationUrl?: string;
  photoUrl?: string;
  qualityGrade: 'research-grade' | 'community';
  recency: PredatorRecency;
  ageDays?: number;
  summary: string;
}

export interface PredatorWatchResponse {
  location: {
    label: string;
    lat: number;
    lng: number;
    radiusMiles: number;
  };
  lookbackDays: number;
  sightings: PredatorSighting[];
  summary: {
    total: number;
    blackBear: number;
    mountainLion: number;
    recent: number;
    withinYear: number;
  };
  sourceHealth: PredatorSourceHealth;
  sourceName: 'iNaturalist';
  officialGuidanceUrl: string;
  note: string;
  lastChecked: string;
}

interface INaturalistObservation {
  id?: number;
  observed_on?: string | null;
  time_observed_at?: string | null;
  uri?: string;
  place_guess?: string | null;
  quality_grade?: string | null;
  location?: string | null;
  obscured?: boolean | null;
  geoprivacy?: string | null;
  geojson?: {
    coordinates?: unknown;
  } | null;
  taxon?: {
    name?: string | null;
    preferred_common_name?: string | null;
  } | null;
  photos?: Array<{
    url?: string | null;
    medium_url?: string | null;
    square_url?: string | null;
  }>;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface SpeciesConfig {
  species: PredatorSpecies;
  commonName: string;
  scientificName: string;
}

interface SpeciesFetchResult {
  sightings: PredatorSighting[];
  ok: boolean;
}

const CAMP: Coordinates = { lat: 32.398, lng: -110.725 };
const DEFAULT_RADIUS_MILES = 15;
const MAX_RADIUS_MILES = 25;
const DEFAULT_LOOKBACK_DAYS = 5 * 365;
const MAX_LOOKBACK_DAYS = 10 * 365;
const RECENT_DAYS = 90;
const ONE_YEAR_DAYS = 365;

const SPECIES: SpeciesConfig[] = [
  {
    species: 'black-bear',
    commonName: 'American Black Bear',
    scientificName: 'Ursus americanus',
  },
  {
    species: 'mountain-lion',
    commonName: 'Mountain Lion',
    scientificName: 'Puma concolor',
  },
];

const JSON_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'CampLawtonStaffHub/1.0 (predator observation watch)',
};

function parseNumberParam(
  searchParams: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = searchParams.get(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function haversineMiles(a: Coordinates, b: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 0.621371;
}

function parseCoordinates(observation: INaturalistObservation): Coordinates | undefined {
  const coords = observation.geojson?.coordinates;
  if (
    Array.isArray(coords)
    && coords.length >= 2
    && typeof coords[0] === 'number'
    && typeof coords[1] === 'number'
  ) {
    return { lng: coords[0], lat: coords[1] };
  }

  if (!observation.location) return undefined;
  const [latRaw, lngRaw] = observation.location.split(',');
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function photoUrl(observation: INaturalistObservation) {
  const photo = observation.photos?.[0];
  return photo?.medium_url
    ?? photo?.url?.replace('/square.', '/medium.')
    ?? photo?.square_url
    ?? undefined;
}

function ageInDays(observedAt?: string) {
  if (!observedAt) return undefined;
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return undefined;
  return Math.max(0, Math.floor((Date.now() - observed) / 86_400_000));
}

function recencyFor(ageDays?: number): PredatorRecency {
  if (ageDays === undefined) return 'historical';
  if (ageDays <= RECENT_DAYS) return 'recent';
  if (ageDays <= ONE_YEAR_DAYS) return 'within-year';
  return 'historical';
}

function recencyLabel(recency: PredatorRecency) {
  if (recency === 'recent') return 'Recent public observation';
  if (recency === 'within-year') return 'Public observation within the past year';
  return 'Historical public observation';
}

function mapObservation(
  observation: INaturalistObservation,
  config: SpeciesConfig,
  origin: Coordinates,
  radiusMiles: number,
): PredatorSighting | null {
  const returnedTaxon = observation.taxon?.name?.toLowerCase();
  if (returnedTaxon !== config.scientificName.toLowerCase()) return null;

  const observedAt = observation.time_observed_at ?? observation.observed_on ?? undefined;
  const ageDays = ageInDays(observedAt);
  const recency = recencyFor(ageDays);
  const coordinates = parseCoordinates(observation);
  const approximateLocation = observation.obscured === true || observation.geoprivacy === 'obscured';
  const measuredDistance = coordinates && !approximateLocation
    ? roundDistance(haversineMiles(origin, coordinates))
    : undefined;

  if (measuredDistance !== undefined && measuredDistance > radiusMiles + 0.1) return null;

  const locationSummary = approximateLocation
    ? 'The public location is intentionally obscured.'
    : measuredDistance !== undefined
      ? `${measuredDistance} mi from camp.`
      : `Returned inside the ${radiusMiles}-mile search radius.`;

  return {
    id: `inat-predator-${observation.id ?? `${config.species}-${observation.observed_on ?? 'unknown'}`}`,
    species: config.species,
    commonName: observation.taxon?.preferred_common_name || config.commonName,
    scientificName: config.scientificName,
    observedAt,
    place: observation.place_guess ?? undefined,
    distanceMiles: measuredDistance,
    approximateLocation,
    observationUrl: observation.uri,
    photoUrl: photoUrl(observation),
    qualityGrade: observation.quality_grade === 'research' ? 'research-grade' : 'community',
    recency,
    ageDays,
    summary: `${recencyLabel(recency)}. ${locationSummary}`,
  };
}

async function fetchSpecies(
  config: SpeciesConfig,
  origin: Coordinates,
  radiusMiles: number,
  lookbackDays: number,
): Promise<SpeciesFetchResult> {
  try {
    const earliest = new Date(Date.now() - lookbackDays * 86_400_000);
    const params = new URLSearchParams({
      lat: String(origin.lat),
      lng: String(origin.lng),
      radius: String(radiusMiles * 1.609344),
      taxon_name: config.scientificName,
      d1: toDateOnly(earliest),
      order: 'desc',
      order_by: 'observed_on',
      per_page: '50',
      captive: 'false',
      verifiable: 'true',
      locale: 'en-US',
    });
    params.append('quality_grade', 'research');
    params.append('quality_grade', 'needs_id');

    const response = await fetch(`https://api.inaturalist.org/v1/observations?${params.toString()}`, {
      headers: JSON_HEADERS,
      next: { revalidate: 900 },
    });

    if (!response.ok) return { sightings: [], ok: false };
    const data = await response.json() as { results?: INaturalistObservation[] };
    const observations = Array.isArray(data.results) ? data.results : [];
    const sightings = observations
      .map((observation) => mapObservation(observation, config, origin, radiusMiles))
      .filter((item): item is PredatorSighting => item !== null)
      .slice(0, 12);

    return { sightings, ok: true };
  } catch {
    return { sightings: [], ok: false };
  }
}

function observedTime(sighting: PredatorSighting) {
  if (!sighting.observedAt) return 0;
  return Date.parse(sighting.observedAt) || 0;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const radiusMiles = parseNumberParam(
    url.searchParams,
    'radiusMiles',
    DEFAULT_RADIUS_MILES,
    1,
    MAX_RADIUS_MILES,
  );
  const lookbackDays = Math.round(parseNumberParam(
    url.searchParams,
    'lookbackDays',
    DEFAULT_LOOKBACK_DAYS,
    30,
    MAX_LOOKBACK_DAYS,
  ));

  const results = await Promise.all(
    SPECIES.map((config) => fetchSpecies(config, CAMP, radiusMiles, lookbackDays)),
  );

  const sightings = results
    .flatMap((result) => result.sightings)
    .sort((a, b) => observedTime(b) - observedTime(a));
  const successfulSources = results.filter((result) => result.ok).length;
  const sourceHealth: PredatorSourceHealth = successfulSources === results.length
    ? 'ok'
    : successfulSources > 0
      ? 'degraded'
      : 'error';

  const response: PredatorWatchResponse = {
    location: {
      label: 'Camp Lawton / Mount Bigelow',
      lat: CAMP.lat,
      lng: CAMP.lng,
      radiusMiles,
    },
    lookbackDays,
    sightings,
    summary: {
      total: sightings.length,
      blackBear: sightings.filter((item) => item.species === 'black-bear').length,
      mountainLion: sightings.filter((item) => item.species === 'mountain-lion').length,
      recent: sightings.filter((item) => item.recency === 'recent').length,
      withinYear: sightings.filter((item) => item.recency !== 'historical').length,
    },
    sourceHealth,
    sourceName: 'iNaturalist',
    officialGuidanceUrl: 'https://www.azgfd.com/wildlife-conservation/living-with-wildlife/',
    note: 'Public iNaturalist observations are community-submitted, not real-time animal tracking or official incident reports. Some locations are intentionally obscured.',
    lastChecked: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
    },
  });
}
