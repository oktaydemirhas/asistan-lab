import fs from "node:fs";
import path from "node:path";
import { tokenize } from "./text";

export type Chunk = { id: string; docId: string; title: string; text: string; tokens: string[] };
export type Hit = { chunk: Chunk; score: number };
export type SearchResult = { hits: Hit[]; coverage: number };

const CORPUS_FILE = path.join(process.cwd(), "data", "corpus", "anka-sss.md");

let cache: { chunks: Chunk[]; df: Map<string, number>; avgLen: number } | null = null;

/** One chunk per line; every chunk carries its document title so short lines stay searchable. */
function load() {
  if (cache) return cache;
  const raw = fs.readFileSync(CORPUS_FILE, "utf8");
  const chunks: Chunk[] = [];
  let docId = "";
  let title = "";
  let n = 0;
  for (const line of raw.split(/\r?\n/)) {
    const head = line.match(/^#\s*\[([a-z0-9-]+)\]\s*(.+)$/);
    if (head) {
      docId = head[1];
      title = head[2].trim();
      n = 0;
      continue;
    }
    const text = line.trim();
    if (!text || !docId) continue;
    chunks.push({ id: `${docId}#${++n}`, docId, title, text, tokens: tokenize(`${title} ${text}`) });
  }
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of new Set(c.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = chunks.reduce((a, c) => a + c.tokens.length, 0) / Math.max(chunks.length, 1);
  cache = { chunks, df, avgLen };
  return cache;
}

/** All chunks of a document, in order. Documents are short, so a hit pulls in its siblings (parent-document retrieval). */
export function docChunks(docId: string): Chunk[] {
  return load().chunks.filter((c) => c.docId === docId);
}

export function allChunks(): Chunk[] {
  return load().chunks;
}

export function corpusSize() {
  const { chunks } = load();
  return { chunks: chunks.length, docs: new Set(chunks.map((c) => c.docId)).size };
}

const K1 = 1.5;
const B = 0.75;

/** BM25 over line-level chunks. `coverage` is the share of query terms found in the best chunk. */
export function search(query: string, k = 6): SearchResult {
  const { chunks, df, avgLen } = load();
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return { hits: [], coverage: 0 };

  const N = chunks.length;
  const scored = chunks.map((chunk) => {
    const tf = new Map<string, number>();
    for (const t of chunk.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * chunk.tokens.length) / avgLen)));
    }
    return { chunk, score };
  });

  const hits = scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const best = hits[0]?.chunk.tokens ?? [];
  const bestSet = new Set(best);
  const coverage = q.filter((t) => bestSet.has(t)).length / q.length;
  return { hits, coverage };
}
