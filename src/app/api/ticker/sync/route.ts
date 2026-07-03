import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

interface NewsTickerItem {
  category: string;
  headline: string;
  source: string;
  link: string;
}

interface NewsTicker {
  ticker_metadata: {
    generated_at: string;
    target_location: string;
    refresh_rate_seconds: number;
  };
  items: NewsTickerItem[];
}

interface LiveTickerItem {
  id: string;
  title: string;
  url: string;
  category: string;
  source: string;
  sourceType: string;
  position: number;
  generatedAt: string;
  timestamp: FieldValue;
}

type TickerResponseItem = Omit<LiveTickerItem, 'timestamp'>;

const TARGET_LOCATION = 'Camp Lawton, Mt Lemmon, Santa Catalina Mountains';

// Stripped of https://, www., and extra whitespace to reduce input tokens significantly.
const COMPRESSED_FEEDS = [
  'onscouting.org/feed',
  'scoutlife.org/feed',
  'scoutingwire.org/feed',
  'scoutingnewsroom.org/feed',
  'nasa.gov/feeds/iotd-feed',
  'nasa.gov/feed',
  'atlasobscura.com/feeds/latest',
  'goodnewsnetwork.org/feed',
  'tucson.com/search/?f=rss&t=article&c=sports/outdoors',
  'lnt.org/feed',
  'fs.usda.gov/news/r3/news-events.xml',
  'azgfd.com/feed',
  'outsideonline.com/feed',
  'audubon.org/rss.xml',
  'allaboutbirds.org/news/feed',
  'apod.nasa.gov/apod.rss',
  'earthsky.org/feed',
  'smithsonianmag.com/rss/science-nature',
  'archives.gov/global-pages/rss/news.xml'
].join(',');

const COMPRESSED_QUERIES = [
  "AZ flag status('half staff')",
  "'Scouting America'",
  "'Catalina Council'",
  "'Mt. Lemmon'",
  'Summerhaven',
  'Dictionary.com Word of the Day',
  'Riddles.com Riddle of the Day(1 Q&A)',
  'This day in Scouting History',
  'NationalDayCalendar'
].join(',');

const MINIFIED_JOKES = '["What do you call a funny mountain? Hill-arious.","Why don\'t eggs tell jokes? They might crack up!","Did you hear about the circus fire? It was in tents!"]';

function getPhoenixDateStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function stripJsonMarkdown(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(text: string) {
  const stripped = stripJsonMarkdown(text);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

function normalizeTickerLink(link: string) {
  const trimmed = (link || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return '';
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTickerCategory(value: unknown) {
  const category = textValue(value) || 'DISPATCH';
  return category
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeGeneratedTicker(value: unknown): NewsTicker {
  if (!value || typeof value !== 'object') {
    throw new Error('Gemini returned a non-object ticker payload.');
  }

  const payload = value as Record<string, unknown>;
  const metadata = payload.ticker_metadata && typeof payload.ticker_metadata === 'object'
    ? payload.ticker_metadata as Record<string, unknown>
    : {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const headline = textValue(source.headline ?? source.title ?? source.text);
      if (!headline) return null;

      return {
        category: normalizeTickerCategory(source.category),
        headline,
        source: textValue(source.source) || 'Live Feed',
        link: textValue(source.link ?? source.url),
      };
    })
    .filter((item): item is NewsTickerItem => item !== null)
    .slice(0, 12);

  if (items.length === 0) {
    throw new Error('Gemini returned ticker JSON without any usable items.');
  }

  return {
    ticker_metadata: {
      generated_at: textValue(metadata.generated_at) || new Date().toISOString(),
      target_location: textValue(metadata.target_location) || TARGET_LOCATION,
      refresh_rate_seconds: Number(metadata.refresh_rate_seconds) || 3600,
    },
    items,
  };
}

function tickerResponseItem(item: LiveTickerItem): TickerResponseItem {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    category: item.category,
    source: item.source,
    sourceType: item.sourceType,
    position: item.position,
    generatedAt: item.generatedAt,
  };
}

function buildTickerPrompt() {
  return `
Loc:${TARGET_LOCATION}
Time Anchor:${getPhoenixDateStamp()}
Window:Last 24-48h. If undated, verify ongoing relevance.
Feeds:${COMPRESSED_FEEDS}
Queries:${COMPRESSED_QUERIES}
JokePool:${MINIFIED_JOKES}
Return only one valid JSON object with this exact shape:
{"ticker_metadata":{"generated_at":"ISO string","target_location":"string","refresh_rate_seconds":3600},"items":[{"category":"UPPERCASE LABEL","headline":"short ticker text","source":"publication/source name","link":"https://... or N/A"}]}
Rules:
- Return 6 to 10 items.
- Include exactly one item from JokePool with source "Camp Humor" and link "N/A".
- Prefer fresh, currently relevant items for the last 24-48 hours.
- Keep every headline under 140 characters.
`.trim();
}

async function generateTicker(apiKey: string): Promise<NewsTicker> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = [
    'You are a real-time news ticker automation engine.',
    'Use the Google Search tool to pull the latest headlines fitting the provided feeds, themes, and queries.',
    'Select exactly 1 joke from the JokePool.',
    'Output ONLY raw valid JSON conforming precisely to the requested shape.',
    'Do not include markdown code fences or conversational text.'
  ].join(' ');

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction,
    // Gemini currently rejects Google Search tool use when JSON MIME/schema mode is enabled.
    // Keep the grounding tool, then validate and normalize the plain-text JSON ourselves.
    tools: [{ googleSearch: {} }] as never,
    generationConfig: {
      temperature: 0.2
    } as never
  });

  const result = await model.generateContent(buildTickerPrompt());
  const responseText = result.response.text().trim();
  const parsed = JSON.parse(extractJsonObject(responseText)) as unknown;
  return normalizeGeneratedTicker(parsed);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    // Security check: If CRON_SECRET is defined, verify request matches secret or has an Admin role header
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const requestSecretHeader = req.headers.get('x-cron-secret');
      const requestSecretParam = url.searchParams.get('secret');
      let isAuthorized = (requestSecretHeader === cronSecret) || (requestSecretParam === cronSecret);

      if (!isAuthorized) {
        const authHeader = req.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.substring(7);
            const decodedToken = await getAdminAuth().verifyIdToken(token);
            if (decodedToken && decodedToken.admin === true) {
              isAuthorized = true;
            }
          } catch (authError) {
            console.error('Firebase Auth Verification failed in Ticker Sync:', authError);
          }
        }
      }

      if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
    }

    const db = getAdminDb();
    
    // Throttle to 1 hour to protect free tier
    if (!force) {
      try {
        const latestSnap = await db.collection('liveTicker').orderBy('timestamp', 'desc').limit(1).get();
        if (!latestSnap.empty) {
          const latestDoc = latestSnap.docs[0].data();
          if (latestDoc.timestamp && latestDoc.timestamp.toMillis) {
            const ageMs = Date.now() - latestDoc.timestamp.toMillis();
            if (ageMs < 55 * 60 * 1000) { // 55 minutes
              return NextResponse.json({ success: true, message: 'Already synced recently, skipping.' });
            }
          }
        }
      } catch (e) {
        console.warn('Could not read latest ticker item for throttling', e);
      }
    }

    const generatedTicker = await generateTicker(apiKey);
    const generatedAt = generatedTicker.ticker_metadata.generated_at || new Date().toISOString();

    const liveItems: LiveTickerItem[] = generatedTicker.items.map((item: NewsTickerItem, index) => {
      return {
        id: `live_${getPhoenixDateStamp()}_${String(index + 1).padStart(2, '0')}`,
        title: item.headline,
        url: normalizeTickerLink(item.link),
        category: item.category || 'DISPATCH',
        source: item.source || 'Live Feed',
        sourceType: 'live',
        position: index,
        generatedAt,
        timestamp: FieldValue.serverTimestamp()
      };
    });
    const responseItems = liveItems.map(tickerResponseItem);

    // If Admin SDK is initialized and working, write to Firestore
    try {
      // We are requested to "Only show current/recent stuff"
      // Replace old items in liveTicker with the new generated set.
      const batch = db.batch();
      const snapshot = await db.collection('liveTicker').get();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      liveItems.forEach((item: LiveTickerItem) => {
        const docRef = db.collection('liveTicker').doc(item.id);
        batch.set(docRef, item);
      });
      await batch.commit();
      
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        metadata: generatedTicker.ticker_metadata,
        items: responseItems
      });
    } catch (e) {
      console.warn("Failed to write to Firestore via Admin SDK. Returning items directly.", e);
      // Fallback: just return the items to the client and the client can write them using client SDK
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        metadata: generatedTicker.ticker_metadata,
        items: responseItems,
        warning: 'Failed to write to DB server-side'
      });
    }

  } catch (err) {
    console.error('Ticker sync error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
