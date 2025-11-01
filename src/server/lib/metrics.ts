// Minimal JSON logger — small, dependency-free, and safe in dev/prod.
// Logs are single-line JSON so you can grep or ship to a collector later.

export function logInfo(msg: string, obj?: Record<string, unknown>) {
  try { console.log(JSON.stringify({ level: "info", msg, ...obj })); } catch {}
}
export function logWarn(msg: string, obj?: Record<string, unknown>) {
  try { console.warn(JSON.stringify({ level: "warn", msg, ...obj })); } catch {}
}
export function logError(msg: string, obj?: Record<string, unknown>) {
  try { console.error(JSON.stringify({ level: "error", msg, ...obj })); } catch {}
}

