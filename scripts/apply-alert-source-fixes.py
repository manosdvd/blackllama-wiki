from pathlib import Path

route_path = Path('src/app/api/alerts/fire/route.ts')
hud_path = Path('src/components/layout/AlertsHUD.tsx')
route = route_path.read_text()
hud = hud_path.read_text()

route = route.replace(
    "export type FireAlertSource = 'NWS' | 'USFS' | 'WFIGS' | 'NOAA_HMS' | 'WILDCAD' | 'PIMA_GIS';",
    "export type FireAlertSource = 'NWS' | 'USFS' | 'WFIGS' | 'WILDCAD' | 'PIMA_GIS';",
)
route = route.replace(
    "const ACTIVE_FIRE_ALERT_SOURCES: FireAlertSource[] = ['NWS', 'USFS', 'WFIGS', 'NOAA_HMS', 'WILDCAD', 'PIMA_GIS'];",
    "const ACTIVE_FIRE_ALERT_SOURCES: FireAlertSource[] = ['NWS', 'USFS', 'WFIGS', 'WILDCAD', 'PIMA_GIS'];",
)
route = route.replace("    NOAA_HMS: 'ok',\n", '')

highest_level = """function highestLevel(levels: FireAlertLevel[]): FireAlertLevel {
  return levels.reduce((best, current) =>
    levelToScore(current) > levelToScore(best) ? current : best,
    'normal' as FireAlertLevel
  );
}
"""
health_helper = highest_level + """
function combineSourceHealth(...statuses: SourceHealthStatus[]): SourceHealthStatus {
  if (statuses.every((status) => status === 'ok')) return 'ok';
  if (statuses.every((status) => status === 'error')) return 'error';
  return 'degraded';
}
"""
if 'function combineSourceHealth(' not in route:
    if highest_level not in route:
        raise RuntimeError('Could not locate highestLevel helper')
    route = route.replace(highest_level, health_helper)

old_usfs = """    const levelFromText = (text: string): FireAlertLevel => {
      const t = text.toLowerCase();
      if (t.includes('evacuation') || t.includes('critical closure')) return 'critical';
      if (t.includes('closure') || t.includes('fire restriction') || t.includes('red flag') || t.includes('fire')) return 'warning';
      if (t.includes('caution') || t.includes('watch')) return 'watch';
      return 'info';
    };
"""
new_usfs = """    const levelFromText = (text: string): FireAlertLevel => {
      const t = text.toLowerCase();
      if (/no (?:active )?fire restrictions|fire restrictions? (?:have been )?lifted/.test(t)) return 'normal';
      if (t.includes('evacuation') || t.includes('critical closure')) return 'critical';
      if (t.includes('closure') || t.includes('fire restriction') || t.includes('red flag') || t.includes('fire')) return 'warning';
      if (t.includes('caution') || t.includes('watch')) return 'watch';
      return 'info';
    };
"""
if old_usfs in route:
    route = route.replace(old_usfs, new_usfs)
route = route.replace(
    "        const level = levelFromText(title + ' ' + body);\n        items.push({",
    "        const level = levelFromText(title + ' ' + body);\n        if (level === 'normal') return;\n        items.push({",
    1,
)
route = route.replace(
    "              const level = levelFromText(text);\n              items.push({",
    "              const level = levelFromText(text);\n              if (level === 'normal') return;\n              items.push({",
    1,
)

start = route.find('interface WFIGSFeature {')
end = route.find('interface PimaGisFirePerimeterFeature {')
if start < 0 or end < 0 or end <= start:
    raise RuntimeError('Could not locate WFIGS section')

wfigs = r'''interface WFIGSFeature {
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

'''
route = route[:start] + wfigs + route[end:]
route = route.replace(
    '    sourceHealth.NWS = nwsAlertsData.health;',
    '    sourceHealth.NWS = combineSourceHealth(nwsAlertsData.health, nwsWeatherData.health);',
)

hud = hud.replace("  NOAA_HMS: 'HMS',\n", '')
hud = hud.replace("  NOAA_HMS: 'https://www.ospo.noaa.gov/products/land/hms.html',\n", '')

if 'NOAA_HMS' in route or 'NOAA_HMS' in hud:
    raise RuntimeError('NOAA_HMS references remain')
if 'poly_GISAcres' not in route or 'attr_ModifiedOnDateTime_dt' not in route:
    raise RuntimeError('WFIGS replacement did not apply')

route_path.write_text(route)
hud_path.write_text(hud)
