// Prints the best cosine similarity per question, to pick the refusal threshold from the ORIGINAL cases only (never the holdout).
import fs from "node:fs";
import path from "node:path";
import { dot, embed } from "../lib/embed";
import { docChunks, corpusSize } from "../lib/retriever";

async function main() {
  const file = process.argv[2] ?? "cases.json";
  const cases = JSON.parse(fs.readFileSync(path.join(process.cwd(), "evals", file), "utf8")) as { id: string; category: string; question: string }[];
  const docs = [...new Set(fs.readFileSync(path.join(process.cwd(), "data", "corpus", "anka-sss.md"), "utf8").match(/\[([a-z0-9-]+)\]/g)?.map((s) => s.slice(1, -1)))];
  const chunks = docs.flatMap((d) => docChunks(d));
  console.log(corpusSize(), chunks.length);
  const vecs = await embed(chunks.map((c) => `${c.title}. ${c.text}`), "passage");
  const qv = await embed(cases.map((c) => c.question), "query");
  for (const [i, c] of cases.entries()) {
    const best = Math.max(...vecs.map((v) => dot(v, qv[i])));
    console.log(c.category.padEnd(16), c.id.padEnd(9), best.toFixed(3), c.question.slice(0, 60));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
