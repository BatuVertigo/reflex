"""Ops: one page that shows how Reflex is doing on the Mac mini. Reads what the other processes already write
(launchd state, the log files and job files under REFLEX_LOG_DIR, the routine run files) and changes nothing.
No buttons: start and stop go through SSH (`launchctl kickstart -k gui/501/<label>`).

Port 3900 unless OPS_PORT says otherwise. LAN only, no password: the logs hold no Slack text and no player IDs.
"""

import importlib.util
import json
import os
import plistlib
import re
import socket
import subprocess
import time
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import markdown

FOLDER = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(FOLDER)
PORT = int(os.environ.get("OPS_PORT") or "3900")
LAUNCHD = os.path.join(ROOT, "launchd")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LOG_DIR = load("reflex_jobs", os.path.join(ROOT, "reflex_jobs.py")).LOG_DIR
SERVICES = ["app", "stats", "ops"]
ROUTINES = ["bug-watcher", "release-summary", "skill-catalog"]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
# A "project" is what the team uses: the two Stats games (their calls are stages of one search) and each Slack feature.
PROJECT_ORDER = ["Stats PA", "Stats CS", "Bug Details", "Task Move", "Version Check"]
# The Stats apps' own logos, shown beside their projects.
STATS_LOGOS = {
    "/stats-logo/pa.png": os.path.join(ROOT, "Stats", "Stats Polygun", "static", "logo-web.png"),
    "/stats-logo/cs.png": os.path.join(ROOT, "Stats", "Stats CS", "static", "logo-web.png"),
}
WINDOWS = {"24h": 1, "7d": 7, "30d": 30}


def project_of(feature):
    if feature.startswith("pa "):
        return "Stats PA"
    if feature.startswith("cs "):
        return "Stats CS"
    return feature


def when(stamp):
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%S%z")


def requests_from(jobs):
    """Jobs → requests: the stages of one Stats search (same group id) fold into one row; a Slack job is a row by itself."""
    requests = {}
    for job in sorted(jobs, key=lambda job: job["started"]):
        key = job.get("group") or job["id"]
        project = project_of(job["feature"])
        request = requests.setdefault(key, {
            "id": key, "project": project, "user": job["user"], "started": job["started"], "updated": job["updated"],
            "status": "finished", "stages": [], "link": job.get("link", ""), "detail": "",
        })
        stage_name = job["feature"].split(" ", 1)[1] if project.startswith("Stats") else job["feature"]
        seconds = max(0, int((when(job["updated"]) - when(job["started"])).total_seconds()))
        request["stages"].append({"name": stage_name, "status": job["status"], "seconds": seconds, "progress": job["progress"]})
        request["updated"] = max(request["updated"], job["updated"])
        if job.get("detail"):
            request["detail"] = job["detail"]
        if job.get("link"):
            request["link"] = job["link"]
        if job["status"] == "running" or request["status"] == "running":
            request["status"] = "running"
        elif job["status"] == "failed":
            request["status"] = "failed"
    return sorted(requests.values(), key=lambda request: request["started"], reverse=True)


def project_stats(requests):
    now_ = datetime.now().astimezone()
    names = PROJECT_ORDER + sorted({request["project"] for request in requests} - set(PROJECT_ORDER))
    table = {name: {window: {"requests": 0, "ok": 0, "failed": 0, "running": 0} for window in WINDOWS} for name in names}
    for request in requests:
        age_days = (now_ - when(request["started"])).total_seconds() / 86400
        for window, days in WINDOWS.items():
            if age_days <= days:
                counts = table[request["project"]][window]
                counts["requests"] += 1
                counts["ok" if request["status"] == "finished" else "failed" if request["status"] == "failed" else "running"] += 1
    return [{"name": name, "windows": table[name]} for name in names]


def launchd_state(label):
    """pid, state and last exit code from `launchctl print`; 'not loaded' when launchd has no such job."""
    try:
        out = subprocess.run(["launchctl", "print", f"gui/{os.getuid()}/{label}"], capture_output=True, text=True,
                             timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return {"state": "unknown"}
    if "state = " not in out:
        return {"state": "not loaded"}
    pick = lambda key: (re.search(rf"^\s*{key} = (.+)$", out, re.M) or [None, None])[1]
    return {"state": pick("state"), "pid": pick("pid"), "last_exit": pick("last exit code")}


def file_age(path):
    try:
        return int(time.time() - os.path.getmtime(path))
    except OSError:
        return None


def read_jobs(name):
    try:
        with open(os.path.join(LOG_DIR, f"jobs-{name}.json"), encoding="utf-8") as file:
            return json.load(file)["jobs"]
    except (OSError, ValueError, KeyError):
        return []


def schedule_text(label):
    """'08:00 Mon–Fri' / '08:00, 14:00, 20:00 daily' from the plist's StartCalendarInterval."""
    try:
        with open(os.path.join(LAUNCHD, f"{label}.plist"), "rb") as file:
            interval = plistlib.load(file).get("StartCalendarInterval")
    except (OSError, plistlib.InvalidFileException):
        return ""
    entries = interval if isinstance(interval, list) else [interval] if interval else []
    times = sorted({f"{entry.get('Hour', 0):02d}:{entry.get('Minute', 0):02d}" for entry in entries})
    weekdays = sorted({entry["Weekday"] for entry in entries if "Weekday" in entry})
    if not weekdays:
        days = "daily"
    elif weekdays == list(range(weekdays[0], weekdays[-1] + 1)) and len(weekdays) > 2:
        days = f"{DAYS[weekdays[0] - 1]}–{DAYS[weekdays[-1] - 1]}"
    else:
        days = " ".join(DAYS[day - 1] for day in weekdays)
    return f"{', '.join(times)} {days}"


def latest_run(name):
    folder = os.path.join(LOG_DIR, "routines", name)
    try:
        files = sorted(entry for entry in os.listdir(folder) if entry.endswith(".json"))
    except OSError:
        files = []
    if not files:
        return None
    try:
        with open(os.path.join(folder, files[-1]), encoding="utf-8") as file:
            run = json.load(file)
    except (OSError, ValueError):
        return {"file": files[-1], "error": "unreadable run file"}
    claude = run.get("claude") or {}
    result = (claude.get("result") or "").strip()
    return {
        "file": files[-1], "started": run.get("started"), "ended": run.get("ended"), "exit_code": run.get("exit_code"),
        "push": run.get("push"), "push_error": (run.get("push_error") or "")[-300:], "is_error": claude.get("is_error"), "duration_s": round((claude.get("duration_ms") or 0) / 1000),
        "cost_usd": claude.get("total_cost_usd"), "result": result[:400], "runs": len(files),
    }


def status():
    requests = requests_from(read_jobs("app") + read_jobs("stats"))
    return {
        "now": time.strftime("%Y-%m-%d %H:%M:%S"),
        "host": socket.gethostname(),
        "log_dir": LOG_DIR,
        "services": [{"name": name, "label": f"com.vertigo.reflex-{name}", "log_age_s": file_age(os.path.join(LOG_DIR, f"{name}.log")),
                      **launchd_state(f"com.vertigo.reflex-{name}")} for name in SERVICES],
        "running": [request for request in requests if request["status"] == "running"],
        "recent": requests[:40],
        "projects": project_stats(requests),
        "routines": [{"name": name, "label": f"com.vertigo.reflex-{name}", "schedule": schedule_text(f"com.vertigo.reflex-{name}"),
                      **launchd_state(f"com.vertigo.reflex-{name}"), "last": latest_run(name)} for name in ROUTINES],
    }


def run_view(name):
    """The latest run of a routine as something a person can read: its facts plus the routine's own report rendered from markdown."""
    run = latest_run(name)
    if not run:
        return {"meta": {}, "html": "<p>never ran here</p>"}
    with open(os.path.join(LOG_DIR, "routines", name, run["file"]), encoding="utf-8") as file:
        full = json.load(file)
    claude = full.get("claude") or {}
    parts = [markdown.markdown(claude.get("result") or "(no result)", extensions=["tables", "fenced_code"])]
    for title, text in (("push error", full.get("push_error")), ("stderr", full.get("stderr"))):
        if text and text.strip():
            parts.append(f"<h3>{title}</h3><pre>{text.strip().replace('<', '&lt;')}</pre>")
    meta = {"file": run["file"], "started": run["started"], "ended": run["ended"], "exit_code": run["exit_code"], "push": run["push"],
            "duration_s": run["duration_s"], "turns": claude.get("num_turns"), "is_error": claude.get("is_error")}
    return {"meta": meta, "html": "\n".join(parts)}


def tail(name, lines, needle):
    """Last `lines` lines of a service log (or a routine's latest run file) that contain `needle`."""
    path = os.path.join(LOG_DIR, f"{name}.log") if name in SERVICES else ""
    try:
        with open(path, "rb") as file:
            file.seek(0, os.SEEK_END)
            file.seek(max(0, file.tell() - 512_000))
            text = file.read().decode("utf-8", "replace")
    except OSError:
        return []
    found = [line for line in text.splitlines() if needle.lower() in line.lower()]
    return found[-lines:]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOLDER, **kwargs)

    def log_message(self, format, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except ConnectionError:
            pass

    def send(self, body, content_type):
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/status":
            self.send(json.dumps(status(), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        elif url.path == "/api/log":
            query = parse_qs(url.query)
            name = query.get("name", ["app"])[0]
            if name in ROUTINES:
                payload = run_view(name)
            else:
                payload = tail(name, min(int(query.get("lines", ["200"])[0]), 2000), query.get("q", [""])[0])
            self.send(json.dumps(payload, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        elif url.path in ("/", "/index.html"):
            with open(os.path.join(FOLDER, "index.html"), "rb") as file:
                self.send(file.read(), "text/html; charset=utf-8")
        elif url.path == "/logo.webp":
            super().do_GET()
        elif url.path in STATS_LOGOS:
            with open(STATS_LOGOS[url.path], "rb") as file:
                self.send(file.read(), "image/png")
        else:
            self.send_error(HTTPStatus.NOT_FOUND)


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Ops is up on port {PORT}, reading {LOG_DIR}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
