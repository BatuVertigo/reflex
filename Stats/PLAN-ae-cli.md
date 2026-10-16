# PLAN — Stats'ın TE sorgu katmanını ae-cli'ye taşımak mı?

**Karar (Batuhan, 2026-10-16): Seçenek A — MCP yolunda kalındı.** Bu dosya karar notu; kod değişmedi.
Aşağıdaki "Yeniden değerlendirme tetikleyicileri" gerçekleşirse Seçenek B'nin adımları hazır.
Araştırma 2026-10-16'da yapıldı; ae-cli 6.0.46 (Batuhan'ın Mac'i ve mini aynı sürüm), küme 6.0.
Kaynaklar: `ae-analysis` skill (`references/adhoc_run.md`, `adhoc_export.md`, `analysis_data_retrieval.md`,
`ai_models.md` SQL bölümü), `ae-cli --help` çıktıları, ae-cli paket kaynağı (`dist/`), canlı denemeler (proje 4,
`SELECT 1` / `UNNEST(sequence)` sorguları — hiçbir gerçek oyuncu/maç ID'si kullanılmadı).

## Tek cümle

`stats_polygun.py` ve `stats_cs.py` içindeki `post / initialize / cancel / run_sql` (TE MCP HTTP ucuna JSON-RPC
`query_adhoc`) yerine `ae-cli` alt süreci koymak mümkün ama bugün **CS için imkânsız** (hesap proje 7'yi görmüyor),
PA için **daha yavaş ve daha kırılgan**; kazanç yalnız `.env`'den bir token eksilmesi. **Öneri: kal.**

## Öneri: A — kal (şimdilik)

Gerekçe, önem sırasıyla:

1. **CS kapalı.** Hem Batuhan'ın Mac'indeki hem mini'deki ae-cli hesabı yalnız proje 4'ü (Polygun Arena) görüyor;
   proje 7'de `analysis.adhoc.run` → `PROJECT_PERMISSION_DENIED`. MCP token'ı (paylaşılan "Gizem" hesabı) ikisini de
   görüyor. `[KNOWN]` — iki makinede de `project info list` + `SELECT 1` ile denendi.
2. **Hız kaybı.** Sorgu başına ≈ +0,45 s (node başlatma + CLI). Rapor başına 6–10 sorgu, 2'şerli → +1,5…+2,5 s.
   Bugünkü raporlar 2–7 s; yani %25–40 yavaşlama. `[KNOWN]` ölçüm aşağıda.
3. **Stats'a işlevsel kazanç yok.** Stats sabit SQL atar; ae-cli'nin AI derleyicisi, metadata çözümü, drilldown'ı
   kullanılmaz. Kazanılan tek şey token yönetimi.
4. **Yeni kırılma noktaları:** node + ae-cli sürümü mini'de repo dışında yaşar (küme yükselince `compat-check`
   CLI güncellemesi isteyebilir); ae-cli'nin kendi log dosyası SQL'i diske yazar (aşağıda, çözümü var ama
   belgelenmiş komutu kullanamıyoruz); eşzamanlı sorgu için `--timeout-seconds` üst sınırı 180 s (bugün 600 s);
   başarısızlıkta çağıran taraftan iptal yok.

**Yeniden değerlendirme tetikleyicileri:** (a) TE, MCP HTTP ucunu / `mcp-token`'ı emekliye ayırırsa; (b) paylaşılan
TE hesabı mini'de ae-cli'ye proje 4 + 7 ile bağlanırsa ve Batuhan yavaşlamayı kabul ederse → B'ye geçilir.

## Soru-cevap (görevdeki üç soru)

### (1) ae-cli ile ad-hoc SQL nasıl atılır

**Belgelenmiş komut** (`ae-analysis/references/adhoc_run.md`):

```bash
ae-cli --no-update-check analysis adhoc run --project-id 4 --model-type sql \
  --definition '{"sql":"select ... where \"$part_date\" between ... "}' \
  --preview-rows 20000 --timeout-seconds 180 --use-cache false --request-id cli_<32 hex>
```

- `--definition` **yalnız satır içi JSON** alır; `@dosya` ve `@-`/stdin denendi, ikisi de `Invalid JSON for --definition`.
  Bu yüzden SQL argv'de gider ve ae-cli bunu **`~/.ae-cli/log/YYYYMMDD_info.log`'a tam metin yazar**
  (`CMD analysis adhoc run --projectId="4" ... --definition="<tüm SQL>"`; bugünkü logda 21.150 karakterlik satırlar
  var). Stats'ın SQL'i PlayFab ID / match_id içerir → **"ID loglanmaz" kuralını bozar.** Log'u kapatan bir
  ortam değişkeni yok (kaynakta `AE_CLI_NO_UPDATE_CHECK`, `AE_CLI_NO_COMPAT_CHECK` var; log için yok).
- **Çözüm, L3 yolu:** `ae-cli --no-update-check capability run analysis.adhoc.run --input -` ile gövde stdin'den:

  ```json
  {"project_id":4,"model_type":"sql","definition":{"sql":"..."},"preview_rows":20000,
   "timeout_seconds":180,"use_cache":false,"request_id":"cli_<32 hex>"}
  ```

  Denendi: aynı zarf döner, `request_id` aynen geri gelir, log'a yalnız "Using persisted CLI token" satırı düşer,
  SQL diske yazılmaz. `*_error.log`'a hata mesajı (request_id, tablo adı) düşer; gördüğüm örneklerde SQL yok,
  ama TE'nin hata mesajının SQL parçası geri yansıtmayacağı garanti değil `[INDETERMINATE]`.
- **Kimlik:** `~/.ae-cli/config.json` yalnız host (`activeHost: https://analytics.vertigogames.co`); token
  `~/.ae-cli/secure-tokens/*.enc.json` içinde şifreli. Giriş device-code akışı: `ae-cli auth login --no-browser`
  (headless için URL basar, tarayıcıda bir insan onaylar). CLI token'ı her yerel günün ilk komutunda sunucuda
  yenilenir (`cli-token-renew.json` → `{"date": "..."}`; kaynak: `chunk-J2DEBMRF.js`, `/v1/ta/cli/token/renew`);
  `auth status`: "access token auto-slides on use server-side; re-login only if a command returns an auth error".
  Uzun süre kullanılmazsa ne zaman düştüğü belgelenmemiş `[INDETERMINATE]`. Mini: `/opt/homebrew/bin/ae-cli`
  6.0.46, node v26.11.1, `vertigoproduct` için `~/.ae-cli` var, `auth status` → authenticated, proje listesi: **yalnız 4**.
  launchd plist'inin PATH'i `/opt/homebrew/bin` içeriyor; alt süreç bulur.
- **Çıktı biçimi:** başarıda stdout JSON, exit 0:
  `{"ok":true,"data":{"title":[...],"rows":[[...]],"returned_rows":N,"has_more":bool,"request_id":"cli_…",…},"meta":{…}}`.
  Hatada **stdout boş, exit 1, zarf stderr'de**: önce `[ae-cli] dispatching capability=… request_id=…` satırı,
  sonra `{"ok":false,"error":{"type","code","message"},"meta":{…}}`. Görülen kodlar: `QUERY_FAILED`,
  `QUERY_TIMEOUT`, `CONCURRENCY_LIMIT_EXCEEDED`, `PROJECT_PERMISSION_DENIED`; gateway 504'ü mesaj olarak gelir
  (`Capability gateway HTTP error: 504 Gateway Timeout`, 2026-10-15 logu).
- **Satır limiti:** sunucu SQL modelinde senkron sonucu **20.000'de keser**, `--preview-rows` 30000 ya da boş olsa da
  20.000 döner ve `has_more: true` olur. Bu, bugünkü `len(rows) >= ROW_LIMIT` kontrolünün yerine geçer; SQL sonuna
  ` limit N` eklemek gereksizleşir. Daha fazlası için `adhoc export` (asenkron, `run_id`, `--output dosya`) var;
  Stats'ın "kesildiyse 502" kuralıyla uyumsuz, gerekmez.
- **Zaman aşımı:** `timeout_seconds` varsayılan 120, **üst sınır 180** (bugün `timeoutMinutes: 10`). Süre dolunca
  CLI sunucuya iptal gönderiyor (`meta.cancel_attempted: true, cancel_status: submitted`, denendi). Mini'deki
  `stats.log`'da görülen en uzun arama 6,9 s; PLAN notlarında 13 s'lik takılma var → 180 s yeter, pay azalır.
- **İptal:** yalnız `analysis query cancel --run-id` (export işleri için). Senkron `run`'ı çağıran taraf iptal
  edemez; CLI yalnız kendi zaman aşımında iptal eder. Stats kapanırken / sayfa kapanınca çalışan sorgu TE'de sürer.
  Bugünkü `cancel(request_id)` davranışı kaybolur (etkisi küçük: TE 10 dk'da zaten keser).
- **`$part_date` kuralı:** capability gateway, olay tablosunda `"$part_date"` koşulu olmayan SQL'i reddeder
  (`When querying the event table [v_event_4], please bring the date partition field…`). MCP yolu kabul ediyordu.
  Stats'ta tek istisna **maç bulucu sorgusu** (`match_detail` ilk sorgu, her iki dosyada `select min("$part_date")…
  where "$part_event" in … and match_id = …`, bilerek tarihsiz). Geçişte buna bir taban eklenmeli
  (`"$part_date" >= '<oyunun ilk günü>'`); proje 4'te 2020-01-01 tabanı + yok bir ID ile 4,55 s sürdü. Diğer tüm
  sorgular `bounds()` / `days` üzerinden zaten `$part_date` taşıyor (grep ile iki dosyada doğrulandı).

### (2) Alt süreç gecikmesi ve eşzamanlılık

Ölçüm (Batuhan'ın Mac'i, ofis ağı, `SELECT 1`, `use_cache false`):

| Yol | Sorgu başına |
|---|---|
| Bugünkü MCP (`urllib`, oturum açık) | 0,30–0,39 s |
| `ae-cli analysis adhoc run` | 0,73–0,90 s |
| `ae-cli capability run … --input -` | 1,3 s (tek örnek) |
| yalnız node + CLI başlatma (`ae-cli --version`) | 0,33 s |

`--no-update-check` fark yaratmadı (0,78 vs 0,80 s). Rapor başına: kariyer 6 sorgu, dönem 8 (maçsız 4), maç ≈ 10,
isim arama 1; 2'şerli koşuyla **+1,5…+2,5 s / rapor** `[INFERRED]`.

Eşzamanlılık: aynı anda 5 farklı ağır sorgu → 4 çalıştı, 1 `CONCURRENCY_LIMIT_EXCEEDED`; 3 paralel sorunsuz.
Yani bu hesabın sınırı bugün ≥ 4 (PLAN'daki "2" eski ölçüm ya da başka hesap). Stats'ın `te_lock` + 2 işçilik
havuzu olduğu gibi kalır; her ae-cli çağrısı bağımsız süreçtir, aralarında durum yok. **Dikkat:** ae-cli hesabı
MCP token'ının hesabı değil; Batuhan'ın Mac'indeki hesapla mini'deki aynıysa, Batuhan'ın kendi ae-cli analizleri
Stats'la aynı eşzamanlılık havuzunu paylaşır `[INFERRED]` (hesap adı CLI'dan okunamadı).

### (3) Kazanç / kayıp

Kazanç:
- `.env`'den `TE_MCP_URL` + `TE_MCP_TOKEN` çıkar; token ae-cli'nin şifreli deposunda, günlük yenilenir.
- Reflex'te tek TE istemci yolu (rutinler zaten ae-cli).
- Sunucu tarafı `has_more` kesilme sinyali, yapısal hata kodları (`CONCURRENCY_LIMIT_EXCEEDED` yerine
  "concurrency" metin araması yok), zaman aşımında otomatik iptal.

Kayıp / maliyet:
- CS imkânsız (hesap izni) — düzeltilene kadar geçiş yarım kalır.
- %25–40 daha yavaş rapor.
- 180 s tavan; çağıran taraftan iptal yok.
- Belgelenmiş `analysis adhoc run` kullanılamaz (SQL log'a düşer); L3 `capability run` yoluna bağımlı kalınır.
- Maç bulucu SQL'ine yapay tarih tabanı.
- Node + ae-cli sürümü mini'de repo dışında; küme yükselince CLI güncellemesi Stats'ı durdurabilir
  (`compat-check.json`: localVersion = expectedVersion şartı). MCP yolu böyle bir eşleşme istemiyor.
- Token ölürse mini'de tarayıcılı device-code girişi (ssh + URL'yi birinin açması); bugün `.env`'e token yapıştırma.

## Seçenek B — geç (Batuhan isterse)

Tier: **T2** (iki oyunun tüm aramaları, üretim mini, kimlik değişimi).

**Ön koşul (kodsuz):** mini'de ae-cli hesabı proje 4 **ve** 7'yi görmeli. Ya paylaşılan hesapla giriş
(`ssh vertigoproduct@192.168.30.124`, `ae-cli auth logout` → `ae-cli auth login --no-browser`, URL'yi hesabın sahibi
tarayıcıda onaylar) ya da mevcut hesaba proje 7 yetkisi. Doğrulama: `ae-cli project info list` 4 ve 7'yi listeler;
iki projede `capability run analysis.adhoc.run` ile `SELECT 1` → `ok: true`.

Adımlar (her biri doğrulamasıyla):

1. **`stats_polygun.py` + `stats_cs.py` sorgu katmanı.** `post / initialize / cancel` silinir; `run_sql(name, sql,
   limit)` şunu yapar: `subprocess.run([AE_CLI, "--no-update-check", "capability", "run", "analysis.adhoc.run",
   "--input", "-"], input=<json>, capture_output=True, timeout=200)`; gövde: `project_id`, `model_type: "sql"`,
   `definition.sql`, `preview_rows: limit or ROW_LIMIT`, `timeout_seconds: 180`, `use_cache: false`,
   `request_id: "cli_" + uuid4().hex`. rc 0 → stdout JSON `data.rows`; `has_more` ve `limit is None` → bugünkü
   "cut off" 502. rc ≠ 0 → stderr'deki ilk `{`'den JSON: `QUERY_TIMEOUT` ya da mesajda "504" → 504;
   `CONCURRENCY_LIMIT_EXCEEDED` → 5 deneme; `TRANSIENT_REASONS` → 2 deneme; `subprocess.TimeoutExpired` /
   JSON çözülmezse → 504; diğerleri 502 + `short_reason`. SQL sonundaki ` limit {row_limit}` eki kalkar.
   `te_lock`, `run_all` (2 işçi), `stream_job`, loglama olduğu gibi kalır. `AE_CLI = os.environ.get("AE_CLI_BIN",
   "ae-cli")`. İki dosya bugün kopya; ikisi de aynı değişikliği alır (mevcut yapı korunur).
   *Doğrula:* test portunda `curl -N` ile isim arama, kariyer, dönem, maç; satır sayıları eski sunucuyla aynı;
   `STATS_*_ROW_LIMIT=100` ile 502 "cut off"; iki eşzamanlı istek sırayla; konsolda ID yok.
2. **Maç bulucu.** Her iki `match_detail`'in ilk sorgusuna `"$part_date" >= '<oyun tabanı>'` eklenir; taban Batuhan'dan
   (PA / CS ilk veri günü) — bilinmiyorsa `'2020-01-01'`. *Doğrula:* bilinen bir maç ID'si eski/yeni aynı sonucu
   verir; yok ID 404.
3. **`stats.py` açılışı.** `TE_URL/TE_TOKEN` kontrolü ve `initialize()` çağrıları yerine iki projede `SELECT 1`;
   biri `ok: false` ise `SystemExit` açık mesajla (deploy.sh'ın 30 s'lik port beklemesi bunu yakalar).
4. **Belgeler.** `.env.example` ve README'den `TE_MCP_*` çıkar; README Kurulum'a "mini'de `ae-cli auth login`" notu;
   `Stats/PLAN.md` + iki PLAN'a bir satır.
5. **Deploy.** `main`'e tek commit; `bash launchd/deploy.sh stats`. *Doğrula:* `http://productmacmini.local:3800` her
   iki oyunda arama; mini `~/Library/Logs/Reflex/stats.log`'da ID yok; mini `~/.ae-cli/log/*_info.log`'da SQL yok;
   `*_error.log` gözden geçirilir.

**Blast radius.** Kapsam: iki oyunun TE sorgu katmanı, `stats.py` açılış kontrolü, `.env.example`/README.
Etki: tüm Stats aramaları; ae-cli token'ı düşerse Stats düşer (bugün MCP token'ı iptal edilirse aynı); CLI sürüm
zorlaması Stats'ı durdurabilir. Geri alma: `git revert <commit>` + `bash launchd/deploy.sh stats`; `.env`'deki
`TE_MCP_*` bir hafta silinmez, böylece revert anında çalışır.

## Batuhan'a açık sorular

1. Mini'deki ae-cli hangi hesapla çalışmalı (paylaşılan TE hesabı mı, ürün hesabı mı) ve proje 7 yetkisi alınabilir mi?
   Alınamıyorsa B düşer.
2. Rapor başına +1,5…+2,5 s kabul mü?
3. B seçilirse maç bulucu için PA ve CS tarih tabanı nedir?

## Değişmeyenler (her iki seçenekte)

İlerleme akışı (`stream_job` NDJSON satırları), tek TE kilidi, 2'şerli koşu, 6 denemeli yeniden deneme mantığı,
20.000 satır kesilme kuralı, konsola/`stats.log`'a ID yazılmaması, deploy yolu (`bash launchd/deploy.sh stats`).
