import { promises as fs } from 'fs';
import path from 'path';

interface OfflineTickerItem {
  id: string;
  title: string;
  url: string;
  category: string;
  enabled: boolean;
  sourceType?: string;
  sourceName?: string;
}

interface CompactTickerSource {
  name: string;
  url: string;
}

type CompactTickerRow = [
  id: string,
  title: string,
  category: string,
  theme: string,
  sourceKey: string,
];

interface CompactTickerFile {
  version: number;
  defaults?: {
    enabled?: boolean;
    sourceType?: string;
  };
  sources: Record<string, CompactTickerSource>;
  items: CompactTickerRow[];
}

async function readJsonFile<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    const jsonPath = path.join(process.cwd(), relativePath);
    const fileContents = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(fileContents) as T;
  } catch (err) {
    console.warn(`Failed to parse ${relativePath}:`, err);
    return fallback;
  }
}

function expandCompactTickerFile(file: CompactTickerFile): OfflineTickerItem[] {
  if (!file || file.version !== 1 || !file.sources || !Array.isArray(file.items)) {
    return [];
  }

  return file.items.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 5) return [];

    const [id, title, category, _theme, sourceKey] = row;
    const source = file.sources[sourceKey];

    if (!id || !title || !category || !source?.url) return [];

    return [{
      id,
      title,
      url: source.url,
      category,
      enabled: file.defaults?.enabled ?? true,
      sourceType: file.defaults?.sourceType || 'offline',
      sourceName: source.name,
    }];
  });
}

function stableHash(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function selectOneOfflineItemPerCategory(items: OfflineTickerItem[]) {
  const byCategory = new Map<string, OfflineTickerItem[]>();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date());

  items.forEach((item) => {
    const category = item.category || 'uncategorized';
    const bucket = byCategory.get(category) || [];
    bucket.push(item);
    byCategory.set(category, bucket);
  });

  return [...byCategory.entries()].map(([category, bucket]) => {
    const sortedBucket = [...bucket].sort((a, b) => a.id.localeCompare(b.id));
    const index = stableHash(`${today}:${category}`) % sortedBucket.length;
    return sortedBucket[index];
  });
}

export async function getOfflineTickerItems() {
  const [
    quoteItems,
    curatedItems,
    meritBadgeItems,
    mythBustingItems,
    knotItems,
    catalinaFieldGuide,
    backpackingSkills,
    campSafety,
  ] = await Promise.all([
    readJsonFile<OfflineTickerItem[]>('src/data/offlineQuoteTicker.json', []),
    readJsonFile<OfflineTickerItem[]>('src/data/offlineCuratedTicker.json', []),
    readJsonFile<OfflineTickerItem[]>('src/data/offlineMeritBadgeTicker.json', []),
    readJsonFile<OfflineTickerItem[]>('src/data/offlineMythBustingTicker.json', []),
    readJsonFile<OfflineTickerItem[]>('src/data/offlineKnotTicker.json', []),
    readJsonFile<CompactTickerFile>('src/data/offlineCatalinaFieldGuideTicker.json', {
      version: 1,
      sources: {},
      items: [],
    }),
    readJsonFile<CompactTickerFile>('src/data/offlineBackpackingSkillsTicker.json', {
      version: 1,
      sources: {},
      items: [],
    }),
    readJsonFile<CompactTickerFile>('src/data/offlineCampSafetyTicker.json', {
      version: 1,
      sources: {},
      items: [],
    }),
  ]);

  const enabledItems = [
    ...quoteItems,
    ...curatedItems,
    ...meritBadgeItems,
    ...mythBustingItems,
    ...knotItems,
    ...expandCompactTickerFile(catalinaFieldGuide),
    ...expandCompactTickerFile(backpackingSkills),
    ...expandCompactTickerFile(campSafety),
  ].filter((item) => item.enabled);

  const selectedItems = selectOneOfflineItemPerCategory(enabledItems);

  return selectedItems.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    category: item.category,
    source: item.sourceName || 'Camp Lawton',
    sourceType: item.sourceType || 'offline',
  }));
}
