import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunEvalButton } from "@/components/run-eval-button";
import { readReport } from "@/lib/eval";

export default async function EvalPage() {
  await connection();
  const report = readReport();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Eval paneli</h1>
          <p className="text-sm text-muted-foreground">
            31 senaryo: cevaplanabilir, kaynakta yok, enjeksiyon, kişisel veri, aksiyon. Kontroller deterministik (anahtar kelime, atıf, giden istek).
          </p>
        </div>
        <RunEvalButton />
      </div>

      {!report && <p className="text-sm text-muted-foreground">Henüz sonuç yok. &quot;Eval&apos;i çalıştır&quot; düğmesine bas.</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Genel" value={`${report.passed}/${report.total}`} sub={`%${Math.round((report.passed / report.total) * 100)}`} />
            <Stat label="Gecikme p50 / p95" value={`${report.latencyP50} / ${report.latencyP95} ms`} />
            <Stat label="Toplam token" value={String(report.totalTokens)} />
            <Stat label="Model" value={report.model} sub={new Date(report.runAt).toLocaleString("tr-TR")} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(report.byCategory).map(([cat, v]) => (
              <Stat key={cat} label={cat} value={`${v.passed}/${v.total}`} bad={v.passed < v.total} />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {report.cases.map((c) => (
              <details key={c.id} className="rounded-lg border px-3 py-2 text-sm">
                <summary className="flex cursor-pointer items-center gap-2">
                  <Badge variant={c.pass ? "secondary" : "destructive"}>{c.pass ? "geçti" : "kaldı"}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                  <span className="truncate">{c.question}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.latencyMs} ms</span>
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  <ul className="text-xs">
                    {c.checks.map((k, i) => (
                      <li key={i} className={k.ok ? "text-muted-foreground" : "text-destructive"}>
                        {k.ok ? "✓" : "✗"} {k.name}
                        {k.detail ? ` — ${k.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                  {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs">{c.answer || "(cevap yok)"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.refusedEarly && <Badge variant="outline">LLM çağrılmadan reddedildi</Badge>}
                    {c.cited.map((d) => (
                      <Badge key={d} variant="secondary">kaynak: {d}</Badge>
                    ))}
                    {c.toolCalls.map((t, i) => (
                      <Badge key={i} variant="outline">araç: {t.name}</Badge>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-lg font-semibold ${bad ? "text-destructive" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
