// Deterministic checks for the request guards and the tool guard (no LLM, no network).
import { clientKey, limited, readBodyLimited, resetIngress } from "../lib/ingress";
import { resetState, runTool, toolAllowed } from "../lib/tools";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "HATA "} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failures++;
}

// --- client key: forwarding headers are ignored unless the operator trusts the proxy
const h = new Headers({ "x-forwarded-for": "198.51.100.7", "cf-connecting-ip": "198.51.100.8" });
check("başlık güvenilmezse tek kova", clientKey(h, {}) === "shared");
check("TRUST_PROXY_HEADERS=1 ile cf-connecting-ip", clientKey(h, { TRUST_PROXY_HEADERS: "1" }) === "198.51.100.8");
check("çok uzun başlık kırpılır", clientKey(new Headers({ "x-forwarded-for": "a".repeat(500) }), { TRUST_PROXY_HEADERS: "1" }).length === 64);

// --- spoofed keys cannot raise the total: the global limit does not depend on the key
resetIngress();
let allowed = 0;
for (let i = 0; i < 1000; i++) if (!limited(`spoof-${i}`, 1_000_000)) allowed++;
check("sahte anahtarlarla toplam sınırlı (varsayılan 120)", allowed === 120, `izin verilen: ${allowed}`);

// --- per-client limit and window expiry
resetIngress();
let ok = 0;
for (let i = 0; i < 30; i++) if (!limited("one-client", 2_000_000)) ok++;
check("istemci başına dakikada 12", ok === 12, `izin verilen: ${ok}`);
check("pencere geçince yeniden izin", !limited("one-client", 2_000_000 + 61_000));

async function main() {
// --- body cap while reading
async function body(size: number, withLength: boolean) {
  const payload = "x".repeat(size);
  const headers = withLength ? { "content-length": String(size) } : undefined;
  return readBodyLimited(new Request("http://localhost/api/ask", { method: "POST", body: payload, headers }), 4096);
}
check("küçük gövde okunur", (await body(100, true))?.length === 100);
check("bildirilen boyut büyükse reddedilir", (await body(5000, true)) === null);
check("başlıksız büyük gövde okunurken kesilir", (await body(50_000, false)) === null);

// --- tool guard
const u = (name: string, args: Record<string, unknown>, text: string) => toolAllowed(name, args, text);
check("durum: PNR mesajda", u("get_flight_status", { pnr: "ANK123" }, "ANK123 uçuşum rötarlı mı?"));
check("durum: uydurma PNR reddedilir", !u("get_flight_status", { pnr: "ANK456" }, "ANK123 uçuşum rötarlı mı?"));
check("check-in: PNR + koltuk + istek", u("check_in", { pnr: "ANK456", seat: "12C" }, "ANK456 için 12C koltuğuna check-in yapar mısın?"));
check("check-in: koltuk mesajda yoksa reddedilir", !u("check_in", { pnr: "ANK123", seat: "1A" }, "ANK123 uçuş durumu nedir?"));
check("check-in: istek yoksa reddedilir", !u("check_in", { pnr: "ANK123", seat: "12C" }, "ANK123 rezervasyonumda 12C yazıyor mu, bilgi verir misin"));
check("check-in: geçersiz koltuk reddedilir", !u("check_in", { pnr: "ANK123", seat: "99Z" }, "ANK123 check-in 99Z"));

// --- seat state: repeated check-ins must not use up every seat
resetState();
for (let row = 1; row <= 30; row++) for (const col of "ABCDEF") runTool("check_in", { pnr: "ANK123", seat: `${row}${col}` });
const free = runTool("check_in", { pnr: "ANK456", seat: "5A" });
check("tekrarlı check-in koltukları tüketmez", free.ok === true, JSON.stringify(free));
resetState();

console.log(failures ? `\n${failures} hata` : "\nhepsi geçti");
process.exit(failures ? 1 : 0);
}
main();
