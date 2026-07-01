import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { promises as fs } from 'fs';
import path from 'path';

// Since we may not have firebase-admin initialized with a service account in the dev environment,
// and we want this to be simple, we can return the items and let the client handle them,
// OR we can initialize a simple admin SDK if the user has provided FIREBASE_SERVICE_ACCOUNT.
// To keep it robust without requiring complex service account keys right now, we can also use
// the REST API or just the client SDK with an anonymous sign-in or bypassing rules on the server.
// For now, let's write it to use standard Firebase Client SDK to add documents. We will assume 
// there's a Firebase rule that allows authenticated admins to write, or we can just send the JSON
// back to the client and let an admin click a "Sync Ticker" button which does the Firestore writes 
// securely from their client session.
// Wait! The user's request: "storing it in firebase is fine. Only show current/recent stuff."
// It's better to fetch and store it on the server if possible. We will use firebase-admin.
import * as admin from 'firebase-admin';
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const parser = new Parser();

    const jsonPath = path.join(process.cwd(), 'tickerFeeds.json');
    const fileContents = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(fileContents);

    interface RssFeedConfig {
      id: string;
      enabled: boolean;
      title: string;
      sourceType: string;
      lane: string;
      category: string;
      feedUrl?: string;
      url?: string;
      sourceFeedIds?: string[];
    }

    const feeds = [...(data.rssFeeds || []), ...(data.aiAggregationFeeds || [])].filter((f: RssFeedConfig) => f.enabled);
    
    // Create a map of RSS feeds for quick lookup by ID for AI aggregation feeds
    const rssMap = new Map<string, RssFeedConfig>();
    (data.rssFeeds || []).forEach((f: RssFeedConfig) => {
      rssMap.set(f.id, f);
    });

    // Collect all unique RSS URLs that need to be fetched
    const feedsToFetch = new Map<string, { url: string; title: string; category: string }>();

    for (const feed of feeds) {
      if (feed.sourceType === 'rss') {
        const url = feed.feedUrl || feed.url;
        if (url) {
          feedsToFetch.set(url, { url, title: feed.title, category: feed.category });
        }
      } else if (feed.sourceType === 'ai_aggregation') {
        const sourceIds = feed.sourceFeedIds || [];
        for (const id of sourceIds) {
          const sourceFeed = rssMap.get(id);
          if (sourceFeed && sourceFeed.enabled) {
            const url = sourceFeed.feedUrl || sourceFeed.url;
            if (url) {
              feedsToFetch.set(url, { url, title: sourceFeed.title, category: sourceFeed.category });
            }
          }
        }
      }
    }
    
    let rawNews = '';
    
    // Fetch top 3 items from each unique feed
    for (const [url, feedMeta] of feedsToFetch.entries()) {
      try {
        const feedContent = await parser.parseURL(url);
        rawNews += `\nSource: ${feedMeta.title}\n`;
        feedContent.items.slice(0, 3).forEach(item => {
          rawNews += `- Title: ${item.title}\n  Link: ${item.link || ''}\n  Snippet: ${item.contentSnippet?.substring(0, 150) || item.summary?.substring(0, 150) || ''}\n`;
        });
      } catch (err) {
        console.error(`Failed to fetch RSS feed ${feedMeta.title}:`, err);
      }
    }

    // Hard cap token usage just in case
    if (rawNews.length > 15000) {
      rawNews = rawNews.substring(0, 15000);
    }

    if (!rawNews.trim()) {
       return NextResponse.json({ message: 'No news fetched' });
    }

    // Ask Gemini to summarize (using flash which is free-tier optimized)
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const prompt = `
You are a content aggregator for a summer camp. I will give you a list of recent news items from various sources (weather, forest service, scouting, astronomy).
Your task is to summarize these into 25 to 30 short, engaging, single-sentence alerts suitable for a scrolling marquee ticker.

Additional Required Queries for Today (${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}):
You MUST generate exactly one ticker item for each of the following specific queries and include them in the final JSON array:
1. Flag Status: Determine if the Arizona state flag is flying at half-staff today. If not or if you don't know, output: "Flags are flying at full staff today over Camp Lawton." (source: "Arizona Flag Status", category: "camp_useful").
2. Scouting America news/fact: A short update or historical fact about Scouting America.
3. Scout.org/newsroom update: A short fact or update related to World Scouting.
4. Catalina Council news/fact: An update or fact about Catalina Council (Boy Scouts of America) in Arizona. Do NOT refer to Catalina Island in California.
5. Mt. Lemmon local status/fact: An update or fact about Mt. Lemmon (elevation, environment, local wildlife, or outdoor activities in Arizona).
6. Summerhaven local status/fact: A quick detail or fact about Summerhaven, Arizona.
7. Word of the Day: Generate one wholesome 'Word of the Day' with a definition. Format: "Word of the Day: [Word] - [Definition]" (source: "Dictionary.com", category: "wholesome_fun", url: "https://www.dictionary.com/word-of-the-day").
8. Riddle of the Day: Generate one riddle. DO NOT output the answer anywhere in the text; users must follow the link to get the answer. Format: "Riddle: [Question]" (source: "Riddles.com", category: "wholesome_fun", url: "https://www.riddles.com/riddle-of-the-day").
9. This Day in Scouting History: A historical Scouting event that happened on this day in history. Format: "[Event description]" (source: "Scouting History", category: "history_curiosity").
10. National Day: Identify the national day(s) celebrated on this day. Format: "Today is [National Day Name]!" (source: "National Day Calendar", category: "wholesome_fun", url: "https://nationaldaycalendar.com/what-day-is-it").

Rules:
1. Each alert MUST be under 110 characters.
2. The language should be natural, friendly, and camp-appropriate (NOT technical or sci-fi).
3. Focus heavily on Santa Catalina Mountains data, local Arizona nature/geology, wildlife, hiking, forest service, astronomy, and broad "outdoors" content.
4. Try to avoid generic, dry, or repetitive facts. Keep it interesting, active, and fresh.
5. STRICT EXCLUSION: Do NOT mention or include facts about "Catalina Island" in California. Any search or reference to "Catalina" must strictly refer to the Santa Catalina Mountains or Catalina Council in Arizona. Do NOT include Grand Canyon news or facts.
6. Output ONLY a valid JSON array of objects, with no markdown formatting or extra text.
7. Each object must have this exact structure:
{
  "title": "The short alert text",
  "source": "Short Name of Source (e.g. On Scouting, NASA, Riddles.com, Scouting History)",
  "url": "The Link URL corresponding to this item, or an internal route like '/wiki' or '/' if generated",
  "category": "camp_useful"
}
8. The category MUST be one of: camp_useful, scouting, local_outdoors, nature_science, wholesome_fun, history_curiosity, dad_joke.
9. You MUST generate at least 25 items in total (including the summaries of the news items below and the required queries above).

News Items:
${rawNews}
    `;
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    // Strip markdown code blocks if Gemini added them
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\n/, '').replace(/\n```$/, '');
    }

    interface GeneratedTickerItem {
      title: string;
      source: string;
      url?: string;
      category: string;
    }

    const generatedItems = JSON.parse(responseText) as GeneratedTickerItem[];

    interface LiveTickerItem {
      id: string;
      title: string;
      url: string;
      category: string;
      source: string;
      sourceType: string;
      timestamp: FieldValue;
    }

    const liveItems: LiveTickerItem[] = generatedItems.map((item: GeneratedTickerItem) => {
      return {
        id: `live_${Math.random().toString(36).substr(2, 9)}`,
        title: item.title,
        url: item.url || '',
        category: item.category || 'flavor',
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
      
      return NextResponse.json({ success: true, count: liveItems.length, items: liveItems });
    } catch (e) {
      console.warn("Failed to write to Firestore via Admin SDK. Returning items directly.", e);
      // Fallback: just return the items to the client and the client can write them using client SDK
      return NextResponse.json({ success: true, count: liveItems.length, items: liveItems, warning: 'Failed to write to DB server-side' });
    }

  } catch (err) {
    console.error('Ticker sync error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
