"""Stats: Stats Polygun and Stats CS on one port. /polygun/ and /cs/ are each game's own page and API, answered by that
game's unchanged server module; / is a home page that opens the last game picked in this browser, or shows both.
/releases/pa/ and /releases/cs/ show the Release Summary tables (the md files the Release Summary routine keeps).

Runs on the office Mac mini (port 3800 unless STATS_PORT says otherwise), so the Slack shortcut link keeps working.
Both games share one TE lock, so the shared TE account never sees more than 2 queries at once. PLAN.md has the design.
Every search is recorded as a job for the ops dashboard (kind and outcome only, never an ID).
"""

import importlib.util
import os
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
GAMES = {"/polygun": polygun, "/cs": cs}

RELEASES = {
    "pa": ("Polygun Arena", os.path.join(ROOT, "Release Summary/pa_release_summary.md")),
    "cs": ("Critical Strike", os.path.join(ROOT, "Release Summary/cs_release_summary.md")),
}


def record_jobs(game_name, handler_class):
    """Wrap the game's stream_job so each search is a job: 'polygun career' started → finished / failed."""
    original = handler_class.stream_job

    def stream_job(self, job, what):
        kind = what.split()[0]
        job_id = jobs.start(f"{game_name} {kind}", self.client_address[0])
        status = original(self, job, what)
        jobs.finish(job_id, "finished" if status == "OK" else "failed", status.lower())
        return status

    handler_class.stream_job = stream_job


record_jobs("polygun", polygun.Handler)
record_jobs("cs", cs.Handler)


def release_page(key):
    title, path = RELEASES[key]
    with open(path, encoding="utf-8") as file:
        body = markdown.markdown(file.read(), extensions=["tables"])
    with open(os.path.join(FOLDER, "release.html"), encoding="utf-8") as file:
        page = file.read()
    return page.replace("<!--TITLE-->", f"{title} Release Summary").replace("<!--BODY-->", body).encode()


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
        # The pages use relative addresses, which only resolve under the trailing slash.
        self.send_response(HTTPStatus.MOVED_PERMANENTLY)
        self.send_header("Location", location)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        for prefix, game in GAMES.items():
            if path == prefix:
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
    print(f"Stats is up: http://{lan_address()}:{PORT} (Polygun at /polygun/, Critical Strike at /cs/, "
          f"release tables at /releases/pa/ and /releases/cs/; Ctrl+C stops it)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
