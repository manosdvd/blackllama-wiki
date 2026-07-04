'use client';

import React, { useState } from 'react';
import { getAuth } from 'firebase/auth';

interface SyncResponse {
  success?: boolean;
  count?: number;
  message?: string;
  error?: string;
  warning?: string;
  syncRunId?: string | null;
  firstItemId?: string | null;
  latestId?: string;
}

export default function TickerSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/ticker/sync?force=true', { headers, cache: 'no-store' });
      const data = (await res.json()) as SyncResponse;
      const debugId = data.syncRunId || data.firstItemId || data.latestId;
      if (res.ok && data.success) {
        const countText = typeof data.count === 'number' ? `Synced ${data.count} items successfully!` : data.message || 'Sync checked.';
        setResult(`${countText}${debugId ? ` ID: ${debugId}` : ''}`);
      } else {
        setResult(`Error: ${data.error || data.warning || 'Unknown error'}${debugId ? ` ID: ${debugId}` : ''}`);
      }
    } catch (e: unknown) {
      setResult(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', borderRadius: '4px', marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>System Controls</h3>
      <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '1rem' }}>
        Manually force Gemini to fetch current sources, rebuild the live ticker, and push the result to Firestore.
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
        {loading ? 'Force Syncing...' : 'Force Sync Live Ticker'}
      </button>
      {result && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--lantern-gold)' }}>{result}</p>}
    </div>
  );
}
