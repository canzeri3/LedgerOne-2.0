'use client';

import * as React from 'react';

/**
 * Minimal global error boundary without Sentry.
 * - No external deps (build won't require @sentry/nextjs)
 * - Still logs to console for local debugging
 * - Keeps the same reset UX
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Best-effort local logging so you still see errors in the console
    // (You can wire this to /api/metrics later if you add a POST handler.)
    // eslint-disable-next-line no-console
    console.error('GlobalError boundary caught:', {
      message: error?.message,
      stack: error?.stack,
      digest: (error as any)?.digest,
    });
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 24, color: '#e5e7eb', background: 'rgb(28,29,31)', minHeight: '100vh' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h2>
          <p style={{ opacity: 0.8, marginTop: 8 }}>
            {String(error?.message ?? 'Unexpected error')}
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgb(51,52,54)',
              background: 'transparent',
              color: '#e5e7eb',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
