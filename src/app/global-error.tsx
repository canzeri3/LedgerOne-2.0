// src/app/global-error.tsx
"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only report when DSN exists
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const isValid =
    !!dsn &&
    /^https?:\/\//i.test(dsn) &&
    dsn.includes("@") &&
    dsn !== "your_client_dsn" &&
    dsn !== "YOUR_CLIENT_DSN";

  React.useEffect(() => {
    if (isValid) {
      // safe capture on client
      Sentry.captureException(error);
    }
  }, [error, isValid]);

  return (
    <html>
      <body style={{ padding: 24, color: "#eee", background: "#111" }}>
        <h2>Something went wrong</h2>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          An unexpected error occurred. You can try again.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "8px 12px",
            background: "#333",
            borderRadius: 8,
            border: "1px solid #444",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

