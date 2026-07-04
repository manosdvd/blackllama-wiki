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
  syncRunId: string;
  timestamp: FieldValue;
}

const TARGET_LOCATION = 'Camp Lawton, Mt Lemmon, Santa Catalina Mountains';
const PRIMARY_GEMINI_TICKER_MODEL = 'gemini-3.5-flash';
const DEFAULT_SYNC_THROTTLE_MS = 55 * 60 * 1000;
const PUBLIC_FORCE_COOLDOWN_MS = 10 * 60 * 1000;

const COMPRESSED_FEEDS = [
  'aztrail.org/feed', 'onscouting.org/feed', 'scoutlife.org/feed', 'scoutingwire.org/feed',
  'scoutingnewsroom.org/feed', 'nasa.gov/feeds/iotd-feed', 'nasa.gov/feed', 
  'atlasobscura.com/feeds/latest',
  'goodnewsnetwork.org/feed', 'tucson.com/search/?f=rss&t=article&c=sports/outdoors', 'lnt.org/feed',
  'fs.usda.gov/news/r3/news-events.xml', 'azgfd.com/feed', 'outsideonline.com/feed', 
  'audubon.org/rss.xml',
  'allaboutbirds.org/news/feed', 'apod.nasa.gov/apod.rss', 'earthsky.org/feed', 
  'smithsonianmag.com/rss/science-nature',
  'archives.gov/global-pages/rss/news.xml', 'tucsonbirdalliance.blogspot.com/feeds/posts/default',
  'freshoffthegrid.com/feed/', 'www.rei.com/blog/feed', 'wildlandtrekking.com/feed/', 'thetrek.co/feed/',
  'thehikinglife.com/feed/'
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
  'This day in Scouting History', 'NationalDayCalendar', 'Arizona State Parks', '"World Scouting" latest',
  'Southern Arizona camping hiking backpacking', 
  'tips and tricks hiking backpacking "wilderness first aid" climbing bushcraft pioneering'
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
          temperature: 0.3 
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error('Empty items array returned');
      }

      // Intentionally do not cap the returned item count here. The prompt controls the target range.
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

type TickerResponseItem = Omit<LiveTickerItem, 'timestamp'>;

function tickerResponseItem(item: LiveTickerItem): TickerResponseItem {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    source: item.source,
    sourceType: item.sourceType,
    position: item.position,
    generatedAt: item.generatedAt,
    syncRunId: item.syncRunId,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const publicForce = force && ['true', '1'].includes((url.searchParams.get('public') || '').toLowerCase());
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const isCronAuthorized = req.headers.get('x-cron-secret') === cronSecret || url.searchParams.get('secret') === cronSecret;
      
      if (!isCronAuthorized) {
        const token = req.headers.get('Authorization')?.substring(7);
        let isAdmin = false;
        if (token) {
          try {
            const decodedToken = await getAdminAuth().verifyIdToken(token);
            isAdmin = decodedToken.admin === true;
          } catch { /* silent fail auth */ }
        }
        if (!isAdmin && !publicForce) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const db = getAdminDb();
    const shouldUseCooldown = !force || publicForce;
    const cooldownMs = publicForce ? PUBLIC_FORCE_COOLDOWN_MS : DEFAULT_SYNC_THROTTLE_MS;
    
    if (shouldUseCooldown) {
      // No Firestore query limit here on purpose: this exposes the full current set size for debugging.
      const latestSnap = await db.collection('liveTicker').orderBy('timestamp', 'desc').get();
      if (!latestSnap.empty) {
        const latestDoc = latestSnap.docs[0];
        const latestData = latestDoc.data();
        const ageMs = Date.now() - (latestData.timestamp?.toMillis?.() || 0);
        if (ageMs < cooldownMs) {
          return NextResponse.json({
            success: true,
            message: 'Recently synced.',
            latestId: latestData.id || latestDoc.id,
            syncRunId: latestData.syncRunId || null,
            latestGeneratedAt: latestData.generatedAt || null,
            ageMs,
            cooldownMs,
            currentItemCount: latestSnap.size,
            force,
            publicForce,
          });
        }
      }
    }

    const generatedTicker = await generateTicker(apiKey);
    const generatedAt = generatedTicker.ticker_metadata.generated_at || new Date().toISOString();
    const syncRunId = `sync_${getPhoenixDateStamp()}_${Date.now()}`;

    const liveItems: LiveTickerItem[] = generatedTicker.items.map((item: NewsTickerItem, index: number) => ({
      id: `${syncRunId}_${String(index + 1).padStart(2, '0')}`,
      title: item.headline,
      url: normalizeTickerLink(item.link),
      source: item.source || 'Live Feed',
      sourceType: 'live',
      position: index,
      generatedAt,
      syncRunId,
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
        syncRunId,
        firstItemId: liveItems[0]?.id || null,
        metadata: generatedTicker.ticker_metadata,
        items: liveItems.map(tickerResponseItem)
      });
    } catch (e) {
      console.warn('Failed to write to Firestore.', e);
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        syncRunId,
        firstItemId: liveItems[0]?.id || null,
        warning: 'Failed to write to DB',
        items: liveItems.map(tickerResponseItem)
      });
    }

  } catch (err) {
    console.error('Ticker sync error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
