"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Source = { id: string; docId: string; title: string; text: string; score: number };
type Reply = {
  answer: string;
  refused: boolean;
  refusedEarly: boolean;
  cited: string[];
  sources: Source[];
  toolCalls: { name: string; args: Record<string, unknown>; result: Record<string, unknown> }[];
  flags: { injection: boolean; stripped: number; masked: string[]; coverage: number; similarity: number };
  llmCalls: number;
  latencyMs: number;
  usage: { total_tokens: number };
  error?: string;
};
type Turn = { question: string; reply?: Reply; error?: string };

const ERRORS: Record<string, string> = {
  upstream_error: "Asistana şu an ulaşılamıyor, biraz sonra tekrar dene.",
  rate_limited: "Çok fazla istek gönderdin, bir dakika bekle.",
  too_large: "Mesaj çok uzun.",
};

const SUGGESTIONS = [
  "Standart pakette check-in bagajı kaç kilo?",
  "ANK123 rezervasyonumun uçuş durumu nedir?",
  "ANK456 için 12C koltuğuna check-in yapar mısın?",
  "Kartım 4111 1111 1111 1111, taksit yapabilir miyim?",
  "Uçakta sigara içilebilir mi?",
];

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { question }]);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const json = await res.json();
      const message = ERRORS[json.error as string] ?? "Bir hata oluştu.";
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? (res.ok ? { question, reply: json } : { question, error: message }) : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { question, error: String(e) } : x)));
    } finally {
      setBusy(false);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">Anka Hava Yolları asistanı</h1>
        <p className="text-sm text-muted-foreground">
          Kurgusal örnek firma, sentetik veri. Cevaplar kaynak gösterir, bilmediğinde reddeder, PNR ile işlem yapar ve kişisel veriyi LLM&apos;e gitmeden maskeler.
        </p>
      </div>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{t.question}</div>
            {!t.reply && !t.error && <div className="text-sm text-muted-foreground">Düşünüyor…</div>}
            {t.error && <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{t.error}</div>}
            {t.reply && <ReplyView r={t.reply} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-4 flex gap-2 bg-background pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Bir soru sor veya PNR ile işlem iste (ANK123, ANK456)" disabled={busy} />
        <Button type="submit" disabled={busy || !input.trim()}>Gönder</Button>
      </form>
    </div>
  );
}

function ReplyView({ r }: { r: Reply }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-3 py-3 text-sm">
      <p className="whitespace-pre-wrap leading-relaxed">{r.answer}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {r.refused && <Badge variant="outline">{r.refusedEarly ? "reddedildi (LLM çağrılmadı)" : "reddedildi"}</Badge>}
        {r.cited.map((c) => (
          <Badge key={c} variant="secondary">kaynak: {c}</Badge>
        ))}
        {r.flags.masked.map((m, i) => (
          <Badge key={i} variant="outline">maskelendi: {m}</Badge>
        ))}
        {r.flags.injection && (
          <Badge variant="destructive">
            enjeksiyon şüphesi{r.flags.stripped > 0 ? ` (${r.flags.stripped} cümle çıkarıldı)` : ""}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {r.latencyMs} ms · {r.llmCalls} LLM çağrısı · {r.usage.total_tokens} token
        </span>
      </div>

      {r.toolCalls.length > 0 && (
        <details open className="rounded-md bg-muted/50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">Araç çağrıları ({r.toolCalls.length})</summary>
          <div className="mt-2 flex flex-col gap-2 font-mono text-xs">
            {r.toolCalls.map((c, i) => (
              <div key={i}>
                <div>{c.name}({JSON.stringify(c.args)})</div>
                <div className="text-muted-foreground">→ {JSON.stringify(c.result)}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {r.sources.length > 0 && (
        <details className="rounded-md bg-muted/50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">Getirilen parçalar ({r.sources.length}, kelime kapsaması {r.flags.coverage}, anlamsal benzerlik {r.flags.similarity})</summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            {r.sources.map((s) => (
              <li key={s.id} className={r.cited.includes(s.docId) ? "font-medium" : "text-muted-foreground"}>
                <span className="font-mono">[{s.docId}] {s.score}</span> {s.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
