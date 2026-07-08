"""
reflex — surum/ortam denetcisi (version check) + bug details formatlayici
"""

from __future__ import annotations

import json
import logging
import os
import subprocess

from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("reflex")

# .env'de virgülle ayrılmış bir veya birden fazla kanal ID'si olabilir.
# Bot yalnızca bu kanallarda davranır (yanlış bir kanala eklense bile susar).
QA_CHANNEL_IDS = {
    c.strip() for c in os.environ["QA_CHANNEL_ID"].split(",") if c.strip()
}

# --- Claude motoru (ortak) ---
# launchd altında PATH minimaldir; `which claude` çıktısını CLAUDE_BIN'e koy.
CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "claude")

# --- Özellik 1: version check (eksik sürüm/ortam denetçisi) ---
# Model tag'i kullanılır ("haiku"): yeni sürüm çıkınca .env güncellemeye gerek yok.
CLAUDE_HAIKU_MODEL = os.environ.get("CLAUDE_HAIKU_MODEL", "haiku")
VERSION_CHECK_TIMEOUT = int(os.environ.get("VERSION_CHECK_TIMEOUT", "60"))
VERSION_CHECK_EFFORT = os.environ.get("VERSION_CHECK_EFFORT", "low")

# --- Özellik 2: bug details (thread → güçlü model → modal) ---
CLAUDE_OPUS_MODEL = os.environ.get("CLAUDE_OPUS_MODEL", "opus")
BUG_DETAILS_TIMEOUT = int(os.environ.get("BUG_DETAILS_TIMEOUT", "180"))
BUG_DETAILS_EFFORT = os.environ.get("BUG_DETAILS_EFFORT", "medium")

# Reasoning ("effort") seviyesi. Ortamda CLAUDE_EFFORT=high olabilir; bu, basit
# sınıflandırmayı bile çok yavaşlatır (Haiku'da 26 sn görüldü). version check
# düşük effort ile çalışmalı; bug details sentezi biraz reasoning'den faydalanır.
# Geçerli seviyeler: low, medium, high, xhigh, max.

# Bot'un `claude` çağrıları, kullanıcının global Claude Code config'inden İZOLE
# çalışmalı: aksi halde her çağrıda global CLAUDE.md + settings + hook'lar
# (örn. mempalace Stop/PreCompact hook'u) yüklenir; bu hem ~7sn spawn maliyeti
# hem de hook gecikmesi ekler ve timeout'a yol açar. Ayrı/boş bir config dizini
# ~10x daha hızlıdır. Auth `.env`'deki CLAUDE_CODE_OAUTH_TOKEN'dan gelir, bu
# dizinden bağımsızdır.
BOT_CLAUDE_HOME = os.environ.get(
    "BOT_CLAUDE_HOME",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bot-claude-home"),
)
os.makedirs(BOT_CLAUDE_HOME, exist_ok=True)

app = App(token=os.environ["SLACK_BOT_TOKEN"])

# Aynı mesaja iki kez yanıt vermemek için (süreç ömrü boyunca) basit bir kayıt.
_replied: set[str] = set()
# Kullanıcı adı önbelleği (users.info çağrısını azaltmak için).
_user_names: dict[str, str] = {}


def _load_prompt(filename: str) -> str:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
    with open(path, encoding="utf-8") as f:
        return f.read()


# Promptlar ayrı .md dosyalarında tutulur (koda dokunmadan düzenlenebilsin diye).
# Her özellik kendi klasöründe (örn. "Bug Watcher", "Release Summary" ile aynı düzen).
VERSION_CHECK_PROMPT = _load_prompt("Version Check/version_check_prompt.md")
BUG_DETAILS_PROMPT = _load_prompt("Bug Details/bug_details_prompt.md")

# Alt-süreç SAF bir motor olmalı: hiçbir MCP sunucusu (Slack dahil) ve hiçbir
# dahili araç çalıştıramasın. Aksi halde agentic `claude`, gelen mesajı bir
# "görev" sanıp Slack MCP ile kanala kendi mesajını atabilir ya da kullanıcı
# metnindeki prompt-injection ile araç çalıştırabilir.
_DISALLOWED_TOOLS = [
    "Bash", "Edit", "Write", "Read", "Glob", "Grep",
    "WebFetch", "WebSearch", "Task", "NotebookEdit",
]


def _run_claude(
    system_prompt: str, user_text: str, model: str, timeout: int, effort: str
) -> str | None:
    """`claude` CLI'ı kilitli (MCP/araç yok) çalıştır; ham yanıt metnini döndür."""
    proc = subprocess.run(
        [
            CLAUDE_BIN,
            "--print",
            "--output-format", "json",
            "--model", model,
            "--effort", effort,               # düşük effort = hızlı (gereksiz düşünme yok)
            "--strict-mcp-config",            # hiçbir MCP sunucusu yükleme
            "--no-session-persistence",       # oturum dosyası yazma (hızlı)
            "--system-prompt", system_prompt,
            # variadic; arg yutmamak için EN SONDA dursun:
            "--disallowed-tools", *_DISALLOWED_TOOLS,
        ],
        input=user_text,                      # kullanıcı metni stdin'den (arg yutma/injection yok)
        capture_output=True,
        text=True,
        timeout=timeout,
        env={
            **os.environ,
            # İzole config dizini → global CLAUDE.md/settings/hook'lar yüklenmez.
            "CLAUDE_CONFIG_DIR": BOT_CLAUDE_HOME,
            # Miras alınan CLAUDE_EFFORT=high'i ez (flag'e ek güvence).
            "CLAUDE_EFFORT": effort,
        },
    )
    if proc.returncode != 0:
        logger.error("claude CLI hata kodu %s: %s", proc.returncode, proc.stderr.strip())
        return None
    # --output-format json: stdout bir zarf nesnesidir; asıl metin "result"ta.
    envelope = json.loads(proc.stdout)
    # Süre kırılımı: total = framework+spawn+model, api = sadece model çağrısı.
    logger.info(
        "claude(%s): total=%sms api=%sms turns=%s",
        model,
        envelope.get("duration_ms"),
        envelope.get("duration_api_ms"),
        envelope.get("num_turns"),
    )
    if envelope.get("is_error"):
        logger.error("claude sonucu hata: %s", envelope.get("result"))
        return None
    return envelope["result"]


# ---------------------------------------------------------------------------
# Özellik 1: version check (yeni mesaj → sürüm/ortam eksikse thread'e soru)
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> dict:
    """Modelin metin yanıtından JSON nesnesini çıkar (kod bloğu olsa bile)."""
    s = text.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s[:4].lower() == "json":
            s = s[4:]
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        i, j = s.find("{"), s.rfind("}")
        if i != -1 and j != -1 and j > i:
            return json.loads(s[i : j + 1])
        raise


def check_version(text: str) -> dict | None:
    """Mesajı değerlendir; {is_bug_report, missing, question} dict'ini döndür."""
    raw = _run_claude(
        VERSION_CHECK_PROMPT, text, CLAUDE_HAIKU_MODEL,
        VERSION_CHECK_TIMEOUT, VERSION_CHECK_EFFORT,
    )
    if raw is None:
        return None
    return _extract_json(raw)


@app.event("message")
def handle_message(event, client):
    # Sadece izlenen kanal(lar).
    channel = event.get("channel")
    if channel not in QA_CHANNEL_IDS:
        return
    # Botları (kendimiz dahil) ve düzenleme/katılma gibi alt-tipleri ele.
    # Ekli dosyalı normal mesajlara izin ver (file_share).
    if event.get("bot_id"):
        return
    if event.get("subtype") not in (None, "file_share"):
        return
    # Yalnızca üst-seviye mesajlar; thread yanıtlarına dokunma.
    if event.get("thread_ts"):
        return

    text = (event.get("text") or "").strip()
    if not text:
        return

    ts = event["ts"]
    if ts in _replied:
        return

    try:
        result = check_version(text)
    except Exception:
        logger.exception("Version check başarısız (ts=%s)", ts)
        return

    if not result or not result.get("is_bug_report"):
        return

    missing = result.get("missing") or []
    if not missing:
        return  # rapor tam; sessiz kal.

    question = (result.get("question") or "").strip()
    if not question:
        return

    user = event.get("user")
    mention = f"<@{user}> " if user else ""
    client.chat_postMessage(
        channel=channel,
        thread_ts=ts,
        text=f"{mention}{question}",
    )
    _replied.add(ts)
    logger.info("Eksik alan soruldu %s (ts=%s)", missing, ts)


# ---------------------------------------------------------------------------
# Özellik 2: "Bug Details" mesaj kısayolu (thread → Opus → özel modal)
# ---------------------------------------------------------------------------

def _display_name(client, uid: str | None) -> str:
    """Kullanıcı ID'sini okunabilir ada çevir (önbellekli, users:read gerekir)."""
    if not uid:
        return "bilinmeyen"
    if uid in _user_names:
        return _user_names[uid]
    name = uid
    try:
        prof = client.users_info(user=uid)["user"]
        p = prof.get("profile", {})
        name = p.get("display_name") or p.get("real_name") or prof.get("name") or uid
    except Exception:
        pass
    _user_names[uid] = name
    return name


def _build_transcript(client, messages: list[dict]) -> str:
    """Thread mesajlarını 'Ad: metin' satırlarına çevir (bot mesajları hariç)."""
    lines = []
    for m in messages:
        if m.get("bot_id"):
            continue  # bot mesajlarını (kendi sorularımız dahil) atla
        text = (m.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"{_display_name(client, m.get('user'))}: {text}")
    return "\n".join(lines)


def _thread_permalink(client, channel: str, thread_ts: str) -> str | None:
    """Thread kök mesajının kalıcı Slack linkini döndür (başarısızsa None)."""
    try:
        return client.chat_getPermalink(channel=channel, message_ts=thread_ts)["permalink"]
    except Exception:
        logger.exception("Permalink alınamadı (thread_ts=%s)", thread_ts)
        return None


def _is_slack_link_line(line: str) -> bool:
    """Sonda duran (bizim ya da modelin yazdığı) bir 'Slack thread' link satırı mı?"""
    s = line.strip().lower()
    return (
        s.startswith(("slack thread:", "[slack thread]"))          # düz metin / markdown
        or (s.startswith("<http") and s.endswith("|slack thread>"))  # Slack mrkdwn
    )


def _with_slack_link(result: str, permalink: str | None) -> str:
    """Modelin (varsa placeholder) 'Slack thread' satırını at, gerçek linki ekle.

    Link'i model üretmez; burada deterministik olarak eklenir — böylece URL asla
    kırpılmaz/bozulmaz. Model yine de bir 'Slack thread' satırı yazdıysa temizlenir.

    Slack mrkdwn `<url|metin>` sözdizimi kullanılır: modal'da gerçek bir köprü
    olarak render olur, kopyalanınca Asana'ya gömülü link olarak yapışır.
    Markdown `[metin](url)` Slack'te render OLMAZ; düz metin gider.
    """
    lines = result.rstrip().splitlines()
    while lines and _is_slack_link_line(lines[-1]):
        lines.pop()
    while lines and not lines[-1].strip():   # sondaki boş satırları da temizle
        lines.pop()
    body = "\n".join(lines)
    if not permalink:
        return body
    return f"{body}\n\n<{permalink}|Slack thread>"


def _modal(blocks: list[dict]) -> dict:
    return {
        "type": "modal",
        "title": {"type": "plain_text", "text": "Bug Details"},
        "close": {"type": "plain_text", "text": "Kapat"},
        "blocks": blocks,
    }


def _loading_view() -> dict:
    return _modal([{
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": ":hourglass_flowing_sand: *Hazırlanıyor…*\nThread okunuyor ve Opus ile formatlanıyor.",
        },
    }])


def _result_view(body: str) -> dict:
    # Slack section text bloğu ~3000 karakterle sınırlı; uzun çıktıyı böl.
    text = body.strip() or "(boş yanıt)"
    chunks = [text[i : i + 2900] for i in range(0, len(text), 2900)][:45]
    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": c}} for c in chunks
    ]
    return _modal(blocks)


@app.shortcut("bug_details")
def handle_bug_details(ack, shortcut, client):
    ack()  # 3 sn içinde; ardından trigger_id ile hemen modal aç.

    channel = shortcut["channel"]["id"]
    message = shortcut["message"]
    thread_ts = message.get("thread_ts") or message["ts"]
    trigger_id = shortcut["trigger_id"]

    # Önce yükleniyor modal'ını aç (trigger_id 3 sn geçerli).
    try:
        opened = client.views_open(trigger_id=trigger_id, view=_loading_view())
        view_id = opened["view"]["id"]
    except Exception:
        logger.exception("Modal açılamadı")
        return

    # Thread'i oku → Opus ile formatla → modal'ı güncelle (view_id, süre sınırı yok).
    try:
        replies = client.conversations_replies(channel=channel, ts=thread_ts, limit=200)
        transcript = _build_transcript(client, replies.get("messages", []))
        if not transcript:
            result = "Thread'de işlenecek metin bulunamadı."
        else:
            result = _run_claude(
                BUG_DETAILS_PROMPT, transcript, CLAUDE_OPUS_MODEL,
                BUG_DETAILS_TIMEOUT, BUG_DETAILS_EFFORT,
            ) or "Opus yanıtı alınamadı (loga bak)."
            # Slack linkini model değil, biz ekliyoruz (gerçek permalink, hiç kırpılmadan).
            result = _with_slack_link(result, _thread_permalink(client, channel, thread_ts))
    except Exception:
        logger.exception("Bug details üretimi başarısız (thread_ts=%s)", thread_ts)
        result = "Bir hata oluştu, task üretilemedi. (Detay için loga bak.)"

    try:
        client.views_update(view_id=view_id, view=_result_view(result))
    except Exception:
        logger.exception("Modal güncellenemedi")
    logger.info("Bug details üretildi (thread_ts=%s)", thread_ts)


if __name__ == "__main__":
    logger.info(
        "reflex başlıyor (Socket Mode, motor=claude CLI) — izlenen kanal: %d",
        len(QA_CHANNEL_IDS),
    )
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
