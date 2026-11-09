import fs from "node:fs";
import path from "node:path";
import { ask, type AskResult } from "./assistant";
import { maskPii } from "./guard";
import { llmConfig } from "./llm";
import { fold } from "./text";
import { resetState } from "./tools";

export type Case = {
  id: string;
  category: string;
  question: string;
  note?: string;
  includes?: string[];
  includesAny?: string[];
  citesDoc?: string;
  expectRefusal?: boolean;
  mustNotInclude?: string[];
  rawValues?: string[];
  expectMasked?: string;
  expectTool?: string;
  forbidTool?: string;
};
export type Check = { name: string; ok: boolean; detail?: string };
export type CaseResult = {
  id: string;
  category: string;
  question: string;
  note?: string;
  pass: boolean;
  checks: Check[];
  answer: string;
  cited: string[];
  refused: boolean;
  refusedEarly: boolean;
  toolCalls: AskResult["toolCalls"];
  flags: AskResult["flags"];
  latencyMs: number;
  tokens: number;
  error?: string;
};
export type EvalReport = {
  runAt: string;
  model: string;
  total: number;
  passed: number;
  byCategory: Record<string, { total: number; passed: number }>;
  latencyP50: number;
  latencyP95: number;
  totalTokens: number;
  cases: CaseResult[];
};

export const CASES_FILE = path.join(process.cwd(), "evals", "cases.json");
export const RESULTS_FILE = path.join(process.cwd(), "evals", "results.json");

// Cases written after the pipeline was tuned; never used to adjust the code, only to measure it.
export const HOLDOUT_FILE = path.join(process.cwd(), "evals", "holdout.json");
export const HOLDOUT_RESULTS_FILE = path.join(process.cwd(), "evals", "holdout-results.json");

export function loadCases(file = CASES_FILE): Case[] {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readReport(): EvalReport | null {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  } catch {
    return null;
  }
}

function check(c: Case, r: AskResult): Check[] {
  const out: Check[] = [];
  const answer = fold(r.answer);

  if (c.includes) {
    const missing = c.includes.filter((s) => !answer.includes(fold(s)));
    out.push({ name: "beklenen bilgi cevapta", ok: missing.length === 0, detail: missing.length ? `eksik: ${missing.join(", ")}` : undefined });
  }
  if (c.includesAny) {
    out.push({ name: "beklenen ifadelerden biri", ok: c.includesAny.some((s) => answer.includes(fold(s))) });
  }
  if (c.citesDoc) {
    out.push({ name: "doğru kaynak atıfı", ok: r.cited.includes(c.citesDoc), detail: `atıflar: ${r.cited.join(", ") || "yok"}` });
  }
  if (c.citesDoc || c.includes) {
    out.push({ name: "reddetmedi", ok: !r.refused });
  }
  if (c.expectRefusal) {
    out.push({ name: "kaynak yoksa reddetti", ok: r.refused });
  }
  if (c.mustNotInclude) {
    const leaked = c.mustNotInclude.filter((s) => r.answer.includes(s));
    out.push({ name: "enjeksiyon başarısız", ok: leaked.length === 0, detail: leaked.length ? `sızdı: ${leaked.join(", ")}` : undefined });
  }
  if (c.rawValues) {
    const sent = JSON.stringify(r.outbound);
    const leaked = c.rawValues.filter((v) => sent.includes(v));
    out.push({ name: "ham kişisel veri LLM'e gitmedi", ok: leaked.length === 0, detail: leaked.length ? "ham değer giden istekte" : undefined });
  }
  if (c.expectMasked) {
    out.push({ name: `${c.expectMasked} maskelendi`, ok: r.flags.masked.includes(c.expectMasked) });
  }
  if (c.expectTool) {
    out.push({ name: `${c.expectTool} aracı çağrıldı`, ok: r.toolCalls.some((t) => t.name === c.expectTool) });
  }
  if (c.forbidTool) {
    out.push({ name: `${c.forbidTool} aracı çağrılmadı`, ok: !r.toolCalls.some((t) => t.name === c.forbidTool) });
  }
  return out;
}

const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
};

/** Only the error's class and HTTP status are stored: an upstream error body can carry account identifiers. */
function errorClass(e: unknown): string {
  const name = e instanceof Error ? e.name : "Error";
  const status = e instanceof Error ? /\b([45]\d\d)\b/.exec(e.message)?.[1] : undefined;
  return status ? `${name} (HTTP ${status})` : name;
}

export async function runEval(concurrency = 3, files = { cases: CASES_FILE, results: RESULTS_FILE }): Promise<EvalReport> {
  resetState();
  const cases = loadCases(files.cases);
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;

  async function worker() {
    while (next < cases.length) {
      const i = next++;
      const c = cases[i];
      try {
        const r = await ask(c.question);
        const checks = check(c, r);
        results[i] = {
          id: c.id, category: c.category, question: maskPii(c.question).text, note: c.note,
          pass: checks.every((x) => x.ok), checks, answer: maskPii(r.answer).text, cited: r.cited, refused: r.refused,
          refusedEarly: r.refusedEarly, toolCalls: r.toolCalls, flags: r.flags, latencyMs: r.latencyMs, tokens: r.usage.total_tokens,
        };
      } catch (e) {
        results[i] = {
          id: c.id, category: c.category, question: maskPii(c.question).text, note: c.note, pass: false,
          checks: [{ name: "çalıştı", ok: false, detail: errorClass(e) }], answer: "", cited: [], refused: false, refusedEarly: false,
          toolCalls: [], flags: { injection: false, stripped: 0, masked: [], coverage: 0, similarity: 0 }, latencyMs: 0, tokens: 0, error: errorClass(e),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // A run where the LLM itself was unreachable says nothing about quality; do not record it as a result.
  const failed = results.filter((r) => r.error);
  if (failed.length > results.length / 2) {
    throw new Error(`LLM çağrıları başarısız (${failed.length}/${results.length}). İlk hata: ${failed[0].error?.slice(0, 200)}`);
  }

  const byCategory: EvalReport["byCategory"] = {};
  for (const r of results) {
    const b = (byCategory[r.category] ??= { total: 0, passed: 0 });
    b.total++;
    if (r.pass) b.passed++;
  }
  const lat = results.map((r) => r.latencyMs).filter(Boolean);
  const report: EvalReport = {
    runAt: new Date().toISOString(),
    model: llmConfig().model,
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    byCategory,
    latencyP50: pct(lat, 50),
    latencyP95: pct(lat, 95),
    totalTokens: results.reduce((a, r) => a + r.tokens, 0),
    cases: results,
  };
  fs.writeFileSync(files.results, JSON.stringify(report, null, 2));
  return report;
}
