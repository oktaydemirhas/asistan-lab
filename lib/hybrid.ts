import { dot, embed } from "./embed";
import { allChunks, search, type Chunk, type Hit } from "./retriever";

// Reciprocal Rank Fusion constant from the original paper; it only damps the weight of top ranks.
const RRF_K = 60;
const VECTOR_TOP = 3;

export type HybridResult = { hits: Hit[]; coverage: number; similarity: number };

let index: Promise<{ chunk: Chunk; vec: number[] }[]> | null = null;

function vectors() {
  index ??= (async () => {
    const chunks = allChunks();
    const vecs = await embed(chunks.map((c) => `${c.title}. ${c.text}`), "passage");
    return chunks.map((chunk, i) => ({ chunk, vec: vecs[i] }));
  })();
  return index;
}

/**
 * BM25 finds exact words (prices, "power bank"); embeddings find meaning ("puset" ~ "bebek arabası").
 * Both rankings are merged with RRF. `coverage` is BM25's term overlap, `similarity` the best cosine score:
 * the caller refuses without an LLM call only when both are low.
 */
export async function searchHybrid(query: string, k = 6): Promise<HybridResult> {
  const lexical = search(query, k);
  const idx = await vectors();
  const [qv] = await embed([query], "query");
  const semantic = idx.map(({ chunk, vec }) => ({ chunk, cos: dot(vec, qv) })).sort((a, b) => b.cos - a.cos);

  const fused = new Map<string, Hit>();
  const add = (chunk: Chunk, rank: number) => {
    const prev = fused.get(chunk.id);
    fused.set(chunk.id, { chunk, score: (prev?.score ?? 0) + 1 / (RRF_K + rank + 1) });
  };
  lexical.hits.forEach((h, r) => add(h.chunk, r));
  semantic.slice(0, VECTOR_TOP).forEach((h, r) => add(h.chunk, r));

  const hits = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k);
  return { hits, coverage: lexical.coverage, similarity: semantic[0]?.cos ?? 0 };
}
