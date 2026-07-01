'use client';

import React, { useState } from 'react';

export default function TickerSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ticker/sync');
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(`Synced ${data.count} items successfully!`);
      } else {
        setResult(`Error: ${data.error || data.warning || 'Unknown error'}`);
      }
    } catch (e: any) {
      setResult(`Fetch failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', borderRadius: '4px', marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>System Controls</h3>
      <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '1rem' }}>
        Manually trigger the Gemini API to fetch RSS feeds, summarize them, and push the live feed to the Ticker.
      </p>
      <button 
        onClick={handleSync} 
        disabled={loading}
        style={{
          background: 'var(--pine-green)',
          color: 'white',
          border: 'none',
          padding: '0.5rem 1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          borderRadius: '4px'
        }}
      >
        {loading ? 'Syncing...' : 'Sync Live Ticker'}
      </button>
      {result && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--lantern-gold)' }}>{result}</p>}
    </div>
  );
}
