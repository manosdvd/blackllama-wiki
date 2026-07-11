'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // We can also log this to a telemetry service like Sentry or Firebase Crashlytics if available
    console.error('Global application error caught:', error);
  }, [error]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '60vh', 
      padding: '2rem', 
      textAlign: 'center', 
      color: 'var(--text-primary, #f5f5f4)' 
    }}>
      <AlertTriangle size={64} style={{ color: 'var(--alert-critical, #dc2626)', marginBottom: '1.5rem' }} />
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 700 }}>Something went wrong!</h1>
      <p style={{ maxWidth: '500px', marginBottom: '2rem', color: 'var(--text-secondary, #a8a29e)', lineHeight: 1.6 }}>
        We experienced an unexpected error. This might be due to a poor network connection or a temporary server issue.
      </p>
      
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button 
          onClick={() => reset()}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.75rem 1.5rem', 
            backgroundColor: 'var(--primary-color, #f97316)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: 600,
            transition: 'opacity 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
        >
          <RefreshCcw size={18} />
          Try Again
        </button>
        
        <Link 
          href="/"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.75rem 1.5rem', 
            backgroundColor: 'var(--surface-color, #292524)', 
            color: 'var(--text-primary, #f5f5f4)', 
            textDecoration: 'none', 
            borderRadius: '8px', 
            border: '1px solid var(--border-color, #444)', 
            fontWeight: 600,
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover, #3a3431)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-color, #292524)'}
        >
          <Home size={18} />
          Return Home
        </Link>
      </div>
      
      {process.env.NODE_ENV === 'development' && (
        <pre style={{ 
          marginTop: '3rem', 
          padding: '1.5rem', 
          backgroundColor: '#111', 
          borderRadius: '8px', 
          overflowX: 'auto', 
          maxWidth: '100%', 
          fontSize: '0.875rem', 
          textAlign: 'left', 
          border: '1px solid #333',
          color: '#ff8a8a',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          <strong>{error.message}</strong>
          {'\n\n'}{error.stack}
        </pre>
      )}
    </div>
  );
}
