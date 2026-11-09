// Deterministic PII edge cases (no LLM): what must be masked, what must be left alone, and known gaps.
import { maskPii, unmask } from "../lib/guard";

type Case = { name: string; input: string; masked?: string[]; clean?: boolean; raw?: string[]; known?: boolean };

const TCKN = "10000000146"; // valid checksum
const cases: Case[] = [
  // must be masked
  { name: "TCKN düz", input: `TC kimlik ${TCKN}`, masked: ["TCKN"], raw: [TCKN] },
  { name: "TCKN yapışık harf", input: `TC${TCKN} ile`, masked: ["TCKN"], raw: [TCKN] },
  { name: "TCKN iki tane", input: `Benimki ${TCKN}, eşiminki 10000000146`, masked: ["TCKN", "TCKN"], raw: [TCKN] },
  { name: "TCKN boşluklu", input: "TC: 100 000 001 46", masked: ["TCKN"], raw: ["100 000 001 46"] },
  { name: "TCKN tireli", input: "TC: 100-000-001-46", masked: ["TCKN"], raw: ["100-000-001-46"] },
  { name: "IBAN boşluklu", input: "TR33 0006 1005 1978 6457 8413 26", masked: ["IBAN"], raw: ["0006 1005"] },
  { name: "IBAN bitişik", input: "TR330006100519786457841326", masked: ["IBAN"], raw: ["TR330006100519786457841326"] },
  { name: "IBAN küçük harf", input: "tr33 0006 1005 1978 6457 8413 26", masked: ["IBAN"], raw: ["0006 1005"] },
  { name: "IBAN tireli", input: "TR33-0006-1005-1978-6457-8413-26", masked: ["IBAN"], raw: ["0006-1005"] },
  { name: "Kart bitişik", input: "kart 4111111111111111", masked: ["KART"], raw: ["4111111111111111"] },
  { name: "Kart tireli", input: "kart 4111-1111-1111-1111", masked: ["KART"], raw: ["4111-1111-1111-1111"] },
  { name: "Kart Amex 4-6-5", input: "kart 3782 822463 10005", masked: ["KART"], raw: ["822463"] },
  { name: "Telefon +90", input: "+90 532 123 45 67", masked: ["TELEFON"], raw: ["123 45 67"] },
  { name: "Telefon bitişik", input: "05321234567", masked: ["TELEFON"], raw: ["05321234567"] },
  { name: "Telefon parantezli", input: "(532) 123 45 67", masked: ["TELEFON"], raw: ["123 45 67"] },
  { name: "Telefon tireli", input: "532-123-45-67", masked: ["TELEFON"], raw: ["123-45-67"] },
  { name: "E-posta artı", input: "ali.veli+bilet@mail.example.com.tr", masked: ["EPOSTA"], raw: ["ali.veli+bilet"] },
  { name: "E-posta büyük harf", input: "ALI.VELI@EXAMPLE.COM", masked: ["EPOSTA"], raw: ["ALI.VELI"] },

  // must be left alone (false positives)
  { name: "11 hane, sağlama geçersiz", input: "Sipariş no 12345678901", clean: true },
  { name: "PNR", input: "ANK123 rezervasyonum", clean: true },
  { name: "Fiyatlar", input: "450 TL, 1.000 TL ve 5.000 mil", clean: true },
  { name: "Tarih ve saat", input: "12.05.2026 tarihinde 09:45 uçuşu", clean: true },
  { name: "Uçuş kodu", input: "TK1234 sefer sayısı", clean: true },
  // Deliberate trade-off: no Luhn check, so a 16-digit invoice number is masked too (harmless; a mistyped real card must not leak).
  { name: "16 hane, Luhn geçersiz → maskelenir", input: "Fatura no 1234 5678 9012 3456", masked: ["KART"], raw: ["5678 9012"] },

  // adversarial / known gaps (reported separately, not failures)
  { name: "TCKN tam genişlik rakam", input: "TC １００００００１４６", masked: ["TCKN"], known: true },
  { name: "TCKN araya sıfır genişlikli boşluk", input: "TC 1000000​0146", masked: ["TCKN"], known: true },
  { name: "Telefon sözcükle yazılmış", input: "beş üç iki yüz yirmi üç kırk beş altmış yedi", masked: ["TELEFON"], known: true },
  { name: "E-posta (at) yazımı", input: "ali.veli (at) example.com", masked: ["EPOSTA"], known: true },
];

let hard = 0;
let gaps = 0;
for (const c of cases) {
  const { text, entities } = maskPii(c.input);
  const types = entities.map((e) => e.type);
  const problems: string[] = [];
  if (c.clean && entities.length) problems.push(`yanlış pozitif: ${types.join(",")}`);
  if (c.masked) {
    const missing = c.masked.filter((t, i) => types.filter((x) => x === t).length <= c.masked!.slice(0, i).filter((x) => x === t).length);
    if (missing.length) problems.push(`maskelenmedi: ${missing.join(",")} (bulunan: ${types.join(",") || "yok"})`);
  }
  const leaked = (c.raw ?? []).filter((r) => text.includes(r));
  if (leaked.length) problems.push(`ham değer çıktıda: ${leaked.join(" | ")}`);
  if (entities.length && unmask(text, entities) !== c.input) problems.push("unmask gidiş-dönüş bozuk");

  const ok = problems.length === 0;
  const tag = ok ? "OK   " : c.known ? "BOŞLUK" : "HATA ";
  if (!ok) (c.known ? gaps++ : hard++);
  console.log(`${tag} ${c.name.padEnd(36)} ${ok ? "" : problems.join("; ")}`);
}
console.log(`\n${cases.length} durum: ${hard} hata, ${gaps} bilinen boşluk`);
process.exit(hard ? 1 : 0);
