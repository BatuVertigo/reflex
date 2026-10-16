# Reflex

Product ekibinin işini kolaylaştıran bir bot. Yedi özelliği var: altısı Slack'te, yedincisi ofis Wi-Fi'ındaki bir web sayfasında çalışır.

**1. Bug Watcher.** Her sabah çalışan bir routine. İzlenen kanalların son 24 saatteki thread'lerini tarar; ilgilenilmemiş bug raporlarını ve aksiyon gerektiren teknik işleri bulur, Asana'da task açılmış mı diye cross-check yapar ve gerekirse thread'e ilgili kişiye ya da ekibe yönelik hatırlatma yazar. Yanıt gelmeyen thread'leri backlog'unda tutar, her run'ın başında yeniden değerlendirip gerekirse tekrar hatırlatır; run sonunda backlog'un güncel durumunu `#reflex` kanalına raporlar.

**2. Release Summary.** Her gün belirli aralıklarla çalışan bir routine. `#pa-releasehistory` ve `#cs-releasehistory` kanallarındaki release postlarını okuyup her oyunun release
history tablosunu güncel tutar.

**3. Skill Catalog.** Zamanlanmış bir routine. VertigoAI reposundaki plugin/skill kaynaklarını (`plugin-list.json` + `SKILL.md` dosyaları) tarar; değişiklik varsa `docs/SKILL_CATALOG.md`'yi ve ekibin Slack canvasındaki Skill Catalog bölümünü senkron tutar. Değişiklik yoksa hiçbir şeye dokunmadan çıkar.

**4. Bug Details.** Bir bug thread'indeki bir mesajın **"..."** menüsünden
**Bug Details** kısayolu çalıştırılır → bot thread'in tamamını okur → Claude Opus ile
Asana'ya geçirmeye hazır formata uygun bir text üretir → sonucu **sadece tıklayan kişiye** görünen bir **modal**'da gösterir. Kişi kopyalayıp Asana'ya yapıştırabilir.

**5. Version Check.** CRITICAL bir bug raporunun ve ortam/sürüm bilgisi eksikse,
kanalın product grubunu (@pa-product / @cs-product; eşleşme yoksa mesajı yazanı) etiketleyip aynı thread'e kısa bir soru atar: "Bu bug yayında var mı? Eğer yoksa sürüm bilgisi veya build numarası paylaşabilir misin?" gibi.

**6. Task Move.** Asana UI'ının yapamadığı toplu taşıma: Slack'te herhangi bir chatte "/"
kullanılarak **Move Asana tasks** açılır. Bot her task'ı Asana API'siyle parent'ın altına
subtask olarak taşır, sonucu raporlar. Tamamen deterministik: Claude çağrısı yok, saf Asana REST.

**7. Stats (Polygun + Critical Strike).** Ofis Wi-Fi'ındaki ekip arkadaşlarının PlayFab ID yapıştırıp oyuncu raporu, ya da match_id yapıştırıp maç raporu açtığı web sayfası. İki oyun tek sitede: `/polygun/` ve `/cs/`; üst bardaki seçiciyle geçilir, ana sayfa ilk ziyarette iki kart gösterir, sonra son seçilen oyunu açar. ThinkingData'ya sabit SQL sorguları atar, Claude çağrısı yok, hiçbir şey saklamaz
(disk yok, cache yok, log'da ID yok). Aranan her oyuncu sayfada bir chip olarak kalır; chip'e tıklayınca yeniden sorgu
atılmaz, aynı ID'yi tekrar yazmak veriyi tazeler, sayfa yenilenince chip'ler gider.
Slack'te **Stats** kısayolu ("/" menüsü) linki (`.env`'deki `STATS_URL`, ör. `http://productmacmini.local:3800`; yedek
olarak anlık IP) sadece çalıştırana görünen bir popup'ta verir. Aynı site `/releases/pa/` ve `/releases/cs/` altında
Release Summary tablolarını gösterir (md dosyalarını her açılışta okur).

**Mimari:** Version Check ve Bug Details, Slack **Socket Mode** (public endpoint yok) +
yerel **`claude` CLI** (Max aboneliği) motoruyla çalışır (`app.py`). Version Check
**Haiku**, Bug Details **Opus** kullanır; her iki çağrı da MCP'siz/araçsız izole
çalışır. **Anthropic API anahtarı gerekmez.** Bug Watcher, Release Summary ve Skill Catalog ise
zamanlanmış Claude routine'leridir: Mac mini'de launchd, saati gelince `launchd/run-routine.sh` ile headless
`claude -p` çalıştırır; davranışları kendi klasörlerindeki prompt dosyalarından yönetilir. Stats ayrı bir süreçtir
(`Stats/stats.py`, Python `http.server`, port 3800): iki oyunun sunucusunu (`Stats/Stats Polygun/stats_polygun.py`,
`Stats/Stats CS/stats_cs.py`) tek portta açar, tek TE kilidiyle. Slack'e ve `app.py`'ye dokunmaz, TE'ye paylaşılan
MCP token'ıyla bağlanır. Sayfalar `Stats/Stats Polygun/static/` ve `Stats/Stats CS/static/`, artifact önizlemesinin veri üreticisi `Stats/Stats Polygun/preview/` altındadır.
`Ops/ops.py` (port 3900) tek sayfalık sağlık panelidir: launchd durumu, aktif işler, kullanım sayıları, routine son
koşuları ve loglar. Her servis `REFLEX_LOG_DIR` (varsayılan `~/Library/Logs/Reflex`) altına log ve iş kaydı
(`jobs-app.json`, `jobs-stats.json`; her istek başladı → ilerliyor → bitti) yazar; `reflex_jobs.py` ortak yardımcıdır.

---

# Kurulum

## 1. Slack App kurulumu (bir kez)

[api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → *From scratch*.

1. **Socket Mode** → *Enable Socket Mode* → açılan ekranda bir **App-Level
   Token** üret (`connections:write` scope) → `xapp-...` → `SLACK_APP_TOKEN`.
2. **OAuth & Permissions** → *Bot Token Scopes* (izlenen kanallar public):
   - `channels:history`
   - `chat:write`
   - `users:read`  *(Bug Details kısayolunda thread yazarlarının adlarını çözmek için)*
3. **Event Subscriptions** → *Enable Events* → *Subscribe to bot events*:
   - `message.channels`
4. **Interactivity & Shortcuts** → *Interactivity*'yi **aç** (Socket Mode olduğu
   için Request URL gerekmez) → *Shortcuts* → **Create New Shortcut**:
   - Tür: **On messages** (mesaj kısayolu)
   - Name: `Bug Details`
   - Short description: `Thread'den Asana bug task üret`
   - **Callback ID: `bug_details`**  *(kodla birebir aynı olmalı)*

   Aynı ekranda ikinci kısayol — **Create New Shortcut**:
   - Tür: **Global** (⚡ menüsünden çalışır)
   - Name: `Move Asana tasks`
   - Short description: `Task'ları toplu subtask yap`
   - **Callback ID: `task_move`**  *(kodla birebir aynı olmalı)*
   - Task Move için ayrıca `.env`'e `ASANA_PAT` gerekir
     ([app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) → Personal access token).
     Taşımalar Asana'da token sahibinin adına görünür.
   Üçüncü kısayol — **Create New Shortcut**:
   - Tür: **Global**
   - Name: `Stats`
   - Short description: `Stats Polygun ve Stats CS'nin güncel linkleri`
   - **Callback ID: `stats_polygun`**  *(kodla birebir aynı olmalı; eski adı kaldı, Slack mevcut kısayolda değiştirmiyor)*
5. **Install App** (veya scope/shortcut ekledikten sonra **Reinstall**) →
   *Bot User OAuth Token* `xoxb-...` → `SLACK_BOT_TOKEN`.
6. Botu izlenecek her kanala ekle: kanal içinde `/invite @<bot-adı>`
   (örn. `#qa-polygunarena`).
7. **Kanal ID'leri:** kanal adına sağ tık → *View channel details* → en altta
   `C...` → `QA_CHANNEL_ID`. Birden fazla kanal izlenecekse ID'leri virgülle
   ayırarak yaz: `QA_CHANNEL_ID=C0AAA,C0BBB`.

> **Kapsam:** `message.channels` workspace genelinde tanımlıdır ama Slack bu
> eventleri yalnızca botun **üye olduğu** kanallar için gönderir. Botu sadece
> izlemek istediğin kanal(lar)a `/invite` et. Ayrıca kod `QA_CHANNEL_ID`
> listesinde olmayan her kanalı yok sayar (ikinci kilit).

## 2. Claude Code motorunu hazırla (Max — API key yok)

Bot, Anthropic API yerine yerel `claude` CLI'ı kullanır. Önce CLI kurulu ve
abonelikle yetkili olmalı:

```bash
claude --version          # kurulu mu? değilse: npm i -g @anthropic-ai/claude-code
claude setup-token        # Max hesabınla giriş → uzun ömürlü token basar
```

`setup-token` çıktısındaki `sk-ant-oat-...` token'ını `.env` içine
`CLAUDE_CODE_OAUTH_TOKEN=` olarak yazacaksın (aşağıda).

Hızlı sağlık testi (token'ı bir kez elle vererek):
```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-... \
  claude --print --model claude-haiku-4-5-20251001 "merhaba de"
# "Not logged in" yerine bir yanıt görmelisin.
```

## 3. Lokal kurulum

```bash
cd reflex
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# .env'in yoksa .env.example'dan oluştur, sonra içini doldur.

python app.py              # "reflex başlıyor..."
```

Kanala eksik bilgili bir test mesajı at (örn. "şu ekranda crash oluyor") → bot
thread'e soru atmalı. Tam bir mesaj at (örn. "Canlıda crash oluyor") → bot
sessiz kalmalı.

Task Move testi: ⚡ → **Move Asana tasks** → parent linki + 1-2 kobay task linki →
task'lar Asana'da parent'ın altında subtask olarak görünmeli.

## 4. Stats'ı başlat

`.env`'e üç anahtar ekle (`.env.example`'a bak): `TE_MCP_URL`, `TE_MCP_TOKEN` (TE MCP token'ı; paylaşılan
"Gizem" hesabı) ve `STATS_PORT` (boşsa 3800). Yeni bağımlılık yok; botun `.venv`'i yeter.

```bash
cd reflex
source .venv/bin/activate
python Stats/stats.py     # "Stats is up: http://192.168.x.x:3800 (Polygun at /polygun/, Critical Strike at /cs/; ...)"
```

Ekip arkadaşı aynı Wi-Fi'da `http://<Mac'in adresi>:3800` açar, oyunu seçer, PlayFab ID yapıştırır, 5–15 sn bekler.
Bir oyunu tek başına denemek için kendi dosyası hâlâ çalışır (`STATS_POLYGUN_PORT` / `STATS_CS_PORT`).
Test: `D6B0E21AF503CBDA` → 69 maç, %64 win rate, KD 2.48, 1.144 lig puanı görünmeli.

Bilinmesi gerekenler:

- İki oyunda toplam aynı anda tek arama çalışır; ikinci arama sıra bekler (sayfadaki "Looking up…" sayacı akmaya devam eder).
  120 sn'den uzun bekleyen istek "busy" cevabı alır.
- Sayfa yalnız Mac uyanıkken ve script çalışırken açıktır. Ctrl+C kapatır.
- Mac'in Wi-Fi adresi değişebilir; script açılışta güncel adresi yazar.
- Aynı Wi-Fi'daki herkes (misafirler dahil) her oyuncunun harcama, cihaz ve ülke bilgisini görebilir. Bilinen ve kabul edilen risk.
- 20.000 satırı aşan bir sorgu rapor yerine hata döner ("cut off"); o oyuncu için sorguyu aya bölmek gerekir.
- Artifact önizlemesinin verisi `Stats/Stats Polygun/preview/build_preview_data.py` ile üretilir. `data-*.js` dosyaları oyuncu verisi
  içerir; `.gitignore`'dadır.

## 5. Mac mini'de 7/24 çalıştırma (launchd)

Hedef: `vertigoproduct@productmacmini.local`, repo `~/GitHub/reflex`, Claude bot hesabı `~/.claude-reflex` altında.
Tam geçiş planı ve sırası: `PLAN-mac-mini.md`.

```bash
cd ~/GitHub/reflex
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
CLAUDE_CONFIG_DIR=~/.claude-reflex claude login          # bot hesabı; routine'ler bu oturumu kullanır (connector'lar yalnız böyle görünür)
CLAUDE_CONFIG_DIR=~/.claude-reflex claude setup-token    # çıktı → .env CLAUDE_CODE_OAUTH_TOKEN (yalnız app.py için)
# .env: .env.example'daki tüm anahtarlar (STATS_URL dahil)
bash launchd/install.sh                                   # 3 servis + 3 routine ajanı; tekrar çalıştırmak güvenli
```

- Servisler: `com.vertigo.reflex-app`, `-stats` (3800), `-ops` (3900); çökerse launchd yeniden başlatır.
  Durdur/başlat: `launchctl kickstart -k gui/$(id -u)/com.vertigo.reflex-app` (yeniden başlat),
  `launchctl bootout gui/$(id -u)/com.vertigo.reflex-app` (durdur). Durdurmadan önce `http://productmacmini.local:3900`
  "Active jobs" boş mu bak.
- Routine'ler: `-bug-watcher` (08:00 pzt–cum), `-release-summary` (08/14/20), `-skill-catalog` (11:00). Elle:
  `bash launchd/run-routine.sh release-summary`. Run bitince script, routine'in kendi çıktı dosyalarını commit + push eder
  (deploy key gerekir); her koşunun kaydı `~/Library/Logs/Reflex/routines/<ad>/`.
- Kaldır: `bash launchd/install.sh --uninstall`.
- Mini ayarları: uyku kapalı, `vertigoproduct` için otomatik giriş açık (LaunchAgent'lar oturum olmadan başlamaz;
  `sudo sysadminctl -autologin set -userName vertigoproduct -password …`).
- Repo `~/Documents` altında OLMAMALI: macOS launchd'den başlayan süreçlere Documents'ı kapatır (PermissionError).
- Routine testi SSH'tan değil launchd'den: `launchctl kickstart gui/$(id -u)/com.vertigo.reflex-release-summary`
  (SSH oturumunda keychain kilitli, claude.ai connector'ları görünmez).
