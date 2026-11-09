import { fold } from "./text";

export type Entity = { type: string; placeholder: string; value: string };

/** Official TCKN checksum, so random 11-digit numbers are not masked as identity numbers. */
function validTckn(d: string): boolean {
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const n = d.split("").map(Number);
  const odd = n[0] + n[2] + n[4] + n[6] + n[8];
  const even = n[1] + n[3] + n[5] + n[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = n.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return n[9] === d10 && n[10] === d11;
}

/** Full-width digits, non-breaking spaces and zero-width characters are folded away so the patterns below see plain text. */
export function normalizeInput(s: string): string {
  return s.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "");
}

const PATTERNS: { type: string; re: RegExp; ok?: (m: string) => boolean }[] = [
  // Digit runs use lookarounds instead of \b so a value glued to letters ("TC10000000146") is still found.
  { type: "IBAN", re: /(?<![A-Za-z0-9])TR[\s.-]?\d{2}(?:[\s.-]?\d{4}){5}[\s.-]?\d{2}(?!\d)/gi },
  // Any 4-4-4-4 or Amex 4-6-5 digit group, or a bare run of 13-19 digits, is masked without a Luhn check:
  // over-masking an invoice number is harmless, leaking a mistyped card is not.
  { type: "KART", re: /(?<!\d)(?:\d{13,19}|(?:\d{4}[\s.-]?){3}\d{4}|\d{4}[\s.-]?\d{6}[\s.-]?\d{5})(?!\d)/g },
  { type: "TCKN", re: /(?<!\d)[1-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}(?!\d)/g, ok: validTckn },
  // An 11-digit number written right after "TC" / "kimlik" is masked even when the checksum fails (a mistyped TCKN must not leak).
  { type: "TCKN", re: /(?<=(?:\btc|t\.c\.|kimlik)[^\d]{0,15})[1-9]\d{10}(?!\d)/gi },
  { type: "TELEFON", re: /(?:\+?90[\s.-]?|0)?\(?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g },
  // Landlines (2xx-4xx area codes) and foreign numbers with a +country prefix.
  { type: "TELEFON", re: /(?<!\d)(?:\+?90[\s.-]?|0)?\(?[2-4]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g },
  { type: "TELEFON", re: /\+(?!90)\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{2,4}(?!\d)/g },
  { type: "EPOSTA", re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu },
];

/** Replace personal data with placeholders before anything leaves for the LLM. */
export function maskPii(input: string): { text: string; entities: Entity[] } {
  const entities: Entity[] = [];
  let text = normalizeInput(input);
  const counters: Record<string, number> = {};
  for (const { type, re, ok } of PATTERNS) {
    text = text.replace(re, (m) => {
      if (ok && !ok(m.replace(/\D/g, ""))) return m;
      counters[type] = (counters[type] ?? 0) + 1;
      const placeholder = `[${type}_${counters[type]}]`;
      entities.push({ type, placeholder, value: m });
      return placeholder;
    });
  }
  return { text, entities };
}

export function unmask(text: string, entities: Entity[]): string {
  return entities.reduce((acc, e) => acc.split(e.placeholder).join(e.value), text);
}

const INJECTION: RegExp[] = [
  /onceki.{0,20}(talimat|kural|komut|yonerge)/,
  /(talimat|kural|komut)lar?i?.{0,15}(unut|yok say|gormezden)/,
  /ignore.{0,25}(previous|prior|above|all).{0,25}(instruction|rule|prompt)/,
  /(sistem|system).{0,10}(prompt|mesaj|talimat)/,
  /(gizli|secret).{0,10}(kod|code|anahtar|key)/,
  /reveal.{0,30}(prompt|instruction)/,
  /jailbreak|developer mode|\bdan mode\b/,
  /cevab?[a-z]*\s+(sonuna|basina)\s+.{0,40}\byaz/,
];

export function detectInjection(input: string): boolean {
  const f = fold(input);
  return INJECTION.some((re) => re.test(f));
}

/**
 * Drop sentences that match a known injection pattern, so a harmless question with an appended
 * instruction ("... cevabının sonuna X yaz") reaches the model as the question alone.
 * Only catches known patterns; the model-side rule and the eval still cover the rest.
 */
export function stripInjected(input: string): { text: string; removed: string[] } {
  const parts = input.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  const removed: string[] = [];
  for (const p of parts) (detectInjection(p) ? removed : kept).push(p);
  return { text: kept.join(" ").trim(), removed };
}
