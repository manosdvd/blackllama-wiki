import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

interface NewsTickerItem {
  headline: string;
  source: string;
  link: string;
}

interface LiveTickerItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceType: string;
  position: number;
  generatedAt: string;
  timestamp: FieldValue;
}

const TARGET_LOCATION = 'Camp Lawton, Mt Lemmon, Santa Catalina Mountains';
const PRIMARY_GEMINI_TICKER_MODEL = 'gemini-2.5-flash';
const MAX_TICKER_ITEMS = 36;

const COMPRESSED_FEEDS = [
  'aztrail.org/feed', 'onscouting.org/feed', 'scoutlife.org/feed', 'scoutingwire.org/feed',
  'scoutingnewsroom.org/feed', 'nasa.gov/feeds/iotd-feed', 'nasa.gov/feed', 'atlasobscura.com/feeds/latest',
  'goodnewsnetwork.org/feed', 'tucson.com/search/?f=rss&t=article&c=sports/outdoors', 'lnt.org/feed',
  'fs.usda.gov/news/r3/news-events.xml', 'azgfd.com/feed', 'outsideonline.com/feed', 'audubon.org/rss.xml',
  'allaboutbirds.org/news/feed', 'apod.nasa.gov/apod.rss', 'earthsky.org/feed', 'smithsonianmag.com/rss/science-nature',
  'archives.gov/global-pages/rss/news.xml', 'tucsonbirdalliance.blogspot.com/feeds/posts/default'
].join(',');

const COMPRESSED_QUERIES = [
  'Arizona Trail Association latest closures restrictions events',
  'Arizona Trail Association Santa Catalina Summerhaven Marshall Gulch',
  '"Scouting America" latest', '"Catalina Council" Southern Arizona Scouting current news',
  '"Mt. Lemmon" OR Summerhaven current trail road nature',
  'Santa Catalina Mountains flora fauna sky island fact',
  'Tucson Bird Alliance field trips rare bird alert',
  'Arizona-Sonora Desert Museum events Sonoran Desert nature',
  'Cooper Center Tucson wildlife camera outdoor education',
  'Southern Arizona Rescue Association training safety',
  'University of Arizona SkyCenter astronomy Mt Lemmon',
  'family friendly outdoor bushcraft YouTube camping tips latest',
  'Dictionary.com Word of the Day', 'Riddles.com Riddle of the Day(1 Q&A)',
  'This day in Scouting History', 'NationalDayCalendar'
].join(',');

const MINIFIED_JOKES = '["What do you call a funny mountain? Hill-arious.","Why don\'t eggs tell jokes? They might crack up!","Did you hear about the circus fire? It was in tents!"]';

function getPhoenixDateStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date());
}

function normalizeTickerLink(link: string) {
  const trimmed = (link || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return '';
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

function buildTickerPrompt() {
  const today = getPhoenixDateStamp();

  return `
Loc: ${TARGET_LOCATION}
Today: ${today} America/Phoenix

Mission: Generate a real-time news ticker (24-36 items) focusing on local mountain updates, Scouting America news, and outdoor/camping skills.

Rules:
1. Format: Each item must ONLY provide a Headline, the Source name, and the direct Link URL. No categories.
2. Freshness & Relevance: News must be from the last 24-48 hours and currently relevant. Omit resolved issues or past events.
3. Zero Filler: NO generic placeholders (e.g., "Check the website for updates"). Every headline must contain a specific, verified fact, tip, or update.
4. Strict Accuracy: Do not make up links, events, or statuses. If a source has nothing new, skip it entirely.
5. Broad Variety: Use the provided feeds and queries to check for content, but look in other related places whenever possible.
6. Content Mix: Blend breaking local updates with evergreen outdoor skills, local nature facts, and exactly one joke from the JokePool.

Feeds Baseline: ${COMPRESSED_FEEDS}
Query Baseline: ${COMPRESSED_QUERIES}
JokePool: ${MINIFIED_JOKES}
`.trim();
}

async function generateTicker(apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  
  const tickerSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      ticker_metadata: {
        type: Type.OBJECT,
        properties: {
          generated_at: { type: Type.STRING },
          target_location: { type: Type.STRING }
        },
        required: ['generated_at', 'target_location']
      },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            source: { type: Type.STRING },
            link: { type: Type.STRING }
          },
          required: ['headline', 'source', 'link']
        }
      }
    },
    required: ['ticker_metadata', 'items']
  };

  const prompt = buildTickerPrompt();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: PRIMARY_GEMINI_TICKER_MODEL,
        contents: prompt,
        config: {
          systemInstruction: 'You are a real-time news ticker automation engine. Use Google Search to pull the latest headlines. Output ONLY raw JSON. No conversational text.',
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: tickerSchema,
          temperature: 0.3 // Slightly increased to encourage more varied search behavior
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      if (!parsed.items || parsed.items.length === 0) throw new Error('Empty items array returned');
      
      // Enforce max items slice
      parsed.items = parsed.items.slice(0, MAX_TICKER_ITEMS);
      return parsed;
    } catch (error) {
      lastError = error;
      const msg = String(error);
      if (attempt === 3 || !/(429|500|502|503|504|timeout|rate limit)/i.test(msg)) break;
      await wait(1000 * attempt);
    }
  }
  throw lastError;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const isAuthorized = req.headers.get('x-cron-secret') === cronSecret || url.searchParams.get('secret') === cronSecret;
      
      if (!isAuthorized) {
        const token = req.headers.get('Authorization')?.substring(7);
        let isAdmin = false;
        if (token) {
          try {
            const decodedToken = await getAdminAuth().verifyIdToken(token);
            isAdmin = decodedToken.admin === true;
          } catch (e) { /* silent fail auth */ }
        }
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const db = getAdminDb();
    
    if (!force) {
      const latestSnap = await db.collection('liveTicker').orderBy('timestamp', 'desc').limit(1).get();
      if (!latestSnap.empty) {
        const latestDoc = latestSnap.docs[0].data();
        const ageMs = Date.now() - (latestDoc.timestamp?.toMillis?.() || 0);
        if (ageMs < 55 * 60 * 1000) {
          return NextResponse.json({ success: true, message: 'Recently synced.' });
        }
      }
    }

    const generatedTicker = await generateTicker(apiKey);
    const generatedAt = generatedTicker.ticker_metadata.generated_at || new Date().toISOString();

    const liveItems: LiveTickerItem[] = generatedTicker.items.map((item: NewsTickerItem, index: number) => ({
      id: `live_${getPhoenixDateStamp()}_${String(index + 1).padStart(2, '0')}`,
      title: item.headline,
      url: normalizeTickerLink(item.link),
      source: item.source || 'Live Feed',
      sourceType: 'live',
      position: index,
      generatedAt,
      timestamp: FieldValue.serverTimestamp()
    }));

    try {
      const batch = db.batch();
      
      // Delete old ticker items
      const snapshot = await db.collection('liveTicker').get();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      
      // Write new ticker items
      liveItems.forEach((item) => {
        const docRef = db.collection('liveTicker').doc(item.id);
        batch.set(docRef, item);
      });
      
      await batch.commit();
      
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        metadata: generatedTicker.ticker_metadata,
        items: liveItems.map(({ timestamp, ...rest }) => rest) // strip timestamp for client
      });
    } catch (e) {
      console.warn("Failed to write to Firestore.", e);
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        warning: 'Failed to write to DB',
        items: liveItems.map(({ timestamp, ...rest }) => rest)
      });
    }

  } catch (err) {
    console.error('Ticker sync error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}