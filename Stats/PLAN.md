# Stats — one site for both games

## Task

Serve Stats Polygun and Stats CS from one process on port 3800: `/polygun/` and `/cs/`, a game switch in each page's
top bar, and a home page at `/` that shows two game cards on the first visit and goes straight to the last picked
game after that (Batuhan, 2026-10-14, option A).

## Design

- `Stats/stats.py` imports `Stats Polygun/stats_polygun.py` and `Stats CS/stats_cs.py` unchanged in their query code.
  A request under `/polygun/` or `/cs/` has its prefix stripped and is handed to that game's own `Handler` (same
  class layout, so the request object switches class); `/` serves `Stats/index.html`.
- One TE lock for both games: the CS module's `te_lock` is pointed at Polygun's, so the shared TE account never sees
  more than 2 queries at once.
- The pages call `api/...` relative to their own address (was `/api/...`), so they work under a prefix and still
  work when a game's own server is run alone for testing.
- The last picked game is kept in the browser (`localStorage` key `stats-game`); without it, the home page shows
  the cards.
- Port 3800 stays, so the Slack shortcut link keeps working.

## Steps

1. `source.js` in both games: relative API paths. — verify: the live Polygun page still searches.
2. `Stats/stats.py` + `Stats/index.html`. — verify on a test port: `/`, `/polygun/`, `/cs/`, both APIs, a shared lock.
3. Game switch in both top bars, last-game memory. — verify in the browser.
4. README start command. Batuhan restarts 3800 with the new command.

## Blast radius

- Scope: the 3800 process (Batuhan restarts it), two `source.js` files, two `index.html` top bars, two `main.js`
  (one line each), README.
- Impact: the old `http://<Mac IP>:3800/` link opens the home page instead of Polygun directly on a first visit.
- Rollback: stop the new process and start `Stats Polygun/stats_polygun.py` as before; the page changes work there too.

## Later (2026-10-14)

- The separate Polygun / CS switch is gone: the logo and wordmark (top bar and side menu) are the switch, a link to the
  other game (Batuhan). Each `main.js` saves its own game name for the home page.
