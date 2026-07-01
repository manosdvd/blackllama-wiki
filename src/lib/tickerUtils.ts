import { promises as fs } from 'fs';
import path from 'path';

export async function getOfflineTickerItems() {
  try {
    const jsonPath = path.join(process.cwd(), 'tickerFeeds.json');
    const fileContents = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(fileContents);
    
    // Filter to enabled items
    const enabledItems = (data.offlineTicker || []).filter((item: any) => item.enabled);
    return enabledItems.map((item: any) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      category: item.category
    }));
  } catch (err) {
    console.error('Failed to parse ticker feeds:', err);
    return [];
  }
}
