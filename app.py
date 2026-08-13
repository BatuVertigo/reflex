"""
reflex
  Version Check
  Bug Details
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import time
import urllib.error
import urllib.request

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

# --- Task Move: deterministic Asana subtask mover (no Claude call) ---
ASANA_PAT = os.environ.get("ASANA_PAT", "")
# Pause between Asana calls so bulk moves stay under the API rate limit.
TASK_MOVE_REQUEST_INTERVAL = float(os.environ.get("TASK_MOVE_REQUEST_INTERVAL", "0.15"))

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
    """Turn thread messages into '[DD.MM.YYYY HH:MM] Name: text' lines (bot messages excluded)."""
    lines = []
    for m in messages:
        if m.get("bot_id"):
            continue  # skip bot messages (our own questions included)
        text = (m.get("text") or "").strip()
        if not text:
            continue
        stamp = time.strftime("%d.%m.%Y %H:%M", time.localtime(float(m["ts"])))
        lines.append(f"[{stamp}] {_display_name(client, m.get('user'))}: {text}")
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

def _modal(blocks: list[dict], title: str = "Bug Details") -> dict:
    return {
        "type": "modal",
        "title": {"type": "plain_text", "text": title},
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


def _result_view(body: str, title: str = "Bug Details") -> dict:
    # Slack section text blocks cap at ~3000 chars; split long output.
    text = body.strip() or "(boş yanıt)"
    chunks = [text[i : i + 2900] for i in range(0, len(text), 2900)][:45]
    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": c}} for c in chunks
    ]
    return _modal(blocks, title=title)


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
# FEATURE - TASK MOVE
# =============================================================================

# Task GID = the last 10+ digit number in an Asana task URL. Covers both the
# legacy /0/{project}/{task}[/f] and the new /1/{workspace}/task/{task} formats.
_GID_PATTERN = re.compile(r"[0-9]{10,}")


def _extract_task_gid(url: str) -> str | None:
    matches = _GID_PATTERN.findall(url)
    return matches[-1] if matches else None


def _asana_set_parent(task_gid: str, parent_gid: str) -> tuple[bool, str]:
    """Move one task under the parent (official setParent endpoint).

    Returns (ok, detail): on success detail is the task name (free from the
    response, no extra call); on failure it is the Asana error message.
    Calling it again for an already-moved task is a harmless no-op.
    """
    request = urllib.request.Request(
        f"https://app.asana.com/api/1.0/tasks/{task_gid}/setParent",
        data=json.dumps({"data": {"parent": parent_gid}}).encode(),
        headers={
            "Authorization": f"Bearer {ASANA_PAT}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
        return True, payload.get("data", {}).get("name") or task_gid
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read().decode())
            detail = "; ".join(
                e.get("message", "") for e in body.get("errors", []) if e.get("message")
            )
        except Exception:
            detail = ""
        return False, detail or f"HTTP {error.code}"
    except Exception as error:
        return False, str(error)


def _task_move_form_view() -> dict:
    return {
        "type": "modal",
        "callback_id": "task_move_submit",
        "title": {"type": "plain_text", "text": "Move Asana tasks"},
        "submit": {"type": "plain_text", "text": "Taşı"},
        "close": {"type": "plain_text", "text": "Vazgeç"},
        "blocks": [
            {
                "type": "input",
                "block_id": "parent",
                "label": {"type": "plain_text", "text": "Parent task linki"},
                "element": {
                    "type": "plain_text_input",
                    "action_id": "text",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "https://app.asana.com/…",
                    },
                },
            },
            {
                "type": "input",
                "block_id": "tasks",
                "label": {"type": "plain_text", "text": "Taşınacak task linkleri"},
                "element": {
                    "type": "plain_text_input",
                    "action_id": "text",
                    "multiline": True,
                    "placeholder": {
                        "type": "plain_text",
                        "text": "Asana'da task'ları seç → sağ tık → Copy task links → yapıştır",
                    },
                },
                "hint": {
                    "type": "plain_text",
                    "text": "Her satırda bir task linki. Hepsi yukarıdaki parent'ın subtask'ı olur.",
                },
            },
        ],
    }


@app.shortcut("task_move")
def handle_task_move_shortcut(ack, shortcut, client):
    ack()
    if not ASANA_PAT:
        client.views_open(
            trigger_id=shortcut["trigger_id"],
            view=_result_view(
                "`ASANA_PAT` tanımlı değil. `.env`'e ekleyip botu yeniden başlat.",
                title="Move Asana tasks",
            ),
        )
        return
    client.views_open(trigger_id=shortcut["trigger_id"], view=_task_move_form_view())


@app.view("task_move_submit")
def handle_task_move_submit(ack, body, view, client):
    state = view["state"]["values"]
    parent_text = (state["parent"]["text"]["value"] or "").strip()
    tasks_text = (state["tasks"]["text"]["value"] or "").strip()

    parent_gid = _extract_task_gid(parent_text)
    task_urls = [line.strip() for line in tasks_text.splitlines() if line.strip()]

    # Field-level validation errors keep the form open with inline messages.
    if not parent_gid:
        ack(
            response_action="errors",
            errors={"parent": "Bu linkten task GID'i çıkarılamadı."},
        )
        return
    if not task_urls:
        ack(
            response_action="errors",
            errors={"tasks": "En az bir task linki gerekli."},
        )
        return

    # Ack within 3 s by swapping to a progress view; the same root view is
    # then updated by id when the moves finish (no time limit, like Bug Details).
    ack(
        response_action="update",
        view=_result_view(
            f":hourglass_flowing_sand: *Taşınıyor…* ({len(task_urls)} task)",
            title="Move Asana tasks",
        ),
    )
    view_id = body["view"]["id"]

    lines = []
    moved = 0
    try:
        # Bottom to up
        for task_url in reversed(task_urls):
            task_gid = _extract_task_gid(task_url)
            if not task_gid:
                lines.append(f"SKIP (GID yok): {task_url}")
                continue
            if task_gid == parent_gid:
                lines.append("SKIP: parent'ın kendisi listede")
                continue
            ok, detail = _asana_set_parent(task_gid, parent_gid)
            if ok:
                moved += 1
                lines.append(f":white_check_mark: {detail}")
            else:
                lines.append(f":x: {task_gid}: {detail}")
            time.sleep(TASK_MOVE_REQUEST_INTERVAL)
        report = f"*Taşınan: {moved} / {len(task_urls)}*\n" + "\n".join(lines)
    except Exception:
        logger.exception("Task move failed (parent=%s)", parent_gid)
        report = (
            f"*Taşınan: {moved} / {len(task_urls)}* — beklenmedik hata, kalanlar "
            "taşınmadı (loga bak). Aynı listeyle tekrar denemek güvenli."
        )

    try:
        client.views_update(view_id=view_id, view=_result_view(report, title="Move Asana tasks"))
    except Exception:
        logger.exception("Failed to update task move modal")
    logger.info("Task move finished: %s/%s under %s", moved, len(task_urls), parent_gid)


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    logger.info(
        "reflex starting (Socket Mode, engine=claude CLI) — watched channels: %d",
        len(QA_CHANNEL_IDS),
    )
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
