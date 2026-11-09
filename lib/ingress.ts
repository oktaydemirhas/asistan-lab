// Request guards for /api/ask: client key, rate limits and a body cap that is enforced while reading.

const WINDOW_MS = 60_000;
const PER_CLIENT = Number(process.env.ASK_PER_CLIENT_PER_MINUTE ?? 12);
// Not tied to any client key, so spoofing addresses cannot raise the total number of paid LLM calls.
const GLOBAL = Number(process.env.ASK_GLOBAL_PER_MINUTE ?? 120);
const MAX_TRACKED = 5000;

const perClient = new Map<string, number[]>();
let globalHits: number[] = [];

/**
 * Forwarding headers are client-controlled unless a platform or proxy you run overwrites them. They are used only when
 * TRUST_PROXY_HEADERS=1 (Vercel, or behind Cloudflare/nginx with the origin closed to everything else). Otherwise every
 * caller shares one bucket, which is safe but coarse; the global limit still applies either way.
 */
export function clientKey(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.TRUST_PROXY_HEADERS === "1") {
    const v = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0];
    if (v?.trim()) return v.trim().slice(0, 64);
  }
  return "shared";
}

export function limited(key: string, now = Date.now()): boolean {
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  if (globalHits.length >= GLOBAL) return true;

  if (perClient.size >= MAX_TRACKED && !perClient.has(key)) {
    for (const [k, v] of perClient) if (!v.some((t) => now - t < WINDOW_MS)) perClient.delete(k);
    if (perClient.size >= MAX_TRACKED) return true; // full of live entries: refuse unknown keys instead of growing
  }
  const recent = (perClient.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_CLIENT) {
    perClient.set(key, recent);
    return true;
  }
  recent.push(now);
  perClient.set(key, recent);
  globalHits.push(now);
  return false;
}

/** Reads at most `max` bytes. Returns null as soon as the declared or actual size is over the cap, without buffering the rest. */
export async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function resetIngress() {
  perClient.clear();
  globalHits = [];
}
