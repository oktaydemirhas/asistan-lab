# Asistan Lab

Kaynak gösteren, bilmediğinde reddeden, PNR ile işlem yapan ve ölçülen bir RAG asistanı.
Kurgusal havayolu ("Anka Hava Yolları"), sentetik veri: gerçek firma verisi yok.

## Neler var
- **Arama:** hibrit. Türkçe'ye uygun BM25 (aksan katlama + 5 harfli kök) ile yerel çok dilli gömme modeli (`multilingual-e5-small`, CPU) RRF ile birleştirilir (`lib/hybrid.ts`). Model ilk çalıştırmada ~120 MB indirilir, API anahtarı gerektirmez.
- **Kaynak ve reddetme:** cevap `[belge-id]` atıfı taşır; kaynakta yoksa `[BILGI_YOK]` ile reddeder. Aramada kapsama çok düşükse LLM hiç çağrılmaz.
- **Aksiyon:** `get_flight_status` ve `check_in` araçları (sahte arka ofis, PNR: ANK123, ANK456).
- **Koruma:** TCKN (sağlama toplamlı), IBAN, kart, telefon, e-posta LLM'e gitmeden maskelenir. Enjeksiyon kalıpları işaretlenir, model yine de test edilir.
- **Eval:** `evals/cases.json` içinde 31 senaryo; cevaplanabilir, kaynakta yok, enjeksiyon (dolaylı dahil), kişisel veri, aksiyon. Kontroller deterministik.

## Çalıştırma
```bash
cp .env.example .env.local   # LLM_API_KEY değerini doldur (OpenAI uyumlu, araç çağırmayı desteklemeli)
npm install
npm run dev                  # http://localhost:3000  (sohbet)  /eval (panel)
npx tsx scripts/run-eval.ts            # 31 senaryoluk geliştirme seti
npx tsx scripts/run-eval.ts --holdout  # ayarlamada kullanılmayan 30 senaryoluk set
npx tsx scripts/pii-check.ts           # PII uç durumları (LLM gerekmez)
```

Anahtar olmadan: `pii-check`, `guards-check` ve `retrieval-check` çalışır; sohbet ve eval için `LLM_API_KEY` gerekir (kendi anahtarını kullan, depoda anahtar yok). Windows PowerShell script engeli verirse `npx.cmd` kullan.

## Ölçümler (deepseek-chat)
| Set | BM25 | Hibrit |
|---|---|---|
| Geliştirme (31) | 31/31 | 31/31 |
| Holdout (30) | 25/30 | 28/30 |

Holdout, sonradan yazıldı ve kodu ayarlamak için kullanılmadı. Kalan hatalar: "puset", "bavul" gibi eş anlamlılar.

## Canlıya almadan önce (güvenlik incelemesinden)
- `POST /api/eval` ~31 ücretli LLM çağrısı yapar. Üretimde `EVAL_ADMIN_TOKEN` yoksa 404 verir, varsa `x-admin-token` ister ve tek seferde bir koşu çalışır. Canlıda eval sonucunu yerelde koşup statik göstermek daha güvenli.
- `/api/ask`: gövde 4 KB, soru 500 karakter, IP başına dakikada 12 istek (örnek belleği, sunucusuz ortamda yalnızca hız kesici). Asıl sınır için Cloudflare/Upstash kuralı ve sağlayıcıda aylık harcama limiti koy.
- Hatalar istemciye genel mesajla döner, ayrıntı sunucu günlüğüne yazılır. LLM isteği 20 sn'de zaman aşımına uğrar, `LLM_BASE_URL` https olmalı.
- Sistem prompt'undaki canary bir sır değil, alarm: cevapta görünürse cevap düşürülür.
- `check_in` yalnızca kullanıcının mesajında yazdığı PNR için çalışır. Rezervasyon durumu tüm ziyaretçiler için ortak ve bellekte; demo verisi kurgusaldır.
- `evals/cases.json` içindeki TCKN/IBAN/kart değerleri sentetik test değerleridir; sonuç dosyasında maskeli saklanır.

## Bilinen sınırlar
- Enjeksiyon savunması bilinen kalıpları yakalar (kara liste); yeni biçimler model kuralına kalır. Zehirli belge testi bilerek korpusta bırakıldı.
- Eş anlamlı sorgularda ("puset", "bavul") hibrit arama da hâlâ kaçırabiliyor. Anlamsal reddetme eşiği (0.84) dar bir marjla geliştirme setinden seçildi.
- İlk istekte gömme modeli yüklenir (~12 sn); canlıda açılışta ısıtmak gerekir.
- Eval setleri küçük ve yazarın kendi yazdığı; %100 sonuç genel başarı anlamına gelmez.
- PII: tam genişlik rakam, sıfır genişlikli karakter, sözcükle yazılmış telefon ve "(at)" e-posta yazımı yakalanmıyor.
