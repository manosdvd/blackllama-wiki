import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface NewsTickerItem {
  headline: string;
  source: string;
  link: string;
}

interface NewsTicker {
  ticker_metadata?: {
    generated_at?: string;
    target_location?: string;
  };
  items?: NewsTickerItem[];
}

interface RssCandidateItem extends NewsTickerItem {
  publishedAt?: string;
  publishedTime?: number;
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
  timestamp: unknown;
}

type ParsedRssItem = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  summary?: string;
  content?: string;
};

const TARGET_LOCATION = 'Camp Lawton, Mt Lemmon, Santa Catalina Mountains';
const PRIMARY_GEMINI_TICKER_MODEL = process.env.GEMINI_TICKER_MODEL || 'gemini-3.1-flash-lite';
const DEFAULT_SYNC_THROTTLE_MS = 55 * 60 * 1000;
const PUBLIC_FORCE_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const GEMINI_TIMEOUT_MS = 8_000;
const RSS_FEED_TIMEOUT_MS = 6_000;
const RSS_ITEMS_PER_FEED = 3;
const RSS_MAX_ITEMS = 32;
const TICKER_MAX_ITEMS = 36;
const RSS_PREFERRED_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const FEED_URLS = [
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
];

const COMPRESSED_FEEDS = FEED_URLS.join(',');

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

function normalizeFeedUrl(feedUrl: string) {
  return feedUrl.startsWith('http') ? feedUrl : `https://${feedUrl}`;
}

function sourceFromUrl(url: string) {
  try {
    return new URL(normalizeFeedUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || 'RSS Feed';
  }
}

function cleanText(text: string) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function trimHeadline(headline: string) {
  const cleaned = cleanText(headline);
  if (cleaned.length <= 150) return cleaned;
  return `${cleaned.slice(0, 147).trim()}...`;
}

function parsePublishedTime(item: ParsedRssItem) {
  const rawDate = item.isoDate || item.pubDate;
  if (!rawDate) return undefined;
  const time = Date.parse(rawDate);
  return Number.isFinite(time) ? time : undefined;
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Gemini ticker generation timed out after ${ms}ms`)), ms);
  });
}

function rssTimeoutAfter(ms: number, feedUrl: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`RSS feed timed out after ${ms}ms: ${feedUrl}`)), ms);
  });
}

function isGeminiQuotaError(error: unknown) {
  return /quota|RESOURCE_EXHAUSTED|429|rate-limit|rate limit/i.test(String(error));
}

function extractRetryAfterSeconds(error: unknown) {
  const message = String(error);
  const retryDelayMatch = message.match(/retryDelay"\s*:\s*"(\d+)s"/i);
  if (retryDelayMatch?.[1]) return Number(retryDelayMatch[1]);

  const retryInMatch = message.match(/retry in\s+([\d.]+)s/i);
  if (retryInMatch?.[1]) return Math.ceil(Number(retryInMatch[1]));

  return null;
}

function extractTickerJson(rawText: string) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as NewsTicker;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as NewsTicker;
    }
    throw new Error(`Gemini did not return parseable JSON. Raw response starts: ${cleaned.slice(0, 240)}`);
  }
}

function dedupeTickerItems(items: NewsTickerItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.link || item.headline}`.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateRssTicker() {
  const Parser = (await import('rss-parser')).default;
  const parser = new Parser<Record<string, unknown>, ParsedRssItem>();
  const now = Date.now();

  const feedResults = await Promise.allSettled(
    FEED_URLS.map(async (feedUrl) => {
      const normalizedFeedUrl = normalizeFeedUrl(feedUrl);
      const feed = await Promise.race([
        parser.parseURL(normalizedFeedUrl),
        rssTimeoutAfter(RSS_FEED_TIMEOUT_MS, normalizedFeedUrl),
      ]);

      const source = cleanText(feed.title || sourceFromUrl(feedUrl));

      return (feed.items || []).slice(0, RSS_ITEMS_PER_FEED).map((item: ParsedRssItem): RssCandidateItem | null => {
        const title = trimHeadline(item.title || '');
        const link = normalizeTickerLink(item.link || item.guid || normalizedFeedUrl);
        if (!title || !link) return null;

        const publishedTime = parsePublishedTime(item);
        return {
          headline: title,
          source,
          link,
          publishedAt: publishedTime ? new Date(publishedTime).toISOString() : undefined,
          publishedTime,
        };
      }).filter(Boolean) as RssCandidateItem[];
    })
  );

  const candidates = feedResults
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .sort((a, b) => (b.publishedTime || 0) - (a.publishedTime || 0));

  const recentCandidates = candidates.filter((item) => !item.publishedTime || now - item.publishedTime <= RSS_PREFERRED_MAX_AGE_MS);
  const selected = (recentCandidates.length >= 10 ? recentCandidates : candidates).slice(0, RSS_MAX_ITEMS);

  return {
    ticker_metadata: {
      generated_at: new Date().toISOString(),
      target_location: TARGET_LOCATION,
    },
    items: dedupeTickerItems(selected),
    feedCount: FEED_URLS.length,
    failedFeedCount: feedResults.filter((result) => result.status === 'rejected').length,
  };
}

function buildTickerPrompt(rssItems: NewsTickerItem[]) {
  const today = getPhoenixDateStamp();
  const rssBaseline = rssItems
    .slice(0, 18)
    .map((item) => `- ${item.headline} | ${item.source} | ${item.link}`)
    .join('\n');

  return `
Loc: ${TARGET_LOCATION}
Today: ${today} America/Phoenix

Mission: Generate a small AI supplement for a camp news ticker. RSS already provides the baseline. Add only items that improve variety, local relevance, or usefulness.

Rules:
1. Return ONLY a raw JSON object. Do not wrap it in markdown. Do not add explanation.
2. JSON shape must be: {"ticker_metadata":{"generated_at":"ISO string","target_location":"string"},"items":[{"headline":"string","source":"string","link":"https://..."}]}
3. Return 4-8 items total. Each item must ONLY provide headline, source, and direct link URL.
4. Freshness & Relevance: Prefer current or recently verified content. Omit resolved issues or past events.
5. Zero Filler: NO generic placeholders. Every headline must contain a specific, verified fact, tip, or update.
6. Strict Accuracy: Do not make up links, events, or statuses. If unsure, skip it.
7. Content Mix: Add useful local mountain updates, Scouting America/world Scouting items, outdoor skills, local nature facts, and exactly one joke from JokePool only if it fits.
8. Avoid duplicating RSS baseline items.

RSS Baseline Already Available:
${rssBaseline || '(RSS baseline unavailable)'}

Feeds Baseline: ${COMPRESSED_FEEDS}
Query Baseline: ${COMPRESSED_QUERIES}
JokePool: ${MINIFIED_JOKES}
`.trim();
}

async function generateAiTicker(apiKey: string, rssItems: NewsTickerItem[]) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildTickerPrompt(rssItems);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: PRIMARY_GEMINI_TICKER_MODEL,
          contents: prompt,
          config: {
            systemInstruction: 'You are an optional AI supplement for an RSS-first ticker. Return only raw JSON text. No markdown and no conversational text.',
            tools: [{ googleSearch: {} }],
            temperature: 0.3,
          }
        }),
        timeoutAfter(GEMINI_TIMEOUT_MS),
      ]);

      const parsed = extractTickerJson(response.text || '{}');
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error('Empty items array returned');
      }

      parsed.items = parsed.items
        .filter((item) => item.headline && item.link)
        .slice(0, 8)
        .map((item) => ({
          headline: trimHeadline(item.headline),
          source: cleanText(item.source || 'AI Supplement'),
          link: normalizeTickerLink(item.link),
        }));

      return parsed;
    } catch (error) {
      lastError = error;
      const msg = String(error);
      if (isGeminiQuotaError(error)) break;
      if (attempt === 2 || !/(500|502|503|504|timeout|timed out)/i.test(msg)) break;
      await wait(1000 * attempt);
    }
  }
  throw lastError;
}

function mergeTickerItems(rssItems: NewsTickerItem[], aiItems: NewsTickerItem[]) {
  return dedupeTickerItems([
    ...rssItems,
    ...aiItems,
  ]).slice(0, TICKER_MAX_ITEMS);
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

    if (url.searchParams.get('health') === 'true') {
      return NextResponse.json({
        success: true,
        route: 'ticker-sync',
        hasGeminiKey: Boolean(apiKey),
        model: PRIMARY_GEMINI_TICKER_MODEL,
        rssFeeds: FEED_URLS.length,
      });
    }

    const [{ getAdminDbOnly }, { FieldValue }] = await Promise.all([
      import('@/lib/firebase/adminDb'),
      import('firebase-admin/firestore'),
    ]);

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const isCronAuthorized = req.headers.get('x-cron-secret') === cronSecret || url.searchParams.get('secret') === cronSecret;
      if (!isCronAuthorized && !publicForce) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const db = getAdminDbOnly();
    const shouldUseCooldown = !force || publicForce;
    const cooldownMs = publicForce ? PUBLIC_FORCE_COOLDOWN_MS : DEFAULT_SYNC_THROTTLE_MS;
    
    if (shouldUseCooldown) {
      const latestSnap = await db.collection('liveTicker').orderBy('timestamp', 'desc').limit(1).get();
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
            currentItemCount: latestData.syncRunId
              ? (await db.collection('liveTicker').where('syncRunId', '==', latestData.syncRunId).count().get()).data().count
              : undefined,
            ageMs,
            cooldownMs,
            force,
            publicForce,
          });
        }
      }
    }

    const rssTicker = await generateRssTicker();
    let aiStatus = apiKey ? 'skipped' : 'skipped:no-gemini-key';
    let aiError: string | null = null;
    let aiItems: NewsTickerItem[] = [];

    if (apiKey) {
      try {
        const aiTicker = await generateAiTicker(apiKey, rssTicker.items);
        aiItems = Array.isArray(aiTicker.items) ? aiTicker.items : [];
        aiStatus = `ok:${aiItems.length}`;
      } catch (error) {
        aiStatus = isGeminiQuotaError(error) ? 'failed:quota' : 'failed';
        aiError = String(error).slice(0, 500);
        console.warn('AI ticker supplement failed; continuing with RSS baseline.', error);
      }
    }

    const combinedItems = mergeTickerItems(rssTicker.items, aiItems);

    if (combinedItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No RSS or AI ticker items could be generated. Keeping existing cached ticker items in Firestore.',
        rssFeedCount: rssTicker.feedCount,
        rssFailedFeedCount: rssTicker.failedFeedCount,
        aiStatus,
        aiError,
      }, { status: 503 });
    }

    const generatedAt = new Date().toISOString();
    const syncRunId = `sync_${getPhoenixDateStamp()}_${Date.now()}`;

    const liveItems: LiveTickerItem[] = combinedItems.map((item: NewsTickerItem, index: number) => ({
      id: `${syncRunId}_${String(index + 1).padStart(2, '0')}`,
      title: item.headline,
      url: normalizeTickerLink(item.link),
      source: item.source || 'Live Feed',
      sourceType: aiItems.some((aiItem) => aiItem.link === item.link || aiItem.headline === item.headline) ? 'ai' : 'rss',
      position: index,
      generatedAt,
      syncRunId,
      timestamp: FieldValue.serverTimestamp()
    }));

    try {
      const batch = db.batch();
      
      const snapshot = await db.collection('liveTicker').get();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      
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
        rssCount: rssTicker.items.length,
        rssFailedFeedCount: rssTicker.failedFeedCount,
        aiStatus,
        aiError,
        metadata: {
          generated_at: generatedAt,
          target_location: TARGET_LOCATION,
          rss_feed_count: rssTicker.feedCount,
          rss_failed_feed_count: rssTicker.failedFeedCount,
          ai_status: aiStatus,
        },
        items: liveItems.map(tickerResponseItem)
      });
    } catch (e) {
      console.warn('Failed to write to Firestore.', e);
      return NextResponse.json({
        success: true,
        count: liveItems.length,
        syncRunId,
        firstItemId: liveItems[0]?.id || null,
        rssCount: rssTicker.items.length,
        rssFailedFeedCount: rssTicker.failedFeedCount,
        aiStatus,
        aiError,
        warning: 'Failed to write to DB',
        items: liveItems.map(tickerResponseItem)
      });
    }

  } catch (err) {
    console.error('Ticker sync error:', err);

    if (isGeminiQuotaError(err)) {
      return NextResponse.json({
        success: false,
        error: 'Gemini quota exceeded before RSS fallback could complete. The ticker will keep showing the most recent cached feed until quota resets.',
        retryAfterSeconds: extractRetryAfterSeconds(err),
        model: PRIMARY_GEMINI_TICKER_MODEL,
      }, { status: 429 });
    }

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
