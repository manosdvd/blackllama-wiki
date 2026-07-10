'use client';

import React, { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { useAuth } from '@/components/auth/AuthContext';

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

async function parseSyncResponse(res: Response): Promise<SyncResponse> {
  const text = await res.text();

  if (!text) {
    return res.ok ? { success: true } : { success: false, error: `HTTP ${res.status} ${res.statusText}` };
  }

  try {
    return JSON.parse(text) as SyncResponse;
  } catch {
    return {
      success: false,
      error: `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 240)}`,
    };
  }
}

export default function TickerSyncButton() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!isAdmin) return null;

  const handleSync = async () => {
    setLoading(true);
    setResult(null);

    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error('No Firebase auth token found for the signed-in admin.');
      }

      const res = await fetch('/api/ticker/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Firebase-ID-Token': token,
        },
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await parseSyncResponse(res);
      const debugId = data.syncRunId || data.firstItemId || data.latestId;

      if (res.ok && data.success !== false) {
        const countText = typeof data.count === 'number'
          ? `Synced ${data.count} items successfully!`
          : data.message || 'Sync checked.';
        setResult(`${countText}${debugId ? ` ID: ${debugId}` : ''}`);
      } else {
        setResult(`Error: ${data.error || data.warning || 'Unknown error'}${debugId ? ` ID: ${debugId}` : ''}`);
      }
    } catch (error: unknown) {
      setResult(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', borderRadius: '4px', marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>System Controls</h3>
      <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '1rem' }}>
        Manually fetch current RSS feeds, rebuild the live ticker, and push the result to Firestore.
      </p>
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        style={{
          background: 'var(--pine-green)',
          color: 'white',
          border: 'none',
          padding: '0.5rem 1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          borderRadius: '4px',
        }}
      >
        {loading ? 'Syncing...' : 'Sync Live Ticker'}
      </button>
      {result && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--lantern-gold)' }}>{result}</p>}
    </div>
  );
}
