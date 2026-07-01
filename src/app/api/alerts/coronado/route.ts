import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export interface CoronadoAlert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  effectiveDate?: string;
  orderNumber?: string;
  url?: string;
  source: 'USFS';
  timestamp: string;
}

export async function GET() {
  // Try new URL first, fall back to old one
  const urls = [
    'https://www.fs.usda.gov/r03/coronado/alerts',
    'https://www.fs.usda.gov/alerts/coronado/alerts-notices',
  ];

  let html = '';
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CampLawtonStaffHub/1.0 (contact@camplawton.org)',
          'Accept': 'text/html',
        },
        next: { revalidate: 3600 },
      });
      if (response.ok) {
        html = await response.text();
        break;
      }
    } catch {
      // try next url
    }
  }

  if (!html) {
    return NextResponse.json({ alerts: [] }, { status: 200 });
  }

  const $ = cheerio.load(html);
  const alerts: CoronadoAlert[] = [];

  const levelFromText = (text: string): CoronadoAlert['level'] => {
    const lower = text.toLowerCase();
    if (lower.includes('critical') || lower.includes('closure') || lower.includes('evacuation')) return 'critical';
    if (lower.includes('fire restriction') || lower.includes('red flag') || lower.includes('warning') || lower.includes('fire')) return 'warning';
    return 'info';
  };

  // Strategy 1: Look for structured alert items with headings + content
  $('article, .alert-item, .view-row, .views-row').each((i, el) => {
    const titleEl = $(el).find('h2, h3, h4, .views-field-title, .field-title').first();
    const title = titleEl.text().trim();
    const bodyEl = $(el).find('p, .views-field-body, .field-body').first();
    const body = bodyEl.text().trim();
    const linkEl = $(el).find('a').first();
    const href = linkEl.attr('href');

    if (title) {
      alerts.push({
        id: `usfs-${i}`,
        level: levelFromText(title + ' ' + body),
        title,
        message: body || title,
        url: href ? (href.startsWith('http') ? href : `https://www.fs.usda.gov${href}`) : undefined,
        source: 'USFS',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Strategy 2: List items under "Alerts" heading
  if (alerts.length === 0) {
    $('h2, h3').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase();
      if (headingText.includes('alert') || headingText.includes('notice') || headingText.includes('closure') || headingText.includes('restriction')) {
        $(heading).nextAll('ul').first().find('li').each((i, li) => {
          const text = $(li).text().trim();
          const linkEl = $(li).find('a').first();
          const href = linkEl.attr('href');
          if (text) {
            alerts.push({
              id: `usfs-list-${i}`,
              level: levelFromText(text),
              title: text.slice(0, 100),
              message: text,
              url: href ? (href.startsWith('http') ? href : `https://www.fs.usda.gov${href}`) : undefined,
              source: 'USFS',
              timestamp: new Date().toISOString(),
            });
          }
        });
      }
    });
  }

  // Strategy 3: box-feature fallback
  if (alerts.length === 0) {
    $('.box-feature, .alert-box, [class*="alert"]').find('li a, p a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      if (text && text.length > 5) {
        alerts.push({
          id: `usfs-fb-${i}`,
          level: levelFromText(text),
          title: text.slice(0, 100),
          message: text,
          url: href ? (href.startsWith('http') ? href : `https://www.fs.usda.gov${href}`) : undefined,
          source: 'USFS',
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  return NextResponse.json({ alerts: alerts.slice(0, 10) });
}
