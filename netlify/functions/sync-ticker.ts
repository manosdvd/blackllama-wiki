// Netlify scheduled functions use UTC cron.
// This job runs every two hours and delegates the actual sync to the protected
// application route so feed parsing and Firestore writes stay in one place.
export const config = {
  schedule: '0 */2 * * *',
};

export default async function syncTicker() {
  const siteUrl = process.env.URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error('[Sync Ticker Cron] CRON_SECRET is not configured; refusing to call the sync endpoint.');
    return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const syncUrl = `${siteUrl}/api/ticker/sync`;

  console.log(`[Sync Ticker Cron] Triggered. Site URL: ${siteUrl}`);

  try {
    const res = await fetch(syncUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': cronSecret,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Sync API responded with status ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    console.log('[Sync Ticker Cron] Success. Response data:', JSON.stringify({
      success: data.success,
      mode: data.mode,
      count: data.count,
      rssCount: data.rssCount,
      warning: data.warning,
      syncRunId: data.syncRunId,
      firstItemId: data.firstItemId,
    }));

    return new Response(JSON.stringify({
      success: true,
      mode: data.mode,
      count: data.count,
      rssCount: data.rssCount,
      warning: data.warning,
      syncRunId: data.syncRunId,
      firstItemId: data.firstItemId,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Sync Ticker Cron] Error fetching sync endpoint:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
