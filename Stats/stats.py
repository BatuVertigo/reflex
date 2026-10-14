"""Stats: Stats Polygun and Stats CS on one port. /polygun/ and /cs/ are each game's own page and API, answered by that
game's unchanged server module; / is a home page that opens the last game picked in this browser, or shows both.

Runs on the office Mac (port 3800 unless STATS_PORT says otherwise), so the Slack shortcut link keeps working. Both
games share one TE lock, so the shared TE account never sees more than 2 queries at once. PLAN.md has the design.
"""

import importlib.util
import os
import socket
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

FOLDER = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("STATS_PORT") or "3800")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(FOLDER, path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


polygun = load("stats_polygun", "Stats Polygun/stats_polygun.py")
cs = load("stats_cs", "Stats CS/stats_cs.py")
# One lock for the one TE account: run_sql and stream_job read te_lock from their module at call time.
cs.te_lock = polygun.te_lock
GAMES = {"/polygun": polygun, "/cs": cs}


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

    def do_GET(self):
        path = urlparse(self.path).path
        for prefix, game in GAMES.items():
            if path == prefix:
                # The pages use relative addresses, which only resolve under the trailing slash.
                self.send_response(HTTPStatus.MOVED_PERMANENTLY)
                self.send_header("Location", f"{prefix}/")
                self.end_headers()
                return
            if path.startswith(f"{prefix}/"):
                # The game's own handler answers the rest: same base class, so the request can switch to it.
                self.path = self.path[len(prefix):]
                self.directory = game.STATIC
                self.__class__ = game.Handler
                self.do_GET()
                return
        if path in ("/", "/index.html"):
            with open(os.path.join(FOLDER, "index.html"), "rb") as file:
                body = file.read()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
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
    print(f"Stats is up: http://{lan_address()}:{PORT} (Polygun at /polygun/, Critical Strike at /cs/; Ctrl+C stops it)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
