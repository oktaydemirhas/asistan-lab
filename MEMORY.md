# MEMORY

## Kararlar
- **TypeScript, Python değil:** Python makinede kurulu değildi. Aynı mimari FastAPI'ye taşınabilir.
- **Gömme (embedding) yok, BM25 var:** 100 MB+ model indirmemek için. `lib/retriever.ts` arayüzü sabit, gömme eklemek kolay.
- **Kılıf = korpus + araçlar:** firmaya göre `data/corpus/*.md` ve `lib/tools.ts` değişir, çekirdek aynı kalır.

## Öğrenilenler (eval ile ölçüldü)
- **Parent-document retrieval:** İsabet alan belgenin tüm satırlarını bağlama koy (en fazla 4 belge). Fiyat/süre satırı sorunun kelimeleriyle eşleşmediği için tek satır getirmek cevabı kaçırıyordu.
- **Türkçe kök bulma:** 5 harfli ön ek "kedimi" ile "kedi"yi buluşturmadı. Hem 4 hem 5 harfli kök indeksleniyor.
- **Enjeksiyon:** "Masum soru + eklenmiş talimat" biçiminde yalnızca prompt kuralı güvenilmezdi (4 koşuda 3 kez sızdı). Çözüm yapısal: bilinen kalıba uyan cümleler modele gitmeden çıkarılıyor (`stripInjected`). Bilinmeyen kalıplar için model kuralı + eval hâlâ tek savunma; dolaylı enjeksiyon (zehirli yorum belgesi) modele bağlı.
- **LLM eval'i gürültülü:** tek koşuya güvenme. 31/31 tek seferde çıktı, tekrarlayınca inj-03 kaldı. Değişiklikten sonra en az 3 koşu.
- LLM'in erişilemediği (401) koşu sonuç olarak kaydedilmez (`runEval` hata fırlatır).

## Durum
- 31 senaryo, 3 ardışık koşuda 31/31 (deepseek-chat, p50 ~1.3 sn).
- Bilinen sınır: eval seti küçük ve yazarın kendi yazdığı; gerçek kullanıcı sorularında düşebilir. Senaryoyu çoğaltmak sıradaki iş.

## Holdout set and hybrid retrieval (2026-11-01)
- evals/holdout.json (30 cases, written after tuning, never used to adjust code). BM25 only: 25/30. Hybrid BM25 + multilingual-e5-small (RRF): 28/30. Original 31 cases stay 31/31.
- All 5 BM25 failures were lexical (stem mismatch "gecikti"/"gecikirse", synonyms "bavul", "puset", "evcil dostum"). Security categories passed in both runs.
- MIN_SIMILARITY 0.84 was chosen from the ORIGINAL cases only (answerable min 0.848, out-of-scope max 0.832). Margin is thin; the LLM [BILGI_YOK] marker is the backstop.
- Still failing: "puset" (retrieval ranks the wrong doc first) and "bavul" (gated before the LLM). Not patched on purpose: patching them would turn the holdout into a training set.
- First request loads the model (~12 s cold), later ones ~0.4 s. Model cache lives in .cache/models (gitignored). next.config needs serverExternalPackages for onnxruntime-node.

- 2026-11-10 review: a tool guard must check what the tool changes (the seat) and the user's intent, not only the id. Eval result files need the same masking as any other output. Forwarding headers are untrusted unless TRUST_PROXY_HEADERS=1.
