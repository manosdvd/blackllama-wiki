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

    const feeds = [...(data.rssFeeds || []), ...(data.aiAggregationFeeds || [])].filter(f => f.enabled);
    
    // Create a map of RSS feeds for quick lookup by ID for AI aggregation feeds
    const rssMap = new Map<string, any>();
    (data.rssFeeds || []).forEach((f: any) => {
      rssMap.set(f.id, f);
    });

    // To strictly respect Gemini free tier limits (tokens/requests):
    // 1. We only make ONE Gemini request per sync.
    // 2. We randomly select a max of 4 feeds so the context window remains small.
    const shuffledFeeds = feeds.sort(() => 0.5 - Math.random()).slice(0, 4);
    
    let rawNews = '';
    
    for (const feed of shuffledFeeds) {
      if (feed.sourceType === 'rss') {
        try {
          const urlToFetch = feed.feedUrl || feed.url;
          if (!urlToFetch) continue;
          const feedContent = await parser.parseURL(urlToFetch);
          rawNews += `\nSource: ${feed.title}\n`;
          feedContent.items.slice(0, 2).forEach(item => {
            rawNews += `- Title: ${item.title}\n  Link: ${item.link || ''}\n  Snippet: ${item.contentSnippet?.substring(0, 150) || item.summary?.substring(0, 150) || ''}\n`;
          });
        } catch (err) {
          console.error(`Failed to fetch RSS feed ${feed.title}:`, err);
        }
      } else if (feed.sourceType === 'ai_aggregation') {
        const sourceIds = feed.sourceFeedIds || [];
        const enabledSources = sourceIds
          .map((id: string) => rssMap.get(id))
          .filter((f: any) => f && f.enabled)
          .sort(() => 0.5 - Math.random())
          .slice(0, 2);

        for (const sourceFeed of enabledSources) {
          try {
            const urlToFetch = sourceFeed.feedUrl || sourceFeed.url;
            if (!urlToFetch) continue;
            const feedContent = await parser.parseURL(urlToFetch);
            rawNews += `\nSource (aggregated under ${feed.title}): ${sourceFeed.title}\n`;
            feedContent.items.slice(0, 2).forEach(item => {
              rawNews += `- Title: ${item.title}\n  Link: ${item.link || ''}\n  Snippet: ${item.contentSnippet?.substring(0, 150) || item.summary?.substring(0, 150) || ''}\n`;
            });
          } catch (err) {
            console.error(`Failed to fetch aggregated feed ${sourceFeed.title} for ${feed.title}:`, err);
          }
        }
      }
    }

    // Hard cap token usage just in case
    if (rawNews.length > 8000) {
      rawNews = rawNews.substring(0, 8000);
    }

    if (!rawNews.trim()) {
       return NextResponse.json({ message: 'No news fetched' });
    }

    // Ask Gemini to summarize (using flash which is free-tier optimized)
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    
    const prompt = `
You are a content aggregator for a summer camp. I will give you a list of recent news items from various sources (weather, forest service, scouting, astronomy).
Your task is to summarize these into 5-8 short, engaging, single-sentence alerts suitable for a scrolling marquee ticker.

Rules:
1. Each alert MUST be under 110 characters.
2. The language should be natural, friendly, and camp-appropriate (NOT technical or sci-fi).
3. Output ONLY a valid JSON array of objects, with no markdown formatting or extra text.
4. Each object must have this exact structure:
{
  "title": "The short alert text",
  "source": "Short Name of Source",
  "url": "The exact Link URL corresponding to this news item",
  "category": "camp_useful"
}
5. The category MUST be one of: camp_useful, scouting, local_outdoors, nature_science, wholesome_fun, history_curiosity, dad_joke.

News Items:
${rawNews}
    `;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    // Strip markdown code blocks if Gemini added them
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\n/, '').replace(/\n```$/, '');
    }

    const generatedItems = JSON.parse(responseText);

    const liveItems = generatedItems.map((item: any) => {
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
      liveItems.forEach((item: any) => {
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
