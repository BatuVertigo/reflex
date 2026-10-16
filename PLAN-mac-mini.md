# Reflex → Mac mini taşıma planı

Durum: ONAYLANDI (Batuhan, 2026-10-16). Adım 1-3 tamam (commit `199e3b7`, branch `mac-mini`). Adım 4-5 büyük ölçüde
tamam (16 Eki): mini'de `~/GitHub/reflex` (branch `mac-mini`, GitHub'a push yok; branch SSH ile itildi), `.venv`,
`~/.claude-reflex` + mempalace-shared kaydı (bağlandı), deploy key `~/.ssh/reflex_deploy` (+ `github.com-reflex` alias,
push URL ayarlı), `.env` (bot token boş), `reflex-stats` + `reflex-ops` ajanları çalışıyor; `http://productmacmini.local:3800`
ve `:3900` Batuhan'ın Mac'inden açılıyor. Mini bulguları: FileVault kapalı, uyku zaten 0 (AI Tester kurulumu), 3800/3900
boştu, `claude` CLI 2.1.299 ve mempalace-mcp zaten kuruluydu, otomatik giriş KAPALI (Batuhan açacak).
Plan sapması: eski Mac'teki stats.py geçiş gününe kadar açık kaldı (Slack kısayolu hâlâ eski app.py'den eski IP'yi veriyor).
Adım 4-5 TAMAM (16 Eki). **Adım 6-7 TAMAM (16 Eki 14:20-14:35):** eski Mac'te app.py/stats.py kapandı, 3 scheduled task
disable; `mac-mini` → `main` ff-merge + push; mini `main`'de, 6 ajan yüklü. Slack testleri geçti (Stats linki, Bug Details,
Task Move 2/2; dashboard'da işler göründü). Routine'ler launchd'den koştu: release-summary exit 0 + push ok (commit
`4b8963c`), bug-watcher dry-run exit 0 (37 sn, mantıklı kararlar), skill-catalog exit 0 ama Slack canvas güncellemesi
`canvas_not_found` (bot Slack kullanıcısının canvas'ta düzenleme yetkisi yok → Batuhan canvas'ı Reflex kullanıcısıyla
"can edit" paylaşacak; state dosyası bilerek yazılmadı, sonraki run tekrar dener). Karar (Batuhan): VertigoAI'daki
`docs/SKILL_CATALOG.md`'yi de `run-routine.sh` AITesterVertigo ile commit + push eder (açık soru 3 kapandı).
Bug Watcher dry-run `false` yapıldı. Eski Mac: `com.vertigo.bugwatcher-awake` kaldırıldı, worktree + `mac-mini` branch
silindi; `sudo pmset repeat cancel` Batuhan'da. Skill-catalog 2. koşu (14:35, canvas AITester Slack kullanıcısıyla "can edit" paylaşıldıktan sonra): yine
`canvas_not_found` (okuma çalışıyor; section id'lerin `temp:C:` öneki normal, Batuhan'ın okumasında da aynı). VertigoAI
commit'i oldu ama push "fetch first" ile düştü → `run-routine.sh` artık push'tan önce `pull --rebase --autostash` yapar ve
push hatasını run dosyasına (`push_error`) yazar; dashboard gösterir. Katalog metni kararı (Batuhan): dosya kaynak, canvas
ezilir (prompt'un mevcut mantığı). Açık: canvas erişimi — Batuhan Slack'te canvas → Share'de AITester'ın "Can edit"
olduğunu ve canvas bir kanala bağlıysa AITester'ın o kanalda üye olduğunu doğrulayacak; yarın 11:00 koşusu tekrar dener.
Açık: DHCP rezervasyonu (IT);
pins'e `/releases/*` linkleri; eski scheduled task'lar 1 hafta sonra silinir.

Routine modelleri (benim kararım, `launchd/run-routine.sh`): bug-watcher ve release-summary `opus`, skill-catalog `sonnet`.

## Görev

Reflex'in tüm parçalarını (app.py, Stats/stats.py, üç Claude routine) Batuhan'ın Mac'inden ofisteki paylaşımlı Mac
mini'ye taşı; orada 7/24, elle terminal açmadan, launchd altında koşsun. Logları dosyaya yaz, aktif işleri göster,
tek bir ops dashboard'u aç, Release Summary tablolarını Slack canvas yerine web sayfası olarak yayınla.

## Kararlar

| Konu | Karar |
|------|-------|
| Hedef makine | Mac mini, kullanıcı `vertigoproduct` (uid 501), HOME `/Users/vertigoproduct`, IP `192.168.30.124` (DHCP), Bonjour `productmacmini.local`. Makine AI Tester developer'ıyla **aynı kullanıcı** altında paylaşımlı. |
| Ayrım | Yeni macOS kullanıcısı yok. Reflex'in **tüm** `claude` çağrıları `CLAUDE_CONFIG_DIR=/Users/vertigoproduct/.claude-reflex` ile koşar (kendi login, ayarlar, pluginler, MCP). Diğer developer'ın `~/.claude`'una dokunulmaz. app.py'nin `.claude-bot` izolasyonu zaten var, aynı kalır. Kabul edilen eksi: `.env` sırlarını aynı kullanıcı okuyabilir. |
| Erişim | SSH + Ekran Paylaşımı. Batuhan'ın `~/.ssh/id_ed25519.pub` anahtarı mini'ye eklenir (şu an yetkili değil; `ssh-copy-id`'yi parola ile Batuhan çalıştırır). |
| Claude hesabı | Ayrı bot hesabı (Max). Slack connector'ı **bot hesabının kendi Slack kullanıcısıyla** zaten bağlı. Asana connector'ı: bot hesabında bağlı olduğu `[ASSUMED]`; adım 4'te doğrulanır. `ASANA_PAT` şimdilik Batuhan'ınki; bot'a Asana hesabı açılınca değişir. |
| Routine motoru | Headless CLI: launchd takvim ajanı → `run-routine.sh` → `claude -p` + prompt dosyası. Spike doğrulandı (2026-10-16): headless `claude -p` claude.ai connector'larını (Slack, Asana), mempalace'i, Artifact araçlarını görüyor; gerçek `slack_search_channels` çağrısı başarılı. |
| Kod dağıtımı | Repo **git** (`origin github.com/BatuVertigo/reflex`). Mini'ye `git clone`, güncelleme `git pull`. rsync yok. |
| Routine çıktıları | Her routine run'ından sonra `run-routine.sh` o routine'in **kendi çıktı dosyalarını** commit + push eder (Release Summary: iki md; Skill Catalog: `skill_catalog_state.json`). Push kimliği **AITesterVertigo** GitHub hesabı: repoya write collaborator (Batuhan ekledi, 16 Eki), mini'de `gh auth login` yapıldı, `gh auth setup-git` git'in credential helper'ı. Token macOS keychain'de → sadece GUI oturumunda (launchd gui domain, otomatik giriş) çalışır; SSH oturumunda keychain kilitli ("User interaction is not allowed"). Yedek: `gh auth login --insecure-storage` (token dosyada). Commit'ler AITesterVertigo adına. Deploy key yolu kaldırıldı. Prompt'lar git'e dokunmaz; iş deterministik, script'te. |
| Dashboard | Tek sayfa, ayrı süreç `Ops/ops.py`, port 3900. |
| Release Summary yayını | `stats.py` 3800 portunda `/releases/pa/` ve `/releases/cs/`. Slack canvas aynalaması **hemen kaldırılır**; canvas'lara "Güncel tablo: <link>" notu düşülür; pins'e linki Batuhan ekler. mempalace aynalaması kalır. |
| Adres | Slack Stats linki `http://productmacmini.local:3800` (+ IP ikinci satır). IT'den DHCP rezervasyonu istenir. |
| Geliştirme yeri | Değişiklikler bu Mac'te `mac-mini` branch'inde, **git worktree**'de yapılır. Ana çalışma ağacı olduğu gibi kalır; eski Mac'teki app.py ve scheduled task'lar geçiş gününe kadar bozulmaz. Merge tek seferde, adım 6'da. |

## Tasarım

### Süreçler (launchd, `gui/501`, kullanıcı `vertigoproduct`)

| Label | Ne | Port | Log |
|-------|----|------|-----|
| `com.vertigo.reflex-app` | `python3 app.py` (Slack Socket Mode), KeepAlive | — | `~/Library/Logs/Reflex/app.log` |
| `com.vertigo.reflex-stats` | `python3 Stats/stats.py`, KeepAlive | 3800 | `~/Library/Logs/Reflex/stats.log` |
| `com.vertigo.reflex-ops` | `python3 Ops/ops.py`, KeepAlive | 3900 | `~/Library/Logs/Reflex/ops.log` |
| `com.vertigo.reflex-bug-watcher` | `run-routine.sh bug-watcher`, pzt–cum 08:00 | — | `~/Library/Logs/Reflex/routines/bug-watcher/<tarih-saat>.json` |
| `com.vertigo.reflex-release-summary` | `run-routine.sh release-summary`, her gün 08:00/14:00/20:00 | — | `.../routines/release-summary/...` |
| `com.vertigo.reflex-skill-catalog` | `run-routine.sh skill-catalog`, her gün 11:00 | — | `.../routines/skill-catalog/...` |

- Plist'ler repoda `launchd/`. `launchd/install.sh` hepsini yükler (idempotent: `bootout` sonra `bootstrap`);
  `install.sh --uninstall` söker. Plist'ler `CLAUDE_CONFIG_DIR` ve `REFLEX_LOG_DIR` ortam değişkenlerini taşır.
- `launchd/run-routine.sh <ad>`: (1) `claude -p --output-format json --model <model> --permission-mode
  bypassPermissions --no-session-persistence "Read the file and follow all the instructions exactly: <prompt yolu>"`,
  çıktıyı run log'una yazar; (2) exit 0 ve routine'in çıktı dosyaları değiştiyse `git add <o dosyalar> && git
  commit -m "<routine>: <tarih>" && git push`; (3) push hata verirse log'a yazar, run başarılı sayılır (içerik
  mini'de durur, sonraki run tekrar dener).
- `bypassPermissions`: bugünkü desktop scheduled task'lar da izin sormadan koşuyor; risk aynı (Slack içeriğinden
  prompt injection → Bash). Sıkı `--allowedTools` listesi "Sonra"da.
- Portlar 3800/3900 mini'de boş mu, kurulumdan önce `lsof` ile bakılır (AI Tester'ın kendi dashboard'u var;
  çakışırsa ops 3901'e kayar, 3800 sabit).

### Prompt dosyaları (üçü de)

- Mutlak `/Users/vertigo/Desktop/Code/Reflex/reflex/...` yolları kaldırılır; prompt "bu dosyanın bulunduğu klasör"
  üzerinden konuşur (headless çağrı prompt'un mutlak yolunu zaten veriyor). Böylece aynı prompt iki makinede de
  çalışır. Skill Catalog'daki VertigoAI yolu `~/GitHub/VertigoAI` olur (`~` = o makinedeki HOME).
- Release Summary: "Slack canvas aynalama" bölümü silinir; md değiştiyse yapılacaklar listesinden canvas düşer.
- Bug Watcher: geçiş testinde dry-run `true`, doğrulama sonrası `false`.
- Prompt'lar git komutu çalıştırmaz (Skill Catalog'daki "sadece pull" kuralı kalır).

### Mini makine ayarları (bir kez, Batuhan ekranda)

- Uyku kapalı (Enerji → "Prevent automatic sleeping" veya `sudo pmset -a sleep 0`). Eski Mac'teki `pmset repeat` +
  `com.vertigo.bugwatcher-awake` hack'i taşınmaz, adım 9'da kaldırılır.
- Otomatik giriş `vertigoproduct` için açık (LaunchAgent'lar oturum olmadan başlamaz). FileVault mini'de kontrol
  edilir (`fdesetup status`); açıksa otomatik giriş olmaz → ayrı karar.
- Diğer developer'a haber: uyku kapalı, 3 servis + 3 zamanlayıcı, portlar, `~/.claude-reflex` klasörü.

### Mini kurulumu (adım 4 detayı)

- `python3 --version` ≥ 3.9 (bu Mac'te 3.9 ile çalışıyor; mini'de yoksa Xcode Command Line Tools veya Homebrew).
  `pip install -r requirements.txt`.
- `claude` CLI kurulumu; `CLAUDE_CONFIG_DIR=~/.claude-reflex claude login` (bot hesabı); `claude setup-token` →
  `.env` `CLAUDE_CODE_OAUTH_TOKEN`.
- mempalace-shared: MCP kaydı `~/.claude-reflex` içinde, `--palace /Users/vertigo/.mempalace-shared` (**tam bu yol**:
  pgvector tablo adı `sha256(palace yolu)[:16]`, ekip havuzu bu yoldan açıldı; mini'de `/Users/vertigo/` klasörü
  vertigo-setup ile zaten var). DSN/namespace env'leri mini'deki mevcut kayıttan alındı. Doğrulandı: 163 drawer,
  `cs-release-summary` odası okunuyor (16 Eki).
- **Claude kimliği iki ayrı yol:** claude.ai connector'ları (Slack, Asana) ve Artifact SADECE `claude login` oturumuyla
  (keychain, GUI oturumu = launchd gui domain) görünür; `CLAUDE_CODE_OAUTH_TOKEN` ile `claude -p` çalışır ama
  connector'sız. Bu yüzden `run-routine.sh` `.env`'i source ETMEZ, token'ı almaz; app.py ise token'la çalışır (connector
  gerekmez). SSH oturumunda keychain kilitli → SSH'tan routine testi connector göremez, test launchd üzerinden yapılır
  (`launchctl kickstart`). Doğrulandı 16 Eki: launchd'den koşan spike Slack `#reflex` ve Asana `get_me`'yi gördü.
  Artifact aracı headless'ta yok (gerekmiyor).
- Skill Catalog için `~/.claude-reflex`'e manifestteki 5 marketplace eklendi (vertigo: yerel klon `~/GitHub/VertigoAI`
  üzerinden) ve 7 plugin kuruldu, sonra hepsi **disable** edildi: dosyalar ve `installed_plugins.json` sürümleri
  katalog için yerinde, ama hook'ları (caveman, superpowers…) routine oturumlarına karışmaz.
- VertigoAI klonu `~/GitHub/VertigoAI` (mini'de zaten var) + prompt'un istediği pluginler `CLAUDE_CONFIG_DIR` altında kurulu.
- Reflex deploy key: mini'de `ssh-keygen` → public key GitHub'da repoya "write" deploy key; `git remote` SSH URL.
- `.env` sıfırdan yazılır (geçersiz shell satırları temizlenir): Slack token'ları, `ASANA_PAT`, TE token'ları,
  `CLAUDE_CODE_OAUTH_TOKEN`, `STATS_URL`, `REFLEX_LOG_DIR`, `CLAUDE_FOLDER`.

### app.py değişiklikleri

- Log: stdout'a ek `REFLEX_LOG_DIR/app.log` (`RotatingFileHandler`, 5 MB × 5).
- İş kaydı `jobs.json` (ortak yardımcı `reflex_jobs.py`): her Bug Details, Task Move, Version Check çağrısı bir iş:
  `{id, feature, user, started, updated, status: running|finished|failed, progress, detail}`. Task Move her task
  sonrası `progress` günceller ("7/23"). Atomik yazım (tmp + rename), son 500 iş tutulur. Dashboard "aktif istek
  var mı" ve kullanım sıklığını buradan okur.
- Stats kısayolu: `STATS_URL` + anlık IP ikinci satırda ("Windows'ta ad açılmazsa: http://<ip>:3800").

### stats.py değişiklikleri

- Her API çağrısı için iş kaydı (başladı/bitti, süre). Loga ve işe **PlayFab ID / match_id yazılmaz** (README
  kuralı); sadece oyun + sorgu tipi + süre.
- `/releases/pa/`, `/releases/cs/`: iki md'yi her istekte okuyup `markdown` paketiyle (`tables` eklentisi) HTML'e
  çevirir; Stats'ın sayfa stiliyle sunar; ana sayfaya iki link. `Cache-Control: no-store`.
- Yeni bağımlılık: `markdown` (saf Python, BSD, bakımı aktif) → `requirements.txt`.

### Ops/ops.py (dashboard, 3900, LAN, auth yok)

Tek HTML sayfa + `/api/status` JSON, 5 sn'de bir yenilenir:

1. **Sağlık**: 3 servis için `launchctl print gui/501/<label>` (pid, son çıkış kodu) + log dosyasının son yazılma
   zamanı. Yeşil/sarı/kırmızı.
2. **Aktif işler**: `jobs.json`'daki `running` kayıtlar. Boşsa "Durdurmak güvenli".
3. **Kullanım**: son 24 saat / 7 gün özellik başına iş sayısı.
4. **Routine'ler**: son run zamanı, süresi, `is_error`, tek satır sonuç, push sonucu; sonraki planlı run.
5. **Loglar**: servis seçimi + son 200 satır + metin filtresi.

Buton yok; başlat/durdur SSH ile (`launchctl kickstart -k gui/501/<label>`).

## Adımlar

1. **Branch + worktree** — `mac-mini` branch'i, bu Mac'te worktree. Doğrulama: ana ağaç `git status` değişmedi.
2. **Kod (worktree'de)** — `reflex_jobs.py`; app.py log + iş + `STATS_URL`; stats.py iş + `/releases/*`;
   `Ops/ops.py`; `launchd/` (plist'ler, `install.sh`, `run-routine.sh`); `requirements.txt`; README.
   Doğrulama: bu Mac'te test portlarında koştur; Task Move 3 task → dashboard'da `running → finished`;
   `/releases/pa/` tablo + linkler görünüyor; `run-routine.sh` kuru test (claude yerine `true`) commit mantığını
   doğru dosyalarla yapıyor.
3. **Prompt'lar (worktree'de)** — yollar makineden bağımsız, canvas bölümü silinir, Bug Watcher dry-run `true`.
   Doğrulama: worktree'den `claude -p` ile Release Summary bir kez koşar: md güncel, canvas'a dokunmadı.
4. **Mini erişim + kurulum** — Batuhan: `ssh-copy-id`, Ekran Paylaşımı, uyku/otomatik giriş, FileVault okuma,
   `lsof` 3800/3900; sonra yukarıdaki "Mini kurulumu". Doğrulama: mini'de `CLAUDE_CONFIG_DIR=~/.claude-reflex
   claude -p` spike'ı (`slack_search_channels` → `#reflex`, bir `search_tasks`, `mempalace_status`).
5. **Mini'de clone + stats/ops** — `git clone` (branch `mac-mini`), `.env`, `install.sh` ile **yalnız stats + ops**.
   Eski Mac'teki stats.py kapatılır (aynı TE hesabı, iki sunucu gereksiz). Doğrulama: `http://productmacmini.local:3800`
   ve `:3900` Batuhan'ın Mac'inden açılıyor.
6. **Geçiş günü** — sırayla: eski Mac'te app.py durdurulur; eski 3 scheduled task **disable** (silinmez);
   branch'te routine çıktı dosyaları `main`'den alınır (`git checkout main -- "Release Summary/*.md" "Skill Catalog/skill_catalog_state.json"`;
   routine'ler `main`'i güncel tutmuştur, branch'teki test kopyaları eskidir); `mac-mini` → `main` merge + push; mini `git pull`, `install.sh` ile app + 3 routine ajanı yüklenir.
   Doğrulama: Slack'te Bug Details, Stats kısayolu, Task Move (2 test task); dashboard'da işler.
7. **Routine doğrulama** — her ajan elle bir kez (`launchctl kickstart`), Bug Watcher dry-run `true`. Doğrulama:
   run log `is_error: false`; Release Summary md güncellendi ve **push'landı** (bu Mac'te `git pull` ile görünür);
   dashboard routine bölümü dolu. Sonra dry-run `false` (commit + push).
8. **Yayın** — `/releases/*` linkleri `#pa-releasehistory` / `#cs-releasehistory` pins'ine; canvas'lara not;
   IT'den DHCP rezervasyonu.
9. **Temizlik (eski Mac)** — `sudo pmset repeat cancel`; `launchctl bootout gui/$(id -u)/com.vertigo.bugwatcher-awake`
   + plist sil; eski scheduled task'lar bir hafta sonra silinir; hafıza notu güncellenir.

## Blast radius

- **Kapsam:** app.py, stats.py, yeni `reflex_jobs.py` / `Ops/` / `launchd/`, üç prompt, `requirements.txt`, README.
  Mini: launchd ajanları, enerji + otomatik giriş, Claude CLI (`~/.claude-reflex`), mempalace, deploy key.
  GitHub: deploy key (write). Eski Mac: pmset/LaunchAgent kaldırma, scheduled task disable.
- **Etki:** Adım 6'da Slack kısayolları birkaç dakika cevapsız. Socket Mode iki app.py'yi aynı anda kaldırır ama
  olayları böler → eski kapanır, sonra yeni açılır. Canvas'lar güncellenmez (eski içerik + not). Routine'ler
  artık `main`'e otomatik commit atar; Batuhan bu Mac'te çalışmadan önce `git pull` yapar.
- **Rollback:** Eski Mac'teki her şey yerinde: app.py + stats.py eski komutla açılır, 3 scheduled task re-enable,
  `main` merge'den önceki commit'e döner (`git revert`), mini'de `install.sh --uninstall`.

## Açık sorular

1. FileVault mini'de açık mı? (adım 4'te okunur; açıksa otomatik giriş kararı Batuhan/IT.)
2. AI Tester mini'yi yeniden başlatıyor / uyutuyor / ağır yük bindiriyor mu? (diğer developer'a sorulur.)
3. ~~VertigoAI commit~~ → `run-routine.sh` `docs/SKILL_CATALOG.md`'yi de commit + push eder (AITesterVertigo, gh kimliği; 16 Eki).
4. IT'de DHCP rezervasyonunu kim yapar?
5. Bot Slack kullanıcısı Bug Watcher'ın izlediği kanallarda üye mi? (Değilse okuyamaz; adım 7'de görünür.)

## Sonra

- Routine'ler için `--allowedTools` beyaz listesi → `bypassPermissions` yerine.
- Dashboard'a parola / IP kısıtı.
- Release Summary için Claude Artifact kopyası (ofis dışı erişim).
