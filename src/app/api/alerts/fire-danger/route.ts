import { NextResponse } from 'next/server';
import { load } from 'cheerio';

const CORONADO_ALERTS_URL = 'https://www.fs.usda.gov/r03/coronado/alerts';
const USER_AGENT = 'CampLawtonStaffHub/1.0 (contact@camplawton.org)';

export type FireDangerLevel = 'normal' | 'info' | 'watch' | 'warning' | 'critical';
export type FireDangerLabel = 'Low' | 'Moderate' | 'High' | 'Very High' | 'Extreme' | 'Unavailable';

export interface FireDangerResponse {
  label: FireDangerLabel;
  level: FireDangerLevel;
  health: 'ok' | 'degraded';
  sourceUrl: string;
  fetchedAt: string;
}

const LABELS: Record<string, Exclude<FireDangerLabel, 'Unavailable'>> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  'very high': 'Very High',
  extreme: 'Extreme',
};

function levelForDanger(label: FireDangerLabel): FireDangerLevel {
  switch (label) {
    case 'Low': return 'normal';
    case 'Moderate': return 'info';
    case 'High': return 'watch';
    case 'Very High': return 'warning';
    case 'Extreme': return 'critical';
    default: return 'info';
  }
}

function parseFireDanger(html: string): FireDangerLabel {
  const $ = load(html);
  $('script, style, noscript').remove();
  const pageText = $('body').text().replace(/\s+/g, ' ').trim();
  const match = pageText.match(/\bFire Danger Status\b\s*:?[\s-]*(Very High|Extreme|High|Moderate|Low)\b/i);
  if (!match) return 'Unavailable';

  const normalized = match[1].toLowerCase().replace(/\s+/g, ' ');
  return LABELS[normalized] ?? 'Unavailable';
}

function response(label: FireDangerLabel, health: FireDangerResponse['health']) {
  const payload: FireDangerResponse = {
    label,
    level: levelForDanger(label),
    health,
    sourceUrl: CORONADO_ALERTS_URL,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
    },
  });
}

export async function GET() {
  try {
    const res = await fetch(CORONADO_ALERTS_URL, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return response('Unavailable', 'degraded');

    const label = parseFireDanger(await res.text());
    return response(label, label === 'Unavailable' ? 'degraded' : 'ok');
  } catch {
    return response('Unavailable', 'degraded');
  }
}
