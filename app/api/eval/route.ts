import { readReport, runEval } from "@/lib/eval";

export const maxDuration = 300;

let running = false;

export async function GET() {
  return Response.json(readReport());
}

/**
 * Running the suite makes ~31 paid LLM calls, so in production it needs EVAL_ADMIN_TOKEN and is single-flight.
 * Without the token the route looks like it does not exist.
 */
export async function POST(req: Request) {
  const token = process.env.EVAL_ADMIN_TOKEN;
  if (process.env.NODE_ENV === "production" && (!token || req.headers.get("x-admin-token") !== token)) {
    return new Response(null, { status: 404 });
  }
  if (running) return Response.json({ error: "already_running" }, { status: 409 });
  running = true;
  try {
    return Response.json(await runEval(3));
  } catch (e) {
    console.error("eval failed:", e);
    return Response.json({ error: "eval_failed" }, { status: 502 });
  } finally {
    running = false;
  }
}
