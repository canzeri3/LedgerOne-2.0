// src/server/obs.ts
// Lightweight metrics with a global singleton; in dev, also persists to a local JSON file
// so separate workers/processes can see the same counters/timers.

import fs from "fs";
import path from "path";

type TimerAgg = { count: number; sumMs: number; maxMs: number };
type MetricsBag = {
  counters: Map<string, number>;
  timers: Map<string, TimerAgg>;
  lastErrAt: number;
  lastErrMsg: string;
  startedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __LG_METRICS__: MetricsBag | undefined;
}

const DEV = process.env.NODE_ENV !== "production";
const DEV_FILE = path.join(process.cwd(), ".next", "cache", "lg-metrics.json");

// Load persisted metrics in dev (best-effort)
function loadDevMetrics(): MetricsBag | null {
  try {
    const raw = fs.readFileSync(DEV_FILE, "utf8");
    const j = JSON.parse(raw);
    const bag: MetricsBag = {
      counters: new Map<string, number>(Object.entries(j.counters || {})),
      timers: new Map<string, TimerAgg>(
        Object.entries(j.timers || {}).map(([k, v]: any) => [k, v as TimerAgg])
      ),
      lastErrAt: Number(j.lastErrAt || 0),
      lastErrMsg: String(j.lastErrMsg || ""),
      startedAt: Number(j.startedAt || Date.now()),
    };
    return bag;
  } catch {
    return null;
  }
}

function persistDevMetrics(bag: MetricsBag) {
  try {
    fs.mkdirSync(path.dirname(DEV_FILE), { recursive: true });
    const counters: Record<string, number> = {};
    bag.counters.forEach((v, k) => (counters[k] = v));
    const timers: Record<string, TimerAgg> = {};
    bag.timers.forEach((v, k) => (timers[k] = v));
    fs.writeFileSync(
      DEV_FILE,
      JSON.stringify(
        {
          counters,
          timers,
          lastErrAt: bag.lastErrAt,
          lastErrMsg: bag.lastErrMsg,
          startedAt: bag.startedAt,
          now: Date.now(),
        },
        null,
        0
      )
    );
  } catch {
    // ignore
  }
}

// Create or reuse global bag; in dev, prefer persisted content if present
const initial: MetricsBag =
  (DEV && loadDevMetrics()) || {
    counters: new Map<string, number>(),
    timers: new Map<string, TimerAgg>(),
    lastErrAt: 0,
    lastErrMsg: "",
    startedAt: Date.now(),
  };

const m: MetricsBag = (globalThis.__LG_METRICS__ ??= initial);

function bumpPersist() {
  if (DEV) persistDevMetrics(m);
}

export function count(name: string, n = 1) {
  m.counters.set(name, (m.counters.get(name) || 0) + n);
  bumpPersist();
}

export async function time<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const v = await fn();
    const dt = Date.now() - t0;
    const t = m.timers.get(name) || { count: 0, sumMs: 0, maxMs: 0 };
    t.count += 1;
    t.sumMs += dt;
    t.maxMs = Math.max(t.maxMs, dt);
    m.timers.set(name, t);
    bumpPersist();
    return v;
  } catch (e) {
    const dt = Date.now() - t0;
    const t = m.timers.get(name) || { count: 0, sumMs: 0, maxMs: 0 };
    t.count += 1;
    t.sumMs += dt;
    t.maxMs = Math.max(t.maxMs, dt);
    m.timers.set(name, t);
    bumpPersist();
    throw e;
  }
}

export function recordError(msg: string) {
  m.lastErrAt = Date.now();
  m.lastErrMsg = msg;
  count("errors", 1); // count() persists
}

export function snapshot() {
  // Re-load persisted on read in dev (helps cross-worker)
  const latest = DEV && loadDevMetrics();
  if (latest) {
    m.counters = latest.counters;
    m.timers = latest.timers;
    m.lastErrAt = latest.lastErrAt;
    m.lastErrMsg = latest.lastErrMsg;
    m.startedAt = latest.startedAt;
  }

  const timers: Record<string, { count: number; avg: number; max: number }> = {};
  m.timers.forEach((t, k) => {
    timers[k] = { count: t.count, avg: t.count ? +(t.sumMs / t.count).toFixed(1) : 0, max: t.maxMs };
  });
  const counters: Record<string, number> = {};
  m.counters.forEach((v, k) => (counters[k] = v));
  return {
    startedAt: new Date(m.startedAt).toISOString(),
    now: new Date().toISOString(),
    lastErrAt: m.lastErrAt ? new Date(m.lastErrAt).toISOString() : null,
    lastErrMsg: m.lastErrMsg || null,
    counters,
    timers,
  };
}

export type { MetricsBag };
