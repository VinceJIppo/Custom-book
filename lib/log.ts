/**
 * Logger that never writes image data. Buffers, typed arrays, data: URLs and
 * long base64-looking strings are replaced with a short description.
 */
const BASE64_RE = /^[A-Za-z0-9+/=\s]{200,}$/;
const MAX_STRING = 500;

export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth limit]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[data-url ${value.length} chars]`;
    if (BASE64_RE.test(value)) return `[base64 ${value.length} chars]`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}... [${value.length} chars]` : value;
  }
  if (typeof value !== "object") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (ArrayBuffer.isView(value)) return `[binary ${value.byteLength} bytes]`;
  if (value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`;
  if (value instanceof Error) return { name: value.name, message: sanitize(value.message, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = /^(data|b64|base64|b64_json|image|bytes)$/i.test(k) && typeof v === "string" && v.length > 120 ? `[${k} ${v.length} chars]` : sanitize(v, depth + 1);
  }
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (level === "debug" && process.env.LOG_DEBUG !== "1") return;
  const line = meta ? `${msg} ${JSON.stringify(sanitize(meta))}` : msg;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${level}] ${line}`);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};

/** Short, safe error text for storing in the DB. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return String(sanitize(raw)).slice(0, 1000);
}
