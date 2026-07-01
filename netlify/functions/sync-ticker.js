exports.handler = async function(event, context) {
  const siteUrl = process.env.URL || 'http://localhost:3000';
  console.log(`[Sync Ticker Cron] Triggered. Site URL: ${siteUrl}`);

  const secretParam = process.env.CRON_SECRET ? `&secret=${process.env.CRON_SECRET}` : '';
  const syncUrl = `${siteUrl}/api/ticker/sync?force=true${secretParam}`;

  try {
    console.log(`[Sync Ticker Cron] Fetching ${siteUrl}/api/ticker/sync...`);
    const res = await fetch(syncUrl, { method: 'GET' });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Sync API responded with status ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    console.log('[Sync Ticker Cron] Success. Response data:', JSON.stringify(data));
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: data.count, warning: data.warning })
    };
  } catch (error) {
    console.error('[Sync Ticker Cron] Error fetching sync endpoint:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
