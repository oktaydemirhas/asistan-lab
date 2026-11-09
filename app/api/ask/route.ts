import { ask } from "@/lib/assistant";

export const maxDuration = 60;

const MAX_BODY = 4096;
const WINDOW_MS = 60_000;
const LIMIT = 12;
const seen = new Map<string, number[]>();

/**
 * Best-effort per-IP limit. It lives in instance memory, so on serverless it is only a speed bump:
 * put a real rate-limit rule (e.g. Cloudflare) and a monthly spend cap on the provider key in front of a public deploy.
 */
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some((t) => now - t < WINDOW_MS)) seen.delete(k);
  return recent.length > LIMIT;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (limited(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });
  let body: { question?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "question_required" }, { status: 400 });

  try {
    const result = await ask(question.slice(0, 500));
    // `outbound` is large and internal; the UI only needs a summary of what left the machine.
    const { outbound, ...rest } = result;
    return Response.json({ ...rest, outboundMessages: outbound.length });
  } catch (e) {
    console.error("ask failed:", e);
    return Response.json({ error: "upstream_error" }, { status: 502 });
  }
}
