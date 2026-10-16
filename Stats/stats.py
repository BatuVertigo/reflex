"""Stats: Stats Polygun and Stats CS on one port. /stats/pa/ and /stats/cs/ are each game's own page and API, answered by
that game's unchanged server module; / is a home page that opens the last game picked in this browser, or shows both.
/releases/pa/ and /releases/cs/ show the Release Summary tables (the md files the Release Summary routine keeps).
The old /polygun/ and /cs/ addresses redirect to /stats/pa/ and /stats/cs/.

Runs on the office Mac mini (port 3800 unless STATS_PORT says otherwise), so the Slack shortcut link keeps working.
Both games share one TE lock, so the shared TE account never sees more than 2 queries at once. PLAN.md has the design.
Every search is recorded as a job for the ops dashboard (kind and outcome only, never an ID).
"""

import importlib.util
import os
import re
import socket
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import markdown

FOLDER = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(FOLDER)
PORT = int(os.environ.get("STATS_PORT") or "3800")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


polygun = load("stats_polygun", os.path.join(FOLDER, "Stats Polygun/stats_polygun.py"))
cs = load("stats_cs", os.path.join(FOLDER, "Stats CS/stats_cs.py"))
jobs = load("reflex_jobs", os.path.join(ROOT, "reflex_jobs.py")).Jobs("stats")
# One lock for the one TE account: run_sql and stream_job read te_lock from their module at call time.
cs.te_lock = polygun.te_lock
GAMES = {"/stats/pa": polygun, "/stats/cs": cs}
OLD_PREFIXES = {"/polygun": "/stats/pa", "/cs": "/stats/cs"}

# key: (name, md file, logo under Stats/icons, the other game's key — the header logo toggles between the two pages)
RELEASES = {
    "pa": ("Polygun Arena", os.path.join(ROOT, "Release Summary/pa_release_summary.md"), "/icons/pa-logo.webp", "cs"),
    "cs": ("Critical Strike", os.path.join(ROOT, "Release Summary/cs_release_summary.md"), "/icons/cs-logo.png", "pa"),
}


def record_jobs(game_name, handler_class):
    """Wrap the game's stream_job so each search is a job: 'pa career' started → finished / failed."""
    original = handler_class.stream_job

    def stream_job(self, job, what):
        kind = what.split()[0]
        job_id = jobs.start(f"{game_name} {kind}", self.client_address[0])
        status = original(self, job, what)
        jobs.finish(job_id, "finished" if status == "OK" else "failed", status.lower())
        return status

    handler_class.stream_job = stream_job


record_jobs("pa", polygun.Handler)
record_jobs("cs", cs.Handler)


def icon_path(name):
    """The <path d> of a Simple Icons SVG (CC0) in Stats/icons, inlined into the page as a <symbol>."""
    with open(os.path.join(FOLDER, "icons", f"{name}.svg"), encoding="utf-8") as file:
        return re.search(r'<path d="([^"]+)"', file.read()).group(1)


# The md keeps the emoji the routine writes; the page shows the real logos and colored status dots instead.
OS_ICONS = {
    "🍎": '<svg class="os apple" role="img" aria-label="iOS"><use href="#icon-apple"/></svg>',
    "🤖": '<svg class="os android" role="img" aria-label="Android"><use href="#icon-android"/></svg>',
}
STATUS_DOTS = {"🟢": "live", "🔵": "past"}
FLASK = '<svg class="flask" role="img" aria-label="Test"><use href="#icon-flask"/></svg>'
EXTERNAL = '<svg class="ext" aria-hidden="true"><use href="#icon-external"/></svg>'


def release_page(key):
    title, path, logo, other = RELEASES[key]
    with open(path, encoding="utf-8") as file:
        text = file.read()
    lines = text.splitlines()
    heading = next((line[2:].strip() for line in lines if line.startswith("# ")), f"{title} Release Summary")
    updated = re.search(r"Son güncelleme:\*\*\s*(.+)", text)
    table = markdown.markdown("\n".join(line for line in lines if line.startswith("|")), extensions=["tables"])
    for emoji, svg in OS_ICONS.items():
        table = table.replace(emoji, svg)
    for emoji, kind in STATUS_DOTS.items():
        table = table.replace(emoji, f'<span class="dot {kind}" aria-hidden="true"></span>')
    table = table.replace("🧪", FLASK)
    # Version numbers link to the Slack release post; a small arrow says so.
    table = re.sub(r'(<td><strong><a [^>]*>)([^<]*)(</a>)', lambda m: m.group(1) + m.group(2) + EXTERNAL + m.group(3), table)
    # Markdown renders no lists inside table cells, so the "- " the routine writes would show as text: one line per step is enough.
    table = re.sub(r"(<td>|<br ?/?>)- ", r"\1", table)
    with open(os.path.join(FOLDER, "release.html"), encoding="utf-8") as file:
        page = file.read()
    for marker, value in {
        "<!--TITLE-->": heading, "<!--GAME-->": title, "<!--KEY-->": key, "<!--LOGO-->": logo,
        "<!--OTHER-->": other, "<!--OTHERGAME-->": RELEASES[other][0],
        "<!--UPDATED-->": updated.group(1).strip() if updated else "", "<!--TABLE-->": table,
        "<!--APPLE-->": icon_path("apple"), "<!--ANDROID-->": icon_path("android"),
    }.items():
        page = page.replace(marker, value)
    return page.encode()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOLDER, **kwargs)

    def handle(self):
        # Browsers open spare connections and drop them unused; that is no error worth a traceback.
        try:
            super().handle()
        except ConnectionError:
            pass

    def log_message(self, format, *args):
        # Each game prints one readable line per API call; static files stay quiet.
        pass

    def send_html(self, body):
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location):
        self.send_response(HTTPStatus.MOVED_PERMANENTLY)
        self.send_header("Location", location)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        for old, new in OLD_PREFIXES.items():
            if path == old or path.startswith(f"{old}/"):
                self.redirect(new + self.path[len(old):] if path != old else f"{new}/")
                return
        for prefix, game in GAMES.items():
            if path == prefix:
                # The pages use relative addresses, which only resolve under the trailing slash.
                self.redirect(f"{prefix}/")
                return
            if path.startswith(f"{prefix}/"):
                # The game's own handler answers the rest: same base class, so the request can switch to it.
                self.path = self.path[len(prefix):]
                self.directory = game.STATIC
                self.__class__ = game.Handler
                self.do_GET()
                return
        for key in RELEASES:
            if path == f"/releases/{key}":
                self.redirect(f"/releases/{key}/")
                return
            if path == f"/releases/{key}/":
                self.send_html(release_page(key))
                return
        if path in ("/", "/index.html"):
            with open(os.path.join(FOLDER, "index.html"), "rb") as file:
                self.send_html(file.read())
            return
        if path.startswith("/icons/"):
            super().do_GET()  # Stats/icons: game logos and brand marks
            return
        self.send_error(HTTPStatus.NOT_FOUND)


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return "<this Mac's Wi-Fi address>"


def main():
    if not polygun.TE_URL or not polygun.TE_TOKEN:
        raise SystemExit("Set TE_MCP_URL and TE_MCP_TOKEN in reflex/.env first.")
    polygun.initialize()
    cs.initialize()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Stats is up: http://{lan_address()}:{PORT} (Polygun at /stats/pa/, Critical Strike at /stats/cs/, "
          f"release tables at /releases/pa/ and /releases/cs/; Ctrl+C stops it)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
