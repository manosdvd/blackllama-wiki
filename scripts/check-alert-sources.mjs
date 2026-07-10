import { writeFile } from 'node:fs/promises';

const CAMP_LAT = 32.39806;
const CAMP_LON = -110.725;
const WFIGS_BBOX = '-111.05,32.20,-110.45,32.65';
const PIMA_RADIUS_METERS = 8046.72;
const currentYear = new Date().getUTCFullYear();

const checks = [
  {
    id: 'NWS_ALERTS',
    url: `https://api.weather.gov/alerts/active?point=${CAMP_LAT},${CAMP_LON}`,
    validate: (payload) => Array.isArray(payload?.features),
    summarize: (payload) => ({ activeAlerts: payload.features.length }),
  },
  {
    id: 'NWS_POINT',
    url: `https://api.weather.gov/points/${CAMP_LAT},${CAMP_LON}`,
    validate: (payload) => typeof payload?.properties?.forecast === 'string',
    summarize: (payload) => ({ forecastUrl: payload.properties.forecast }),
  },
  {
    id: 'NWS_STATION',
    url: 'https://api.weather.gov/stations/QSLA3/observations/latest?require_qc=false',
    validate: (payload) => payload?.properties && typeof payload.properties === 'object',
    summarize: (payload) => ({ timestamp: payload.properties.timestamp ?? null }),
  },
  {
    id: 'USFS',
    url: 'https://www.fs.usda.gov/r03/coronado/alerts',
    responseType: 'text',
    validate: (text) => typeof text === 'string' && text.includes('Forest Alerts'),
    summarize: (text) => ({ bytes: text.length, noFireRestrictions: /No Fire Restrictions/i.test(text) }),
  },
  {
    id: 'WFIGS',
    url: `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=1%3D1&geometry=${encodeURIComponent(WFIGS_BBOX)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=poly_IncidentName%2Cattr_FireDiscoveryDateTime%2Cattr_IncidentSize%2Cirwin_ModifiedOnDateTime_dt%2CGISAcres&returnGeometry=false&f=json`,
    validate: (payload) => Array.isArray(payload?.features) && !payload?.error,
    summarize: (payload) => ({ features: payload.features.length, serviceError: payload.error ?? null }),
  },
  {
    id: 'WILDCAD',
    url: 'https://snknmqmon6.execute-api.us-west-2.amazonaws.com/centers/AZTDC/incidents?loc=MT%20BIGALOW',
    validate: (payload) => Array.isArray(payload) || Array.isArray(payload?.incidents) || Array.isArray(payload?.data),
    summarize: (payload) => ({ records: Array.isArray(payload) ? payload.length : (payload.incidents ?? payload.data ?? []).length }),
  },
  {
    id: 'PIMA_GIS',
    url: `https://services2.arcgis.com/UTBp78iglGpbqp1B/arcgis/rest/services/Pima_County_CWPP_Fire_Perimeters/FeatureServer/279/query?where=${encodeURIComponent(`Year >= ${currentYear - 1}`)}&geometry=${CAMP_LON}%2C${CAMP_LAT}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=${PIMA_RADIUS_METERS}&units=esriSRUnit_Meter&outFields=OBJECTID%2CIncidentName%2CYear%2CSize_Acres%2CDate&returnGeometry=false&f=json`,
    validate: (payload) => Array.isArray(payload?.features) && !payload?.error,
    summarize: (payload) => ({ features: payload.features.length, serviceError: payload.error ?? null }),
  },
];

async function checkSource(check) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(check.url, {
      headers: {
        Accept: check.responseType === 'text' ? 'text/html,*/*' : 'application/json,*/*',
        'User-Agent': 'CampLawtonStaffHub/1.0 (alert source diagnostic)',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const payload = check.responseType === 'text' ? await response.text() : await response.json();
    const valid = response.ok && check.validate(payload);

    return {
      id: check.id,
      enabledRecommendation: valid,
      ok: response.ok,
      valid,
      status: response.status,
      contentType: response.headers.get('content-type'),
      durationMs: Date.now() - startedAt,
      summary: check.summarize(payload),
      error: valid ? null : `Response failed validation for ${check.id}`,
    };
  } catch (error) {
    return {
      id: check.id,
      enabledRecommendation: false,
      ok: false,
      valid: false,
      status: null,
      durationMs: Date.now() - startedAt,
      summary: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const check of checks) results.push(await checkSource(check));

const report = {
  checkedAt: new Date().toISOString(),
  results,
  allWorking: results.every((result) => result.valid),
};

await writeFile('alert-source-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
