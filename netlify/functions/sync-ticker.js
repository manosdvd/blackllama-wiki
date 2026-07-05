exports.handler = async function() {
  const siteUrl = process.env.URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;
  const forceParam = cronSecret ? '?force=true' : '';
  const secretParam = cronSecret ? `&secret=${encodeURIComponent(cronSecret)}` : '';
  const syncUrl = `${siteUrl}/api/ticker/sync${forceParam}${secretParam}`;
  const safeSyncUrl = cronSecret ? syncUrl.replace(secretParam, '&secret=***') : syncUrl;

  console.log(`[Sync Ticker Cron] Triggered. Site URL: ${siteUrl}`);
  if (!cronSecret) {
    console.warn('[Sync Ticker Cron] CRON_SECRET is not configured. Running non-force sync to avoid admin auth failure. Gemini may be skipped if it already ran today.');
  }

  try {
    console.log(`[Sync Ticker Cron] Fetching ${safeSyncUrl}...`);
    const res = await fetch(syncUrl, { method: 'GET', cache: 'no-store' });
    
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
      aiStatus: data.aiStatus,
      warning: data.warning,
      syncRunId: data.syncRunId,
      firstItemId: data.firstItemId,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        mode: data.mode,
        count: data.count,
        rssCount: data.rssCount,
        aiStatus: data.aiStatus,
        warning: data.warning,
        syncRunId: data.syncRunId,
        firstItemId: data.firstItemId,
      })
    };
  } catch (error) {
    console.error('[Sync Ticker Cron] Error fetching sync endpoint:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    };
  }
};
