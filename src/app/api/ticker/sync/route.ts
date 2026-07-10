import { NextResponse } from 'next/server';
import { writeServerErrorLog } from '@/lib/server/errorLog';

export const runtime = 'nodejs';

interface NewsTickerItem {
  headline: string;
  source: string;
  link: string;
}

interface RssCandidateItem extends NewsTickerItem {
  publishedAt: string;
  publishedTime: number;
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
const RSS_FEED_TIMEOUT_MS = 6_000;
const RSS_ITEMS_PER_FEED = 5;
const RSS_MAX_ITEMS = 36;
const RSS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RSS_CLOCK_SKEW_MS = 5 * 60 * 1000;

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
  'https://api.weather.gov/alerts/active.atom?area=AZ',
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
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCASn7tMQBJvzAnOQ3yHoBWw', // Arizona Game and Fish
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCZYTClx2T1of7BRZ86-8fow', // SciShow
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCRFIPG2u1DxKLNuE3y2SjHA', // SciShow Kids
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC-3SbfTPJsL8fJAPKiVqBLg', // Deep Look
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCeiYXex_fwgYDonaTcSIk6w', // MinuteEarth
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC6E2mP01ZLH_kbAyeazCNdg', // Brave Wilderness
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCXVCgDuD_QCkI7gTKU7-tpg', // Nat Geo Kids
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCY1kMZp36IQSyNx_9h4mpCg', // Mark Rober
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA', // Veritasium
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCH4BNI0-FOK2dMXoFtViWHw', // Be Smart
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCHsRtomD4twRf5WVHHk-cMw', // TierZoo
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCZXZQxS3d6NpR-eH_gdDwYA', // Cornell Lab Bird Cams
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
  ].filter(Boolean).join(' '));

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

function rssTimeoutAfter(ms: number, feedUrl: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`RSS feed timed out after ${ms}ms: ${feedUrl}`)), ms);
  });
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
        const publishedTime = parsePublishedTime(item);

        if (!title || !link || !publishedTime || !isWithinLast24Hours(publishedTime, now)) return null;
        if (!isScoutAppropriate(item)) return null;

        return {
          headline: title,
          source,
          link,
          publishedAt: new Date(publishedTime).toISOString(),
          publishedTime,
        };
      }).filter(Boolean) as RssCandidateItem[];
    })
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

    if (url.searchParams.get('health') === 'true') {
      return NextResponse.json({
        success: true,
        route: 'ticker-sync',
        rssFeeds: FEED_URLS.length,
        maxAgeHours: 24,
      });
    }

    // The user requested removing the auth requirement for the sync endpoint.
    // Cron requests passing ?force=true will automatically proceed.
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

      return NextResponse.json({
        success: false,
        error: 'No RSS ticker items from the last 24 hours could be generated. Keeping existing cached ticker items in Firestore.',
        mode: 'rss-local-only',
        rssFeedCount: rssTicker.feedCount,
        rssFailedFeedCount: rssTicker.failedFeedCount,
        rssFailedFeeds: rssTicker.failedFeeds,
        maxAgeHours: 24,
      }, { status: 503 });
    }

    const combinedItems = rssTicker.items;
    const generatedAt = new Date().toISOString();
    const syncRunId = `sync_${getPhoenixDateStamp()}_${Date.now()}`;

    const liveItems: LiveTickerItem[] = combinedItems.map((item: NewsTickerItem, index: number) => ({
      id: `${syncRunId}_${String(index + 1).padStart(2, '0')}`,
      title: item.headline,
      url: normalizeTickerLink(item.link),
      source: item.source || 'RSS Feed',
      sourceType: 'rss',
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
        mode: 'rss-local-only',
        count: liveItems.length,
        syncRunId,
        firstItemId: liveItems[0]?.id || null,
        rssCount: rssTicker.items.length,
        rssFailedFeedCount: rssTicker.failedFeedCount,
        aiStatus: 'disabled',
        aiError: null,
        maxAgeHours: 24,
        metadata: {
          generated_at: generatedAt,
          target_location: TARGET_LOCATION,
          rss_feed_count: rssTicker.feedCount,
          rss_failed_feed_count: rssTicker.failedFeedCount,
          rss_failed_feeds: rssTicker.failedFeeds.slice(0, 12),
          ai_status: 'disabled',
          max_age_hours: 24,
        },
        items: liveItems.map(tickerResponseItem)
      });
    } catch (e) {
      await writeServerErrorLog({
        context: 'ticker.sync.firestore_write',
        message: 'Failed to write liveTicker items to Firestore.',
        error: e,
        request: req,
        metadata: { syncRunId, itemCount: liveItems.length },
      });
      return NextResponse.json({
        success: true,
        mode: 'rss-local-only',
        count: liveItems.length,
        syncRunId,
        firstItemId: liveItems[0]?.id || null,
        rssCount: rssTicker.items.length,
        rssFailedFeedCount: rssTicker.failedFeedCount,
        aiStatus: 'disabled',
        aiError: null,
        maxAgeHours: 24,
        warning: 'Failed to write to DB',
        items: liveItems.map(tickerResponseItem)
      });
    }

  } catch (err) {
    await writeServerErrorLog({
      context: 'ticker.sync.fatal',
      message: 'Fatal error in ticker sync route.',
      error: err,
      severity: 'critical',
      request: req,
    });

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
