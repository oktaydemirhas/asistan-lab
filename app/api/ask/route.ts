import { ask } from "@/lib/assistant";
import { clientKey, limited, readBodyLimited } from "@/lib/ingress";

export const maxDuration = 60;

const MAX_BODY = 4096;

export async function POST(req: Request) {
  if (limited(clientKey(req.headers))) return Response.json({ error: "rate_limited" }, { status: 429 });

  const raw = await readBodyLimited(req, MAX_BODY);
  if (raw === null) return Response.json({ error: "too_large" }, { status: 413 });
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
