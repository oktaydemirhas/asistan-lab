"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RunEvalButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/eval", { method: "POST" });
      if (res.status === 404) {
        setError("Bu ortamda kapalı (yönetici token'ı gerekir).");
        return;
      }
      const json = await res.json();
      if (!res.ok) setError(json.error === "already_running" ? "Zaten çalışıyor." : "Eval çalıştırılamadı.");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={busy}>{busy ? "Çalışıyor… (1-2 dk)" : "Eval'i çalıştır"}</Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
