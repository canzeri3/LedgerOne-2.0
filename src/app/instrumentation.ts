// src/app/instrumentation.ts
import * as Sentry from "@sentry/nextjs";

// Next.js will call register() on boot (server). Keep it fast.
export async function register() {
  const dsn = process.env.SENTRY_DSN;

  // Validate DSN: only init when you actually set a real DSN URL
  const isValid =
    !!dsn &&
    /^https?:\/\//i.test(dsn) &&
    dsn.includes("@") &&
    dsn !== "your_server_dsn" &&
    dsn !== "YOUR_SERVER_DSN";

  if (!isValid) return; // no-op in dev without DSN

  try {
    Sentry.init({
      dsn,
      // Keep perf sampling low by default
      tracesSampleRate: 0.1,
      // You can add more integrations later
      integrations: [],
    });
  } catch {
    // never crash boot due to Sentry init
  }
}

