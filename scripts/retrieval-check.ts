import { loadCases } from "../lib/eval";
import { maskPii } from "../lib/guard";
import { corpusSize, search } from "../lib/retriever";

console.log("korpus:", corpusSize());
for (const c of loadCases()) {
  const { hits, coverage } = search(maskPii(c.question).text, 6);
  const top = hits[0];
  const docs = [...new Set(hits.map((h) => h.chunk.docId))].slice(0, 3).join(",");
  const want = c.citesDoc ? (hits.some((h) => h.chunk.docId === c.citesDoc) ? "OK " : "MISS") : "   ";
  console.log(`${c.id.padEnd(7)} cov=${coverage.toFixed(2)} top=${top ? top.score.toFixed(1) : "-"} ${want} [${docs}]`);
}
