# Reflex

Slack kanallarında Product ekibinin işini kolaylaştıran bir bot. Dört özelliği var.

**1. Bug Watcher.** Her sabah çalışan bir routine. İzlenen kanalların son 24 saatteki thread'lerini tarar; ilgilenilmemiş bug raporlarını ve aksiyon gerektiren teknik işleri bulur, Asana'da task açılmış mı diye cross-check yapar ve gerekirse thread'e ilgili kişiye ya da ekibe yönelik hatırlatma yazar. Yanıt gelmeyen thread'leri backlog'unda tutar, her run'ın başında yeniden değerlendirip gerekirse tekrar hatırlatır; run sonunda backlog'un güncel durumunu `#reflex` kanalına raporlar.

**2. Release Summary.** Her gün belirli aralıklarla çalışan bir routine. `#pa-releasehistory` ve `#cs-releasehistory` kanallarındaki release postlarını okuyup her oyunun release
history tablosunu güncel tutar.

**3. Bug Details.** Bir bug thread'indeki bir mesajın **"..."** menüsünden
**Bug Details** kısayolu çalıştırılır → bot thread'in tamamını okur → Claude Opus ile
Asana'ya geçirmeye hazır formata uygun bir text üretir → sonucu **sadece tıklayan kişiye** görünen bir **modal**'da gösterir. Kişi kopyalayıp Asana'ya yapıştırabilir.

**4. Version Check.** CRITICAL bir bug raporunun ve ortam/sürüm bilgisi eksikse,
kişiyi etiketleyip aynı thread'e kısa bir soru atar: "Bu bug yayında var mı? Eğer yoksa sürüm bilgisi veya build numarası paylaşabilir misin?" gibi.

**Mimari:** Version Check ve Bug Details, Slack **Socket Mode** (public endpoint yok) +
yerel **`claude` CLI** (Max aboneliği) motoruyla çalışır (`app.py`). Version Check
**Haiku**, Bug Details **Opus** kullanır; her iki çağrı da MCP'siz/araçsız izole
çalışır. **Anthropic API anahtarı gerekmez.** Bug Watcher ve Release Summary ise
Slack/Asana MCP connector'larıyla çalışan zamanlanmış Claude Routine'leridir; davranışları
kendi klasörlerindeki prompt dosyalarından yönetilir.

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