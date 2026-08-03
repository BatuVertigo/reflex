"""
reflex
  Version Check
  Bug Details
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


# =============================================================================
# CONFIG (.env)
# =============================================================================

# Watched QA channel(s), comma-separated.
QA_CHANNEL_IDS = {
    c.strip() for c in os.environ["QA_CHANNEL_ID"].split(",") if c.strip()
}
CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "claude")

# --- Version Check: fast + cheap classification ---
VERSION_CHECK_MODEL = os.environ.get("VERSION_CHECK_MODEL", "haiku")
VERSION_CHECK_TIMEOUT = int(os.environ.get("VERSION_CHECK_TIMEOUT", "60"))
VERSION_CHECK_EFFORT = os.environ.get("VERSION_CHECK_EFFORT", "low")

# --- Bug Details: quality synthesis ---
BUG_DETAILS_MODEL = os.environ.get("BUG_DETAILS_MODEL", "opus")
BUG_DETAILS_TIMEOUT = int(os.environ.get("BUG_DETAILS_TIMEOUT", "180"))
BUG_DETAILS_EFFORT = os.environ.get("BUG_DETAILS_EFFORT", "medium")

# Isolated config dir for the bot's `claude` calls
CLAUDE_FOLDER = os.environ.get(
    "CLAUDE_FOLDER",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".claude-bot"),
)
os.makedirs(CLAUDE_FOLDER, exist_ok=True)


# =============================================================================
# SLACK APP
# =============================================================================

app = App(token=os.environ["SLACK_BOT_TOKEN"])


# =============================================================================
# CLAUDE ENGINE (shared by both features)
# =============================================================================

def _load_prompt(filename: str) -> str:
    """Prompts live in per-feature .md folders; editable without touching code."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
    with open(path, encoding="utf-8") as f:
        return f.read()


# The subprocess must be a PURE engine.
# Otherwise prompt injection can hidden.
_DISALLOWED_TOOLS = [
    "Bash", "Edit", "Write", "Read", "Glob", "Grep",
    "WebFetch", "WebSearch", "Task", "NotebookEdit",
]


def _run_claude(
    system_prompt: str, user_text: str, model: str, timeout: int, effort: str
) -> str | None:
    """Run the `claude` CLI locked down (no MCP/tools); return the raw response text."""
    proc = subprocess.run(
        [
            CLAUDE_BIN,
            "--print",
            "--output-format", "json",
            "--model", model,
            "--effort", effort,
            "--strict-mcp-config",            # load no MCP servers
            "--no-session-persistence",       # write no session file (fast)
            "--system-prompt", system_prompt,
            # variadic; keep LAST so it cannot swallow other args:
            "--disallowed-tools", *_DISALLOWED_TOOLS,
        ],
        input=user_text,                      # user text via stdin (no arg swallowing/injection)
        capture_output=True,
        text=True,
        timeout=timeout,
        env={
            **os.environ,
            # Isolated config dir → global CLAUDE.md/settings/hooks are not loaded.
            "CLAUDE_CONFIG_DIR": CLAUDE_FOLDER,
            # Override an inherited CLAUDE_EFFORT=high (extra safety on top of the flag).
            "CLAUDE_EFFORT": effort,
        },
    )
    if proc.returncode != 0:
        logger.error("claude CLI exit code %s: %s", proc.returncode, proc.stderr.strip())
        return None
    # --output-format json: stdout is an envelope object; the actual text is in "result".
    envelope = json.loads(proc.stdout)
    # Duration breakdown: total = framework+spawn+model, api = model call only.
    logger.info(
        "claude(%s): total=%sms api=%sms turns=%s",
        model,
        envelope.get("duration_ms"),
        envelope.get("duration_api_ms"),
        envelope.get("num_turns"),
    )
    if envelope.get("is_error"):
        logger.error("claude returned an error: %s", envelope.get("result"))
        return None
    return envelope["result"]


# =============================================================================
# FEATURE - VERSION CHECK
# =============================================================================

VERSION_CHECK_PROMPT = _load_prompt("Version Check/version_check_prompt.md")

# Same message never answered twice (process lifetime).
_replied: set[str] = set()


def _extract_json(text: str) -> dict:
    """Extract the JSON object from the model's text response (even inside a code block)."""
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
    """Evaluate the message; return the {is_critical_bug, missing, question} dict."""
    raw = _run_claude(
        VERSION_CHECK_PROMPT, text, VERSION_CHECK_MODEL,
        VERSION_CHECK_TIMEOUT, VERSION_CHECK_EFFORT,
    )
    if raw is None:
        return None
    return _extract_json(raw)


@app.event("message")
def handle_message(event, client):
    # Watched channel(s) only.
    channel = event.get("channel")
    if channel not in QA_CHANNEL_IDS:
        return
    # Drop bots (ourselves included) and subtypes like edits/joins.
    # Allow regular messages with attachments (file_share).
    if event.get("bot_id"):
        return
    if event.get("subtype") not in (None, "file_share"):
        return
    # Top-level messages only; never touch thread replies.
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
        logger.exception("Version check failed (ts=%s)", ts)
        return

    if not result or not result.get("is_critical_bug"):
        return

    missing = result.get("missing") or []
    if not missing:
        return  # report is complete; stay silent.

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
    logger.info("Asked for missing fields %s (ts=%s)", missing, ts)


# =============================================================================
# FEATURE - BUG DETAILS
# =============================================================================

BUG_DETAILS_PROMPT = _load_prompt("Bug Details/bug_details_prompt.md")

# Display-name cache (to reduce users.info calls).
_user_names: dict[str, str] = {}


# --- thread → transcript ---

def _display_name(client, uid: str | None) -> str:
    """Resolve a user ID to a readable name (cached, requires users:read)."""
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
    """Turn thread messages into 'Name: text' lines (bot messages excluded)."""
    lines = []
    for m in messages:
        if m.get("bot_id"):
            continue  # skip bot messages (our own questions included)
        text = (m.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"{_display_name(client, m.get('user'))}: {text}")
    return "\n".join(lines)


# --- Slack thread link ---

def _thread_permalink(client, channel: str, thread_ts: str) -> str | None:
    """Return the permanent Slack link of the thread's root message (None on failure)."""
    try:
        return client.chat_getPermalink(channel=channel, message_ts=thread_ts)["permalink"]
    except Exception:
        logger.exception("Failed to get permalink (thread_ts=%s)", thread_ts)
        return None


def _is_slack_link_line(line: str) -> bool:
    """Is this a trailing 'Slack thread' link line (written by us or the model)?"""
    s = line.strip().lower()
    return (
        s.startswith(("slack thread:", "[slack thread]"))          # plain text / markdown
        or (s.startswith("<http") and s.endswith("|slack thread>"))  # Slack mrkdwn
    )


def _with_slack_link(result: str, permalink: str | None) -> str:
    """Strip any 'Slack thread' line the model wrote; append the real permalink.

    Appended here deterministically, never model-generated → the URL can never
    be truncated/mangled. Slack mrkdwn `<url|text>` is used because markdown
    `[text](url)` does NOT render in Slack; mrkdwn also pastes into Asana as a link.
    """
    lines = result.rstrip().splitlines()
    while lines and _is_slack_link_line(lines[-1]):
        lines.pop()
    while lines and not lines[-1].strip():   # also trim trailing blank lines
        lines.pop()
    body = "\n".join(lines)
    if not permalink:
        return body
    return f"{body}\n\n<{permalink}|Slack thread>"


# --- modal UI ---

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
    # Slack section text blocks cap at ~3000 chars; split long output.
    text = body.strip() or "(boş yanıt)"
    chunks = [text[i : i + 2900] for i in range(0, len(text), 2900)][:45]
    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": c}} for c in chunks
    ]
    return _modal(blocks)


# --- shortcut handler ---

@app.shortcut("bug_details")
def handle_bug_details(ack, shortcut, client):
    ack()  # within 3 s; then open the modal right away with trigger_id.

    channel = shortcut["channel"]["id"]
    message = shortcut["message"]
    thread_ts = message.get("thread_ts") or message["ts"]
    trigger_id = shortcut["trigger_id"]

    # Open the loading modal first (trigger_id is valid for 3 s).
    try:
        opened = client.views_open(trigger_id=trigger_id, view=_loading_view())
        view_id = opened["view"]["id"]
    except Exception:
        logger.exception("Failed to open modal")
        return

    # Read the thread → format with Opus → update the modal (view_id, no time limit).
    try:
        replies = client.conversations_replies(channel=channel, ts=thread_ts, limit=200)
        transcript = _build_transcript(client, replies.get("messages", []))
        if not transcript:
            result = "Thread'de işlenecek metin bulunamadı."
        else:
            result = _run_claude(
                BUG_DETAILS_PROMPT, transcript, BUG_DETAILS_MODEL,
                BUG_DETAILS_TIMEOUT, BUG_DETAILS_EFFORT,
            ) or "Opus yanıtı alınamadı (loga bak)."
            # We append the Slack link ourselves, not the model (real permalink, never truncated).
            result = _with_slack_link(result, _thread_permalink(client, channel, thread_ts))
    except Exception:
        logger.exception("Bug details generation failed (thread_ts=%s)", thread_ts)
        result = "Bir hata oluştu, task üretilemedi. (Detay için loga bak.)"

    try:
        client.views_update(view_id=view_id, view=_result_view(result))
    except Exception:
        logger.exception("Failed to update modal")
    logger.info("Bug details generated (thread_ts=%s)", thread_ts)


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    logger.info(
        "reflex starting (Socket Mode, engine=claude CLI) — watched channels: %d",
        len(QA_CHANNEL_IDS),
    )
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
