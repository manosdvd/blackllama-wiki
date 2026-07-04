import { promises as fs } from 'fs';
import path from 'path';

interface OfflineTickerItem {
  id: string;
  title: string;
  url: string;
  category: string;
  enabled: boolean;
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
  try {
    const jsonPath = path.join(process.cwd(), 'tickerFeeds.json');
    const fileContents = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(fileContents);
    
    const enabledItems = ((data.offlineTicker || []) as OfflineTickerItem[]).filter((item) => item.enabled);
    const selectedItems = selectOneOfflineItemPerCategory(enabledItems);

    return selectedItems.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      category: item.category,
      sourceType: 'offline'
    }));
  } catch (err) {
    console.error('Failed to parse ticker feeds:', err);
    return [];
  }
}
