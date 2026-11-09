// Turkish-aware text helpers shared by retrieval and guards.

const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u" };

/** Lowercase with Turkish casing rules and fold diacritics, so "Bagaj hakkı" matches "bagaj hakki". */
export function fold(s: string): string {
  return s.toLocaleLowerCase("tr-TR").replace(/[ışğüöçâîû]/g, (c) => FOLD[c] ?? c);
}

const STOP = new Set(
  (
    "ve ile bir bu su icin mi mu ne nasil kadar da de ben benim bana beni var ama veya en cok olan olarak nedir " +
    "kac hangi gibi ise olur miyim muyum midir mudur bunu sunu ya ki her tum ayrica sonra once icinde uzerine " +
    "mumkun musunuz misiniz yapar yapabilir edebilir olursa olabilir"
  ).split(" "),
);

/**
 * Cheap Turkish stemming: agglutinative suffixes are dropped by keeping a word prefix.
 * Both a 4- and a 5-letter prefix are indexed, so "kedimi" (kedim / kedi) still meets "kedi",
 * while longer roots such as "bagaj" keep the stricter 5-letter match.
 */
function stems(tok: string): string[] {
  const s5 = tok.length > 5 ? tok.slice(0, 5) : tok;
  const s4 = tok.length > 4 ? tok.slice(0, 4) : tok;
  return s5 === s4 ? [s5] : [`5:${s5}`, `4:${s4}`];
}

export function tokenize(s: string): string[] {
  return fold(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .flatMap(stems);
}
