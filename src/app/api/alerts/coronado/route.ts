import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET() {
  try {
    const response = await fetch('https://www.fs.usda.gov/alerts/coronado/alerts-notices', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' // Some sites block fetch without UA
      },
      next: { revalidate: 3600 } // Cache for 1 hour to respect USFS servers
    });

    if (!response.ok) {
      throw new Error('Failed to fetch from FS');
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const alerts: any[] = [];

    // The USFS alerts page usually has tables or divs for alerts.
    // Looking at the standard structure, alerts are often in a list or div with class 'alert' or just under headers.
    // We will look for h4 tags or strong tags that might contain the alerts, or grab the specific alerts table.
    
    // A robust way for Coronado: look for links in the right-column or main content that indicate an alert.
    // Or we can just look for text that contains 'Closure' or 'Restriction'.
    // The specific page has a main content area.
    $('.center-content h2:contains("Alerts"), .center-content h2:contains("Notices")').nextAll('ul').first().find('li').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        let level = 'warning';
        if (text.toLowerCase().includes('closure') || text.toLowerCase().includes('fire')) {
          level = 'critical';
        }
        alerts.push({
          id: `fs-alert-${i}`,
          level,
          message: text,
          source: 'Coronado NF',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Fallback if the standard list isn't found, try finding any <strong> or <a> tags that look like alerts in the main body
    if (alerts.length === 0) {
      $('.box-feature').find('li a').each((i, el) => {
        const text = $(el).text().trim();
        if (text) {
          alerts.push({
            id: `fs-fallback-alert-${i}`,
            level: 'warning',
            message: text,
            source: 'Coronado NF',
            timestamp: new Date().toISOString()
          });
        }
      });
    }

    return NextResponse.json({ alerts });

  } catch (err) {
    console.error('Error fetching Coronado NF alerts:', err);
    return NextResponse.json({ alerts: [] }, { status: 500 });
  }
}
