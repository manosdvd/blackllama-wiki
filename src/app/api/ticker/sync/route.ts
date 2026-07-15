import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { writeServerErrorLog } from '@/lib/server/errorLog';

export const runtime = 'nodejs';

interface NewsTickerItem {
  headline: string;
  source: string;
  link: string;
  publishedAt?: string;
  imageUrl?: string;
}

interface RssCandidateItem extends NewsTickerItem {
  publishedAt: string;
  publishedTime: number;
  category?: string;
}

interface LiveTickerItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceType: string;
  position: number;
  generatedAt: string;
  publishedAt?: string;
  imageUrl?: string;
  category?: string;
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
  contentEncoded?: string;
  enclosure?: {
    url?: string;
    type?: string;
  };
  mediaContent?: unknown;
  mediaThumbnail?: unknown;
  mediaGroup?: unknown;
  image?: unknown;
  [key: string]: unknown;
};

const TARGET_LOCATION = 'Camp Lawton, Mt Lemmon, Santa Catalina Mountains';
const RSS_FEED_TIMEOUT_MS = 6_000;
const RSS_ITEMS_PER_FEED = 5;
const RSS_MAX_ITEMS = 36;
const RSS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RSS_CLOCK_SKEW_MS = 5 * 60 * 1000;

const FEED_URLS = [
  'aztrail.org/feed', 'onscouting.org/feed', 'scoutlife.org/feed', 'scoutingwire.org/feed',
  'scoutingnewsroom.org/feed', 'nasa.gov/feed',
  'atlasobscura.com/feeds/latest',
  'goodnewsnetwork.org/feed', 'tucson.com/search/?f=rss&t=article&c=sports/outdoors', 'lnt.org/feed',
  'fs.usda.gov/news/r3/news-events.xml', 'azgfd.com/feed', 'outsideonline.com/feed',
  'audubon.org/rss.xml',
  'allaboutbirds.org/news/feed', 'apod.nasa.gov/apod.rss', 'earthsky.org/feed',
  'smithsonianmag.com/rss/science-nature',
  'archives.gov/global-pages/rss/news.xml', 'tucsonbirdalliance.blogspot.com/feeds/posts/default',
  'freshoffthegrid.com/feed/', 'www.rei.com/blog/feed', 'wildlandtrekking.com/feed/',
  'thehikinglife.com/feed/', 'https://nationaldaycalendar.com/rss',
  'https://rss.app/feeds/nDqCGtfjaZ6wn10I.xml', 'https://paulkirtley.co.uk/feed/',
  'https://blog.nols.edu/rss.xml',
  'https://theazhikeaholics.com/feed/', 'https://www.archaeologysouthwest.org/feed/',
  'https://tucsonastronomy.org/feed/', 'https://rss.app/feeds/AztZJf5NpmcSMJg4.xml',
  'https://woodbeecarver.com/feed/',
  'https://www.redcross.ca/blog/rss', 'https://survivalsherpa.wordpress.com/feed/',
  'https://skyislandalliance.org/feed/', 'https://www.southwestdiscoveries.com/feed/',
  'https://rss.app/feeds/7OILicWFV8pBtyvV.xml', 'https://mountlemmonlodge.com/feed/',
  'https://rss.app/feeds/nnhnHtHV5szfQ3my.xml',
  'https://rss.app/feeds/iD5DWYJEvW2o6Ojz.xml', 'https://rss.app/feeds/5DoloBF2LLaDqyjO.xml',
  'https://rss.app/feeds/89yasnMYbdnFJLbM.xml', 'https://rss.app/feeds/BkR3o4Rmc1cfBkvp.xml',
  'https://rss.app/feeds/MtXqTr6RztcQ5yJM.xml', 'https://rss.app/feeds/SmsCTDwybGojxVzH.xml',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC7r-LubEzJEec5b9qYJVcpA',
  'https://www.blm.gov/press-release/arizona/rss', 'https://www.azgfd.com/azgfd-news/feed/',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC415bOPUcGSamy543abLmRA',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCWXWkY9L14tgx9JFTzn_uaA',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UClFrYG5h7Vbz-Y2CEIEU6EQ',

  // Southern Arizona, desert ecology, public lands, and current safety information.
  'https://www.sonorandesert.org/feed/',
  'https://tohonochul.org/feed/',
  'https://www.westernnationalparksassociation.org/feed/',
  'https://www.grandcanyontrust.org/feed',
  'https://blog.nature.org/feed/',
  'https://www.sciencedaily.com/rss/plants_animals.xml',
  'https://www.sciencedaily.com/rss/earth_climate/environment.xml',

  // Scouting, high-adventure bases, outdoor skills, navigation, climbing, and pioneering.
  'https://catalinacouncil.org/feed/',
  'https://oa-bsa.org/news/feed',
  'https://www.philmontscoutranch.org/feed/',
  'https://www.summitbsa.org/feed/',
  'https://www.ntier.org/feed/',
  'https://www.bsaseabase.org/feed/',
  'https://scoutpioneering.com/feed/',
  'https://orienteeringusa.org/feed/',
  'https://www.americanalpineclub.org/news?format=rss',
  'https://www.backpacker.com/feed/',
  'https://www.climbing.com/feed/',

  // Family-friendly podcast and YouTube feeds.
  'http://birdnote.org/get-podcasts-rss',

  // Existing YouTube: SmarterEveryDay, Primitive Technology, and Practical Engineering.
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC6107grRI4m0o2-emgoDnAA',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCAL3JXZSzSm8AlZyD3nQdBA',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCMOqf8ab-42UUQIdVoKwjlQ',

  // Arizona wildlife, outdoor science, natural history, and Scout-friendly STEM.
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCASn7tMQBJvzAnOQ3yHoBWw',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCZYTClx2T1of7BRZ86-8fow',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCRFIPG2u1DxKLNuE3y2SjHA',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC-3SbfTPJsL8fJAPKiVqBLg',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCeiYXex_fwgYDonaTcSIk6w',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC6E2mP01ZLH_kbAyeazCNdg',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCXVCgDuD_QCkI7gTKU7-tpg',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCY1kMZp36IQSyNx_9h4mpCg',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCH4BNI0-FOK2dMXoFtViWHw',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCHsRtomD4twRf5WVHHk-cMw',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCZXZQxS3d6NpR-eH_gdDwYA',
];

const SCOUT_UNSUITABLE_PATTERNS = [
  /\b(?:fuck|fucking|fucked|fucker|motherfucker|shit|bullshit|bitch|bastard|asshole|cunt)\b/i,
  /\b(?:porn|pornography|onlyfans|nude|nudity|sex\s+toy|sexual\s+content)\b/i,
  /\b(?:marijuana|cannabis|thc|vape|vaping)\b/i,
  /\b(?:beer|brewery|wine|winery|whiskey|whisky|vodka|tequila|cocktail)\b/i,
];

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

function isScoutAppropriate(item: ParsedRssItem) {
  const text = cleanText([
    item.title,
    item.contentSnippet,
    item.summary,
    item.content,
    item.contentEncoded,
  ].filter((value): value is string => typeof value === 'string').join(' '));

  return !SCOUT_UNSUITABLE_PATTERNS.some((pattern) => pattern.test(text));
}

function parsePublishedTime(item: ParsedRssItem) {
  const rawDate = item.isoDate || item.pubDate;
  if (!rawDate) return undefined;
  const time = Date.parse(rawDate);
  return Number.isFinite(time) ? time : undefined;
}

function isWithinLast24Hours(publishedTime: number, now = Date.now()) {
  return publishedTime <= now + RSS_CLOCK_SKEW_MS && now - publishedTime <= RSS_MAX_AGE_MS;
}

function safeImageUrl(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const decoded = value.replace(/&amp;/g, '&').trim();
  if (!decoded) return undefined;
  try {
    const parsed = new URL(decoded);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function findMediaUrl(value: unknown, depth = 0): string | undefined {
  if (depth > 4 || value === null || value === undefined) return undefined;

  const direct = safeImageUrl(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findMediaUrl(entry, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;

  for (const key of ['url', 'href', 'src']) {
    const found = safeImageUrl(record[key]);
    if (found) return found;
  }

  const attributes = record.$;
  if (attributes && typeof attributes === 'object') {
    const attributeRecord = attributes as Record<string, unknown>;
    for (const key of ['url', 'href', 'src']) {
      const found = safeImageUrl(attributeRecord[key]);
      if (found) return found;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findMediaUrl(nested, depth + 1);
    if (found) return found;
  }

  return undefined;
}

function imageFromHtml(html?: string) {
  if (!html) return undefined;
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return safeImageUrl(match?.[1]);
}

function youtubeThumbnail(link: string) {
  try {
    const url = new URL(link);
    let videoId: string | null = null;
    if (url.hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || null;
    if (url.hostname.endsWith('youtube.com')) videoId = url.searchParams.get('v');
    if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return undefined;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  } catch {
    return undefined;
  }
}

function extractImageUrl(item: ParsedRssItem, link: string) {
  const ytThumb = youtubeThumbnail(link);
  if (ytThumb) return ytThumb;

  const enclosureType = item.enclosure?.type?.toLowerCase() || '';
  const enclosureUrl = safeImageUrl(item.enclosure?.url);
  if (enclosureUrl && (enclosureType.startsWith('image/') || !enclosureType)) return enclosureUrl;

  for (const media of [item.mediaContent, item.mediaThumbnail, item.mediaGroup, item.image]) {
    const found = findMediaUrl(media);
    if (found) return found;
  }

  for (const html of [item.contentEncoded, item.content, item.summary]) {
    const found = imageFromHtml(html);
    if (found) return found;
  }

  return undefined;
}

function rssTimeoutAfter(ms: number, feedUrl: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`RSS feed timed out after ${ms}ms: ${feedUrl}`)), ms);
  });
}

function dedupeTickerItems<T extends NewsTickerItem>(items: T[]) {
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
  const parser = new Parser<Record<string, unknown>, ParsedRssItem>({
    customFields: {
      item: [
        ['content:encoded', 'contentEncoded'],
        ['media:content', 'mediaContent', { keepArray: true }],
        ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
        ['media:group', 'mediaGroup'],
      ],
    },
  });
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
        const publishedTime = parsePublishedTime(item);

        if (!title || !link || !publishedTime || !isWithinLast24Hours(publishedTime, now)) return null;
        if (!isScoutAppropriate(item)) return null;

        const imageUrl = extractImageUrl(item, link);
        const isYoutube = normalizedFeedUrl.includes('youtube.com');
        return {
          headline: title,
          source,
          link,
          publishedAt: new Date(publishedTime).toISOString(),
          publishedTime,
          category: isYoutube ? 'YouTube' : undefined,
          ...(imageUrl ? { imageUrl } : {}),
        };
      }).filter(Boolean) as RssCandidateItem[];
    }),
  );

  const candidates = feedResults
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .sort((a, b) => b.publishedTime - a.publishedTime);
  const failedFeeds = feedResults.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const feedUrl = normalizeFeedUrl(FEED_URLS[index]);
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return [{ feedUrl, reason: trimHeadline(reason) }];
  });

  return {
    ticker_metadata: {
      generated_at: new Date().toISOString(),
      target_location: TARGET_LOCATION,
      max_age_hours: 24,
    },
    items: dedupeTickerItems(candidates).slice(0, RSS_MAX_ITEMS),
    feedCount: FEED_URLS.length,
    failedFeedCount: failedFeeds.length,
    failedFeeds,
  };
}


export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    if (url.searchParams.get('health') === 'true') {
      return NextResponse.json({
        success: true,
        route: 'ticker-sync',
        rssFeeds: FEED_URLS.length,
        maxAgeHours: 24,
      });
    }

    const generatedAt = new Date().toISOString();
    const syncRunId = `sync_${getPhoenixDateStamp()}_${Date.now()}`;

    // Queue the heavy RSS fetching and DB writes in the background
    after(async () => {
      try {
        const [{ getAdminDbOnly }, { FieldValue }] = await Promise.all([
          import('@/lib/firebase/adminDb'),
          import('firebase-admin/firestore'),
        ]);

        const db = getAdminDbOnly();
        const rssTicker = await generateRssTicker();

        if (rssTicker.items.length === 0) {
          await writeServerErrorLog({
            context: 'ticker.sync.rss_empty',
            message: 'No recent RSS ticker items could be generated.',
            severity: 'warning',
            request: req,
            metadata: {
              feedCount: rssTicker.feedCount,
              failedFeedCount: rssTicker.failedFeedCount,
              failedFeeds: rssTicker.failedFeeds,
              maxAgeHours: 24,
            },
          });
          return;
        }

        const liveItems: LiveTickerItem[] = rssTicker.items.map((item, index) => ({
          id: `${syncRunId}_${String(index + 1).padStart(2, '0')}`,
          title: item.headline,
          url: normalizeTickerLink(item.link),
          source: item.source || 'RSS Feed',
          sourceType: item.category === 'YouTube' ? 'youtube' : 'rss',
          position: index,
          generatedAt,
          publishedAt: item.publishedAt,
          ...(item.category ? { category: item.category } : {}),
          ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          syncRunId,
          timestamp: FieldValue.serverTimestamp(),
        }));

        const batch = db.batch();
        const snapshot = await db.collection('liveTicker').get();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));

        liveItems.forEach((item) => {
          const docRef = db.collection('liveTicker').doc(item.id);
          batch.set(docRef, item);
        });

        await batch.commit();
        console.log(`[Sync Ticker] Successfully synced ${liveItems.length} items in background. Run ID: ${syncRunId}`);
      } catch (error) {
        await writeServerErrorLog({
          context: 'ticker.sync.background_fatal',
          message: 'Failed to complete background ticker sync.',
          error,
          severity: 'error',
          request: req,
        });
      }
    });

    // Return an immediate 202 response so the UI / Cron doesn't block
    return NextResponse.json({
      success: true,
      message: 'RSS Ticker sync started in the background.',
      mode: 'rss-local-only',
      syncRunId,
    }, { status: 202 });

  } catch (error) {
    await writeServerErrorLog({
      context: 'ticker.sync.fatal',
      message: 'Fatal error in ticker sync route.',
      error,
      severity: 'critical',
      request: req,
    });

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
