'use client';

import { useEffect } from 'react';

export default function TickerRefreshOnLoad() {
  useEffect(() => {
    void fetch('/api/ticker/sync', { cache: 'no-store' }).catch(() => {
      // The ticker keeps its existing cached/offline items if refresh fails.
    });
  }, []);

  return null;
}
