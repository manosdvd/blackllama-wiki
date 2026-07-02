import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  try {
    // If we have a service account JSON string in env, use it.
    // Otherwise fallback to default application credentials.
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountStr) {
      const serviceAccount = JSON.parse(serviceAccountStr);
      initializeApp({
        credential: cert(serviceAccount)
      });
    } else {
       // Just init without cert, relies on GOOGLE_APPLICATION_CREDENTIALS or it might fail in local dev
       initializeApp();
    }
  } catch (e) {
    console.warn("Firebase Admin Initialization Warning:", e);
  }
}

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
  timestamp: FieldValue;
}

const TARGET_LOCATION = 'Camp Lawton, Mt Lemmon, Santa Catalina Mountains';
const REFRESH_RATE_SECONDS = 3600;

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

const newsTickerJsonSchema = {
  type: 'object',
  properties: {
    ticker_metadata: {
      type: 'object',
      properties: {
        generated_at: {
          type: 'string',
          description: 'ISO timestamp of generation'
        },
        target_location: {
          type: 'string',
          description: 'Geographic filter scope applied'
        },
        refresh_rate_seconds: {
          type: 'integer'
        }
      },
      required: ['generated_at', 'target_location', 'refresh_rate_seconds']
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Uppercase indicator, e.g., LOCAL INTEL, SCOUTING, HUMOR, DISPATCH'
          },
          headline: {
            type: 'string',
            description: 'Compressed, high-impact headline or dispatch text'
          },
          source: {
            type: 'string',
            description: 'The primary source or publication name'
          },
          link: {
            type: 'string',
            description: "Direct URL link to the piece, or 'N/A' if offline"
          }
        },
        required: ['category', 'headline', 'source', 'link']
      }
    }
  },
  required: ['ticker_metadata', 'items']
};

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

function normalizeTickerLink(link: string) {
  const trimmed = (link || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return '';
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}

function buildTickerPrompt() {
  return `
Loc:${TARGET_LOCATION}
Time Anchor:${getPhoenixDateStamp()}
Window:Last 24-48h. If undated, verify ongoing relevance.
Feeds:${COMPRESSED_FEEDS}
Queries:${COMPRESSED_QUERIES}
JokePool:${MINIFIED_JOKES}
`.trim();
}

async function generateTicker(apiKey: string): Promise<NewsTicker> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = [
    'You are a real-time news ticker automation engine.',
    'Use the Google Search tool to pull the latest headlines fitting the provided feeds, themes, and queries.',
    'Select exactly 1 joke from the JokePool.',
    'Output ONLY the raw JSON conforming precisely to the requested response schema.',
    'Do not include markdown code fences or conversational text.'
  ].join(' ');

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction,
    tools: [{ googleSearch: {} }] as never,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: newsTickerJsonSchema
    } as never
  });

  const result = await model.generateContent(buildTickerPrompt());
  const responseText = result.response.text().trim();
  const parsed = JSON.parse(stripJsonMarkdown(responseText)) as NewsTicker;

  if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error('Gemini returned ticker JSON without any items.');
  }

  return parsed;
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
            const decodedToken = await getAuth().verifyIdToken(token);
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

    const db = getFirestore();
    
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

    const liveItems: LiveTickerItem[] = generatedTicker.items.map((item: NewsTickerItem) => {
      return {
        id: `live_${Math.random().toString(36).substr(2, 9)}`,
        title: item.headline,
        url: normalizeTickerLink(item.link),
        category: item.category || 'DISPATCH',
        source: item.source || 'Live Feed',
        sourceType: 'live',
        timestamp: FieldValue.serverTimestamp()
      };
    });

    // If Admin SDK is initialized and working, write to Firestore
    try {
      // We are requested to "Only show current/recent stuff"
      // Delete old items in liveTicker
      const batch = db.batch();
      const snapshot = await db.collection('liveTicker').get();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Insert new items
      const newBatch = db.batch();
      liveItems.forEach((item: LiveTickerItem) => {
        const docRef = db.collection('liveTicker').doc(item.id);
        newBatch.set(docRef, item);
      });
      await newBatch.commit();
      
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        metadata: generatedTicker.ticker_metadata,
        items: liveItems
      });
    } catch (e) {
      console.warn("Failed to write to Firestore via Admin SDK. Returning items directly.", e);
      // Fallback: just return the items to the client and the client can write them using client SDK
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        metadata: generatedTicker.ticker_metadata,
        items: liveItems,
        warning: 'Failed to write to DB server-side'
      });
    }

  } catch (err) {
    console.error('Ticker sync error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
