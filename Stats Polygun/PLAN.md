# Stats Polygun — plan

## Start here (handoff, updated 2026-09-18)
- **Status (2026-09-18):** live. Commits on `main`: `e473fba` "Implement Stats Polygun" (steps 4–7) and `5241ac6` "Enhance design of Stats Polygun" (step 8, UX rounds one to six, see the UX revision section). **Rounds seven to eleven (2026-09-18) are built and tested but not committed** (`stats_polygun.py`, `static/index.html`, `static/main.js`, `static/source.js`, `static/sections-matches.js`). The server on port 3800 reads `static/` from disk on every request, so page changes are live on the next reload. Python changes need a restart: the live server was last restarted at 16:24, so rounds eight to ten are live; **round eleven's VTD value, the quiet dropped-connection fix and the 11-to-16-character IDs need one more restart** (until then the new tile shows `–`, and the server refuses IDs shorter than 16). This file, `Stats Polygun/PLAN.md`, is still untracked; Batuhan decides whether it goes into git. Batuhan runs the server on the Mac and has confirmed it works from the page ("It works great"). A new chat should read this whole file first; it is the source of truth.
- **One project (2026-10-14):** match search is merged in. `stats_polygun.py` + `static/` on port 3800 serve both the player search and the match report (`/api/match/<match_id>`); `stats_polygun_2.py`, `static2/` and port 3900 are gone. The match work's history is the "Match search" section at the end of this file; its old names (`stats_polygun_2.py`, `static2/`, 3900) now mean `stats_polygun.py`, `static/`, 3800. The player-only version is still in git (`db6d535`); the match version was never committed and is now the content of `stats_polygun.py` and `static/`. Known: the match report still has open points Batuhan will list.
- **Artifact is frozen:** https://claude.ai/artifact/MQzwcLNMNkYUJmMS1Xs1dq stopped at version 16 on Batuhan's note ("you don't need to edit Artifact anymore"). It still shows the preview accounts with the round-three rail, but it is behind the real page (rounds four to six: economy tabs, removed texts, centered top bar, no credit line). Do not republish unless asked. The three `data-*.js` preview files still live only there.
- **How to test the page again (a new chat has no scratchpad):** run the real server on a test port from `reflex/` with `STATS_POLYGUN_PORT=3801 .venv/bin/python "Stats Polygun/stats_polygun.py"` (it reads `reflex/.env`, which now holds the TE keys), open `http://localhost:3801` in the Claude browser pane with `preview_start` (url form, no launch.json needed), set the viewport to 1280 × 900 for the desktop layout (the pane is narrower than the 960 px breakpoint by default), and search `D6B0E21AF503CBDA` (69 matches, 44–22–3, KD 2.48, LP 1,144) or `D4D4D020199FC96E` (3,138 matches, opens on Last 7 days). The pane's phone emulation was unreliable on 2026-09-16 (reported 417 px for a 375 px preset, blank screenshots); measure with JS instead of screenshots when that happens, or ask Batuhan to check on a phone. Kill the test server afterwards with `lsof -ti tcp:3801 -sTCP:LISTEN | xargs kill`. Never use `lsof -ti :3801`: it also lists the browser's side of any open connection, and on 2026-09-18 it killed the Claude app's browser helper during a streamed search (the helper restarted by itself; the page hung).
- **Known gaps:** the Flaticon icon credit line was removed on Batuhan's call (the free licence asks for one). Success criterion 1 (a second device on the office Wi-Fi) and the phone layout were never checked by Claude; Batuhan's "It works great" covers his own use.
- **Steps 5–7 result (2026-09-15 night):** `stats_polygun.py` (server), `static/source.js` (fetch source), README section, `.env.example` keys, `.gitignore` entry. Tested on ports 3801/3802 with the TE endpoint and token read from `~/.claude.json` at run time by a launcher script in the session scratchpad (nothing copied into the repo): the server's all-time and period answers are identical to the preview data for Mubatu and BÖRÜ 07 (3,172 battle rows, 9,837 weapon rows, 413 resource rows); MubatuNew differs only by one match played after the data refresh. The page against the real server: empty start, D6B0 report (69 / 64% / 2.48 / 1,144), BÖRÜ 07 in 6.5 s end to end with the ticker and every control disabled, chips switch with zero requests, Last 30 days and All time each send one period request, unknown ID keeps the current player, a stopped script gives the "not reachable" line, a reload gives an empty page, no console errors. Cut-off test with the row limit at 100: 502 "cut off". Two requests at once: served one after the other (1.4 s then 2.5 s), no concurrency error. Console shows only the start line. One bug found and fixed on the way: `.samples` and `.tooltip` set `display`, which beats the browser's own `[hidden]` rule, so an empty page showed "Searched:" and an empty tooltip box; `index.html` now carries `[hidden] { display: none !important; }` (the artifact host adds the same rule itself).
- **Step 4 result (2026-09-15 evening):** `static/` holds the page (`index.html`, `core.js`, `sections-*.js`, `main.js`, `logo-web.png`); `preview/` holds `preview-source.js` (async, loads `data-<id>.js` on demand), `build_preview_data.py`, `logo.png`. Checked on a local `http.server` copy: chips switch with no request and keep their period, the loading line ticks and every control is disabled while a search or period loads, the old player stays on an error, a re-search replaces the chip in place, the default rule picks Last 100 matches when Last 7 days is over the limit (tested with the limit lowered to 200), no console errors, no horizontal scroll at 375 px. **UNVERIFIED in the artifact itself:** the preview loads `data-<id>.js` by inserting a script tag; the artifact could not be opened from this session's browser (sign-in wall), so Batuhan should open version 12 once and confirm the three chips load.
- **What it looks like:** the preview artifact https://claude.ai/artifact/MQzwcLNMNkYUJmMS1Xs1dq (private, version 16, 2026-09-16). It holds two test accounts plus a heavy real player (`D4D4D020199FC96E`, 3,137 matches), with data refreshed on 2026-09-15, and shows every decision below, including held players, the loading line and the new default period. Published files: `index.html`, `core.js`, `sections-*.js`, `main.js`, `source.js` (= `preview/preview-source.js`), `logo-web.png`, the three `data-*.js` files.
- **Page code (was `prototype/`, split in step 4):** `reflex/Stats Polygun/static/` and `preview/`
  - `index.html`: page CSS; `player-template` (header, section menu, Career group, Period picker and strip); `report-template` (the Period cards and the notes); the inline icon sprite at the end.
  - `core.js`: helpers, tooltip, shared match cursor, `PERIOD_MATCH_LIMIT` (300), `POWER_BUCKETS`, `labelRow` (cut-bar labels), `drawVersionRules`, `buildCareer` (all-time rows) and the version translator `buildReport` (one period, including the "last N matches" trim).
  - `preview/preview-source.js`: preview only; answers the two API calls from the embedded data, in the server's shapes, as promises; loads `data-<id>.js` on first use; lists its three IDs as `SP.source.samples` and sets `SP.source.badge` ("Preview").
  - `sections-matches.js`: player header, summary tiles, career strip, form, league points, KD, by mode/map, every match. `sections-more.js`: weapon totals, heat legend, kills in each match, power gap chart, power gap results, time to find a match, play time. `sections-account.js`: earnings, upgrades, day by day.
  - `main.js`: search box, held players (`search`, `switchTo`, the Searched row), period options and periods, the default period rule, loading and error states, card open state, render order.
  - `logo.png` (source logo) and `logo-web.png` (the small copy the page uses).
  - `preview/build_preview_data.py`: the old 9 fixed SQL queries and the TE MCP client. It writes `data-<PlayFabID>.js` next to itself, so copy it to a folder outside the repo before running it. The Fixed queries section below replaces its query list.
- **Preview data and tools (a new chat has no scratchpad from this one):**
  - The data files (`data-D6B0E21AF503CBDA.js`, `data-3065F15E98D3E8BD.js`, `data-D4D4D020199FC96E.js`) exist only in the artifact. Read them back with the Artifact tool (`action: "read_file"`, the artifact `url`, `path` = the file name), or regenerate them with `python3 -u build_preview_data.py <PlayFab IDs>` from a copy outside the repo.
  - To republish, publish `index.html` with the artifact `url` and a `files` map of only the changed files; files left out stay published. Map a published path to `null` to remove it.
  - Local preview: copy the page files and data files to a folder outside the repo, then add a temporary `.claude/launch.json` entry in `/Users/vertigo/Desktop/Code/Reflex` that runs `/bin/sh -c "cd <folder> && exec python3 -m http.server 8765 --bind 127.0.0.1"`. A plain `python3 -m http.server --directory` fails because the preview process cannot read the Desktop working folder. Delete the entry afterwards. The local page shows `Â·` (no charset, see step 4); the artifact does not.
  - Adding an icon: download `css/regular/rounded.css` and `css/uicons-regular-rounded-KDJ23353.woff` from `https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/` (ask Batuhan first). Find the code point in `.fi-rr-<name>:before{content:"\xxxx"}`, draw that glyph with fontTools through `TransformPen(SVGPathPen, (1, 0, 0, -1, 0, 300))`, and add it as `<symbol id="icon-<name>" viewBox="0 0 300 300">` to the sprite.
- **Prototype-only shortcuts the real build must replace:**
  - `build_preview_data.py` reads the TE endpoint and token from `~/.claude.json`. The server must read `TE_MCP_URL` and `TE_MCP_TOKEN` from `reflex/.env` through `load_dotenv()`, like `app.py`.
  - `preview-source.js` cuts the embedded `window.statsPolygunData[...]` by period in the page. The real page uses `static/source.js` (step 6), which calls the two endpoints in the API section and gets the same shapes. The preview keeps working: the artifact publishes `preview/preview-source.js` under the path `source.js`.
  - `data-*.js` files contain player data and are not git-ignored. Generate them outside the repo until step 7 adds `Stats Polygun/preview/data-*.js` to `.gitignore`.
- **Memory:** TE field notes live in the PolygonArena project memory (`pa-te-query-recipes.md`), which a chat started in the Reflex folder does not load. The Reflex project memory has a short pointer to this file.

## Task
Teammates on the office Wi-Fi open **Stats Polygun**, a page served from Batuhan's Mac, paste a PlayFab ID, watch the loading line, and see the player report built from fixed ThinkingData (TE) queries. Every player searched during the visit stays as a chip, so they can flip between players without waiting; a page refresh clears them. The server stores nothing.

## Decisions (2026-09-15)
- **Name:** Stats Polygun. **Logo** (from Batuhan, 2026-09-15): the clown, `prototype/logo.png` (1254 px transparent PNG). The page shows `logo-web.png` (160 px copy, cropped to the drawing) at 52 px, left of the two-row "Stats / Polygun" wordmark: in the top bar on the start screen, at the top of the rail once a player shows (round eight). Phones keep it in the top bar.
- **Engine:** fixed SQL queries. No Claude at search time.
- **Host:** a separate script in `reflex/Stats Polygun/`, running on the Mac, port **3800**. `app.py` (Slack bot) stays untouched.
- **Access:** anyone on the same Wi-Fi, no login. **Accepted risk:** guests or visitors on that network can look up any player's spending, device and country.
- **TE auth:** the current MCP token (it belongs to the shared TE account "Gizem"). Batuhan pastes it into `reflex/.env`; Claude never copies, prints or commits it.
- **Search:** PlayFab ID only (`^[0-9A-F]{16}$`).
- **Held players (evening):** the page keeps every player searched during the visit in page memory (a JavaScript `Map`; no localStorage, sessionStorage, cookies or hash). The "Preview accounts" row becomes the **Searched** row: one chip per held player, `name · ID`, in search order; the shown player's chip is pressed; the row is hidden while nothing is held. Clicking a chip shows that player from memory with no request: its Career group, the period it was last on, and every period already loaded for it. Typing an ID always asks TE again and replaces the held copy; that is how a player is refreshed. A chip click never fetches. No cap on held players: one player is well under 1 MB in memory (Career aggregates plus at most 300 matches of period rows). A refresh gives an empty page with the cursor in the search box.
- **Loading (evening):** one request in flight at a time on the page. While a search or a period loads, the search box, the Searched chips, the period picker and the strip are disabled, so a chip click cannot race a search. A search shows its progress in the status line under the search box, `Looking up 3065F15E98D3E8BD · career · 4 s`, then `· period · 12 s`; the previous player stays on screen until the new report is ready, then the page scrolls to the top. A period change dims the Period cards (`aria-busy`) and the picker summary line says `Loading Last 30 days · 3 s`; the scroll position stays. An error keeps whatever is on screen and shows the message in that same status or summary line.
- **Address (evening):** no `#ID` in the address bar and no auto-search on load. A link to a player cannot be shared; paste the ID instead.
- **One search at a time (evening):** the server runs one TE job at a time, a lock around both endpoints. A second search waits its turn while its page keeps ticking in the loading line; a wait longer than 120 s answers 503 "busy". The shared TE account never sees more than 2 queries at once.
- **Start:** by hand from `reflex/`, in the bot's `.venv` (`python-dotenv` is already in `requirements.txt`): `python3 "Stats Polygun/stats_polygun.py"`. No launchd entry until teammates ask for one.
- **Times:** every time is UTC+0. Convert the phone clock with `date_add('minute', -cast(round(coalesce("#zone_offset", 0) * 60) as integer), "#event_time")` and sort by that UTC value.
- **Sections, in two groups (2026-09-15):** player header and a two-row section menu first.
  - **Career (all time):** summary tiles, by mode and by map side by side, power gap results, weapons (kill totals), earnings & spending.
  - **Period:** period picker (career strip, buttons, dates), form, league points, KD per match, kills in each match, power & matchmaking (power gap per match, time to find a match), play time, upgrades & loadout, day by day, every match. Charts come before the long tables.
  - Notes close the page.
- **Icons:** one Flaticon UIcons icon (regular rounded, `@flaticon/flaticon-uicons` 3.3.1) before each group and section title: Career `id-badge`, by mode `gamepad`, by map `map`, power gap results `balance-scale-left`, weapons `target`, earnings `coins`, Period `calendar-clock`, form `list-check`, league points `trophy`, KD `skull`, kills in each match `bullet`, power & matchmaking `bolt`, play time `clock`, upgrades `level-up`, day by day `calendar-days`, every match `table-list`, notes `info`, card arrows `angle-small-down`. The glyphs are cut from the font into an inline SVG sprite in `index.html`, so nothing loads from a CDN. Free use needs a credit line; the notes say "Icons: Uicons by Flaticon".
- **Removed sections:** Missions & milestones, Ads & shop.
- **Strip + period (replaces the "last 100 matches" window):**
  - **Period picker (2026-09-15 revision):** right under the Period title: day options, match options, All time, then From/To date boxes and a summary line. All options count back from the player's last match, not from today.
    - **Day options** follow the career span in calendar days (first day to last match): more than 30 → Last 7 days, Last 30 days; 8–30 → Last 7 days, Last x days; 7 or fewer → Last x days.
    - **Match options** follow the career match count: more than 300 → Last 100 matches, Last 300 matches; 101–300 → Last 100 matches, Last x matches; 100 or fewer → Last x matches.
    - **Last N matches:** the page asks for whole days from the day of the Nth-last match (from the career day counts) and keeps exactly the last N matches for the match charts and tables. Play time, upgrades and day by day show those whole days.
  - **Career strip:** below the picker, always all time, one point per UTC day: league points at the end of the day (line), matches per day (bars) and version lines. Hovering shows the day; clicking a day makes it the period.
  - **Default period (evening revision):** All time when the career has 300 matches or fewer; otherwise Last 7 days when that period holds 300 matches or fewer; otherwise Last 100 matches. The page decides from the career day counts, so nobody opens on the 300+ note.
  - **Always all time (the Career group):** summary tiles (matches, win rate, KD, league points), by mode, by map, power gap results, weapon kill totals, earnings & spending. Upgrade and buy counts under "Spent on" come from the resources query. The balance tile shows the latest balance.
  - **Follows the period (the Period group):** form (and its streaks), league points, KD per match, kills in each match, power & matchmaking, play time, upgrades, day by day, every match.
  - **More than 300 matches in the period:** the per-match sections say "N matches in this period. Pick a shorter period or click a day on the strip." The battles, weapons and failed-search queries do not run. Play time, upgrades and day by day still load.
- **Time to find a match:** follows the period. One dot per match, a line for the typical time (median of the last 10 matches), and a summary comparing the first 10 and the last 10 matches of the period. A period never has more than 300 matches, so the one-dot-per-day mode was removed. Search time over the whole career is left out; add it only if teammates ask. The day-by-day table shows the median search time per day.
- **Cards (2026-09-15 revision, defaults as of round seven):** every section card opens and closes with an arrow at its top right. Open by default: all five Career cards, and form, league points, KD per match, kills in each match, power & matchmaking, play time, upgrades & loadout. Closed by default: day by day, every match. A closed card shows only its title. A card keeps its state for the visit when the period or player changes, and a section link opens its card. A chart in a closed card draws when the card opens. The tiles, the period picker and the strip always show.
- **League points marks (revised 2026-09-15):** wins are small plain dots sized to the match width (no ring), so 300 matches do not pile up. Losses and draws keep the ringed circles (4.5 px, 3.5 px when narrow), drawn on top of the wins.
- **League points axis:** fits the matches in the period instead of starting at 0. Only leagues inside that range get a band and label; round values label the axis when the range sits inside one league.
- **Labels on cut bars:** a number over a cut bar (KD above 12, power gap beyond ±50%) shows only when it has room; the tooltip still shows every value.
- **Weapons:** kills for every weapon; damage only for guns (Primary, Backup, Ranged, Support, Melee); no accuracy.
- **Power:** percent gap `(team − enemy) ÷ enemy`; results-by-gap buckets below −20%, −20% to −5%, −5% to +5%, +5% to +20%, above +20%.
- **Version markers:** match charts get a thin line and label at the first match on a new game version.

## API (added 2026-09-15 evening)
Both endpoints answer with `Cache-Control: no-store`. The TE token never leaves the server process.
- **Find by name (round nine):** `GET /api/find?name=<1 to 10 characters>` streams like the others and ends with `{"result": {"playfabId", "name", "shared"}}` or `{"error": "No player named <name>."}`. The name is checked on the server and its single quotes are doubled before it goes into SQL. The page then calls the two endpoints below with the found ID.
- **Progress lines (round eight):** after the input checks, both endpoints answer 200 `application/x-ndjson`, one JSON object per line: `{"waiting": true}` when another search holds the lock, `{"waiting": false}` when it is free, `{"done": n, "total": N}` after each TE query (all time: N = 6; period: N = 8 with matches, 4 without), then `{"result": <the payload below>}` or `{"error": "<message>"}`. Bad input (400, unknown path 404) still answers one JSON object with its status before any line. The lock is released before the result line. A page that closes mid-search makes the next line fail, which stops the rest of that search's queries. `static/source.js` reads the lines as they come and also accepts a plain JSON answer from a server started before round eight.
- `GET /api/player/<id>` runs queries 0–4 and returns the all-time part: `player`, `finalLeaguePoints`, `career` (`days`, `modes`, `maps`, `buckets`), `weaponTotals`, `resources`, `balances`. The page builds the career, the period options and the default period from it (those rules live only in `main.js`), then calls the period endpoint. The extra round trip costs milliseconds on the LAN and keeps the server stateless and free of period rules.
- `GET /api/player/<id>/period?from=YYYY-MM-DD&to=YYYY-MM-DD&matches=1` runs query 0 again (it needs the TE user id and date bounds), then queries 5–10 (`battleAfter` is its own one-row query, so 7 TE calls with matches, 3 without) and returns `battles`, `battleAfter`, `weapons`, `sessions`, `currencyDays`, `inventory`, `searchFails`. With `matches=0` (the page sends it when the period holds more than 300 matches) queries 5, 6 and 10 do not run: `battles`, `weapons` and `searchFails` are `[]` and `battleAfter` is `null`.
- Errors are `{"error": "<message>"}` (since round eight only 400 and the unknown path keep their status; the rest arrive as the last line): 400 bad ID or dates, 404 no player, 502 TE failed (the message carries TE's reason, or "cut off at 20,000 rows … too much data for one report"), 503 busy (waited 120 s for the lock, or TE stayed busy), 504 TE timeout. Every message is a complete sentence written by the server ("Try again." included where a retry helps), and the page shows it as it is; the page itself says "Stats Polygun is not reachable. Is the script running on the Mac?" when the request fails. `STATS_POLYGUN_ROW_LIMIT` lowers the row cap for a cut-off test only.
- Static files: `/` is `index.html`; other paths are served only from `static/` (the resolved path must stay inside it); text files are sent with `charset=utf-8`.
- The page caches period answers per held player by `from..to`, so a period seen once (or a strip day clicked before) shows again without a request.

## UX revision (2026-09-16, approved direction; build step 8)
Batuhan's note after the commit: the charts are right, the frame is weak. Career and Period do not read as two different things, and 15 section links in two rows are hard to use. Decisions from the 2026-09-16 popup: left sidebar + two zones, sticky compact period bar, card defaults unchanged, search stays in the top bar, searched players move into the sidebar. Core features, charts, data flow and the API do not change; the only files touched are `static/index.html` (CSS, markup, rail template) and `static/main.js` (rail rendering, scroll-spy). Rollback: `git checkout` of those two files.

- **Frame (960 px and wider):** `.page` becomes a two-column grid, `232px` rail + content. The top bar spans both columns and is sticky (round eight: no longer sticky; it scrolls away) (one compact row: 36 px logo, wordmark, search box, status line to its right), so a new ID can be pasted from anywhere on the page. The rail is sticky under the top bar, scrolls on its own when taller than the window. Content column keeps today's cards and charts, `max-width` 1100 px.
- **Rail, top to bottom:** **Players** (the held players as a vertical list, name on the first line and the ID in small mono on the second, the shown one marked with a filled dot and the accent border; replaces the "Searched" chip row), **Career · all time** (Totals, By mode, By map, Power gap results, Weapons, Earnings), **Period** with the current period label under the heading (Pick a period, Form, League points, KD, Kills in each match, Power & matchmaking, Play time, Upgrades, Day by day, Every match). The Period block in the rail carries the same tint as the Period zone, so rail and page match. The link of the section on screen is marked (`aria-current`) by an IntersectionObserver on the section headings; clicking a link still opens a closed card first (existing rule).
- **Zones:** the Career group stays on the plain ground with its neutral "All time" pill. The Period group sits in a tinted zone: a rounded block with an accent-tinted background (`--zone-period` token, light and dark) and a 1 px accent-tinted border, the group title in the accent colour, the period label pill as today. Nothing else changes colour, so the charts look the same.
- **Sticky period bar (removed in round seven; the bar now scrolls like a card):** inside the Period zone the compact bar (day and match buttons, From/To, summary line) sticks under the top bar while the Period cards scroll; the strip and its legend scroll away with the cards. On a phone it sticks at the top of the window.
- **Phones (under 960 px):** one column. The rail renders as wrapped rows at the top of the content (players row, Career row, Period row), not sticky, like today's chip nav. The top bar is not sticky there.
- **Unchanged:** every chart, table and card; card open/closed defaults and the per-visit memory; the loading and error states; the two API calls; the preview source. Section ids stay, so old links keep working; the scoreboard gets `id="totals"`.
- **Round two (2026-09-16, Batuhan's notes on the first build):** no tinted frame around the Period group after all; the Period title stays in the accent colour and the sticky bar keeps it apart. The rail's Career group is one link, "Career", with no section links under it; the Period group keeps its links. By mode and By map share one row height (the taller one sets it; a closed card keeps its own height). Weapons moves before Power gap results and the two sit side by side, Weapons left, Power gap right; Power gap has a fixed height (five buckets), Weapons takes exactly that height and scrolls inside its card under a sticky title (a closed Power gap card lifts the cap; on one-column widths Weapons takes its natural height). All five Career cards open by default; Period card defaults unchanged.
- **Round three (2026-09-16):** the rail is one system: PLAYERS (small label, the player list), then two heads in the page's title face at 20 px with their group icons, CAREER (jumps to the group) and PERIOD (jumps to the picker), and under PERIOD its nine sections as indented subheads with their own icons. No period label in the rail; both heads are ink, the head of the group on screen is full ink and the other is dimmed. "Pick a period" is gone as a link because the PERIOD head does that job.
- **Round four (2026-09-16), Earnings & spending:** the four tiles are now tabs (Soft currency earned, Hard currency earned, Chests and booster packs, Spent on) and one pane below shows the picked tab at a fixed 340 px height with its own scroll, so the card never changes height. Soft currency is picked by default. The soft and hard tabs show earned, spent and the current balance on the tile and the by-source list in the pane; the Battle pass points tile and the separate Balance tile are gone (balance moved onto the currency tiles). Files: `static/index.html`, `static/sections-account.js`. The artifact is no longer republished after version 16 (Batuhan's note).
- **Round five (2026-09-16), less text:** removed the rail note ("ThinkingData · all times UTC+0"), the Career lede, the strip's "Each column is one UTC day" sentence and its footnote, the League points lede after "Points after each match.", the "trial" sentence in Kills in each match, and the whole "How this report reads the data" section. The only line left at the bottom is the icon credit ("Icons: Uicons by Flaticon"), because Flaticon's free licence asks for it; the unused info icon left the sprite. Files: `static/index.html`, `static/main.js`.
- **Round six (2026-09-16):** the icon credit line is gone too (Batuhan's call; Flaticon's free licence asks for a credit, so this is a known gap). The top bar is centered: logo, wordmark, search box (540 px basis) and button sit as one group in the middle; the loading and error line shows centered under them and takes no space when empty.
- **Round seven (2026-09-18), DONE, approved in the popup (logo in both places).** Batuhan's five notes. Files: `static/index.html`, `static/main.js` only. Rollback: `git checkout -- static/index.html static/main.js` (both are clean in git now).
  1. **Cards:** Kills in each match, Power & matchmaking, Play time and Upgrades & loadout open by default. Day by day and Every match stay closed. The per-visit card memory does not change. Check: a new search shows the four cards open with their charts drawn.
  2. **Brand in the rail:** logo (52 px) and the wordmark in two rows (STATS / POLYGUN) at the top of the rail, above PLAYERS; the Preview badge moves with it. The rail shows from the start, so the brand is there before the first search; its three groups stay hidden until a player shows. Under 960 px there is no left bar, so the rail brand is hidden there and the top bar logo stays. Check: at 1280 px the brand sits at the top of the rail, on the empty page and after a search.
  3. **Top bar:** the wordmark text goes, the 36 px logo stays left of the search box, and the group stays centered. Check: the bar keeps its 64 px height.
  4. **Period bar not sticky:** the bar scrolls away with the page like a card (no `position: sticky`, no shadow). With it go the `--period-bar` measurement, its scroll offsets, and the phone rule that kept the period buttons in one sideways row (they wrap again). Check: the bar leaves the screen while the Period cards scroll; rail links still land right under the top bar; the marked rail link still follows the section on screen.
  5. **Back-to-top button:** a round button with an up arrow (the card arrow icon turned over, so no new icon) fixed at the bottom right. It shows after the page has scrolled one screen down, and it scrolls smoothly to the top (instantly with reduced motion). Check: hidden at the top, shows after one screen, a click lands at the top, it works from the keyboard, light and dark.
  - **Reading of the notes:** "move logo and wordmark to the rail" plus "in the header, remove the text, leave the logo" means the logo shows twice: in the rail with the wordmark, and alone in the top bar. Batuhan confirmed this.
  - **Found while testing:** the stuck rail sat flush under the top bar, so the logo touched the bar's line. The rail now sticks 16 px under the bar (`top: calc(var(--topbar) + 16px)`), the same as the row gap.
  - **Result (against the real server on port 3801):** empty page shows the rail brand and the top bar logo only. `D6B0E21AF503CBDA` gives 69 matches, 64%, KD 2.48, 1,144. The four cards open with their charts drawn; Day by day and Every match closed. Period bar `position: static`, no shadow, it leaves the screen on scroll. All nine Period links and the two heads land 24 px (Period cards) or 16 px (heads) under the 64 px top bar, and the marked link follows each jump (the pane was hidden, so `requestAnimationFrame` ran late; wait about 1.5 s per check). Back-to-top: hidden at the top, shows after one screen, a click lands at `scrollY` 0 and hides it. Dark theme checked. At 375 px: no horizontal scroll, rail brand hidden, top bar logo centered over the search box, period buttons wrap. No console errors. The pane's `key Enter` sends an empty key name; type `\n` to submit the search in a test.
- **Round eight (2026-09-18), DONE, approved in the popup (option A, info chip with text).** Batuhan's three notes. Callers checked with grep and full reads (the Reflex repo is not in the code graph): `SP.source.allTime` and `SP.source.period` are called only from `main.js` (`search`, `setPeriod`); `run_all` only from `all_time` and `period`; the lock only from `handle_api`.
  1. **Brand follows the first player:** the start screen has no left bar; the top bar shows the 52 px logo and the two-row wordmark next to the search box. When the first player's data has come, the left bar shows with the brand at its top, and from 960 px up the top bar keeps only the search box (a CSS `:has()` rule on the shown rail, no JS). Under 960 px there is no left bar, so the top bar keeps the brand. The rail is hidden again until a player shows, as before round seven. Check: 1280 px empty page: brand in the top bar, no rail; after a search: brand only in the rail; 375 px: brand in the top bar before and after.
  2. **Top bar not sticky:** it scrolls away with the page; the rail still sticks, 16 px from the window top. `--topbar` and `measure()` go, because the bar never sticks now; the anchor offsets (16 px, 24 px in the Period zone) and the scroll-spy line (40 px) become fixed values. Check: the top bar leaves the screen; rail links land 16 to 24 px from the top; the marked link follows.
  3. **Loading bar with an "in line" signal.** Options:
     - **A. The server reports each step (recommended).** Both API answers become JSON lines: `{"waiting": true}` while another search holds the lock, `{"waiting": false}` when it is free, `{"done": n, "total": N}` after each TE query, then `{"result": ...}` or `{"error": "..."}`. The page reads the lines as they come. Real progress, a real "in line" signal, no extra requests, the server still keeps nothing. Bad input still gets its 400 answer before any line. Errors after the first line come as the last line, not as an HTTP status; the page shows the same messages. The lock is released before the result is sent, and a page that closes mid-search stops the rest of its queries.
     - **B. Status checks.** The page asks `/api/status` every second while it waits; the server keeps an in-memory table of running and waiting searches. The answers keep their shape, but there are more parts: a shared table, cleanup, extra requests.
     - **C. A guess from time.** The bar fills by elapsed time against a typical search. No server change, but it is not real progress and it cannot know "in line".
     - **With A:** a search fills one bar under the search box: the career answer the first half, the period answer the second half. A period change fills the same kind of bar under the period summary. The "Looking up ... · career · 4 s" text stays above the bar. In line: the bar stops and an info note says the search is in line; it goes when the search starts. The info icon comes back from the `e473fba` sprite, so nothing is downloaded. The 120 s wait limit and its message stay. `preview/preview-source.js` needs no change (it ignores the progress callback).
     - **Live page:** `static/` is live on reload, but the running server on port 3800 keeps the old Python code until Batuhan restarts it. So `source.js` also accepts a plain JSON answer (no bar until the restart), and the live page does not break in between.
     - **Files:** `stats_polygun.py`, `static/source.js`, `static/main.js`, `static/index.html`.
     - **Blast radius:** Scope: the shape of both API answers, the lock handling, the page's loading states. Impact: any other client of the API would break (none is known; `curl` checks now read lines); a stream that breaks mid-way shows "not reachable" and keeps the old player. Rollback: `git checkout -- "Stats Polygun/stats_polygun.py" "Stats Polygun/static/"`, then restart the server.
     - **Check:** a search fills the bar in steps from 0 to 100%; a period change fills its bar; a `curl` search for `D4D4D020199FC96E` holds the lock while the page searches `D6B0E21AF503CBDA`: the page shows "in line" with the bar standing still, then fills it; unknown ID, bad ID and a stopped server still show their messages; the old server on port 3800 still answers the new page.
  - **Result (against the new server on port 3801, 2026-09-18):** `curl -N` shows one line per query about a second apart, then the result; headers `application/x-ndjson` and `no-store`; a bad ID answers 400 JSON; an unknown ID ends with the error line. Two `curl` searches at once: the second printed `{"waiting":true}` at once, `{"waiting":false}` 12 s later when the first released the lock, then ran. In the page: the search bar went 8, 42, 56, 63, 69, 81, 94% and closed; behind a blocking search the chip "In line · another search runs first" showed for 6.5 s with the bar at 0, then the bar filled. A period change filled its own bar (one TE query stalled 13 s; TE latency, not the page). Start screen at 1280 px: brand in the top bar, no rail; after a search: brand only in the rail. At 375 px the top bar keeps the brand, no horizontal scroll. The top bar scrolls away; the rail sticks at 16 px; rail links land at 16 or 24 px and get marked (Day by day and Every match land lower when a short period leaves too little page below them; that was already so). Unknown and bad IDs show their messages and keep the old player. Killing only the server while the page waited in line gave "not reachable" at once. The new page against the old server on port 3800 (started 15:36, before the Python change): search done in 4.5 s, no bar. Dark theme checked. No console errors.
- **Round nine (2026-09-18), DONE, approved in the popups.** Batuhan's six notes. Decisions after the plan: the name rule is Batuhan's own (**10 characters or fewer is a name, exactly 16 is a PlayFab ID, anything else gets a warning**); the loading text is "Reflex is looking up your data"; Batuhan said names are unique, and TE mostly agrees (below), so there is no pick list: a shared name opens the closest match and a note says how many share it. The live server was restarted at 15:57, after the round-eight Python change, so the loading bar is live; round nine adds a server route, so it needs one more restart.
  1. **Search box text left-aligned.** The input also stops forcing upper case on screen, so a typed name shows as typed; IDs are still upper-cased in code.
  2. **Search by player name.** (Planned as "under 10 characters is a name"; changed to Batuhan's rule above after the TE check.) Options:
     - **A. A separate find step (recommended).** New `GET /api/find?name=<name>`: one TE query on `ta.v_user_4`, `lower(user_name) = lower('<name>')` (any case, whole name only), most recently active first, at most 10 rows plus the total count. It uses the same lock and progress lines as the other calls. The page then does the same job as an ID search with the found ID. One extra TE query, about 1 s. The career and period calls do not change.
     - **B. Resolve the name inside the career call.** `/api/player?name=<name>` looks up by name in the first query. Saves about 1 s, but one endpoint does two jobs and the several-players case has to come back as an error with data.
     - **C. Keep a name list in the server.** Fast, but stale, and the server would keep data, which breaks "the server stores nothing".
     - **Safety (any option):** the server checks the name again (1 to 9 characters, no control characters) and doubles single quotes before the name goes into SQL, so a name cannot change the query.
     - **With A (built):** the find returns one account: the same spelling first, then any case, then the one who played last, plus the count of accounts with that name. The search goes on as an ID search and the box then shows the ID. No match: "No player named <name>." A shared name leaves the note "N players share the name X; this is the closest match. For another one, search by PlayFab ID." under the search box. `preview/preview-source.js` gets no find (the artifact is frozen).
     - **TE check (2026-09-18, `ta.v_user_4`, accounts with a name and a PlayFab ID):** 5,394,358 accounts. Names are at most 10 characters (players active in the last 30 days); 81% of those active players have exactly 10. Names under 10 characters: 984,422 accounts, 339 names shared (86 with the same spelling), at most 23 accounts on one name, and that one is three spaces. 10-character names: 4,010 are shared by about 3.96 million accounts, up to 1,152 on one name, so they look like default names; for those the name search is a guess and the note says so. No name is 16 hex characters.
  3. **Remove the period label** ("Last 7 days · Sep 12 – Sep 18, 2026") right of the PERIOD title, with its CSS and the JS that filled it. The summary line in the period bar keeps the same text.
  4. **Show which period is picked.** Root cause: since the 2026-09-16 redesign the picker lives in `#period-top`, but `renderPeriod` still looks for the buttons in `#player-top`, so no button ever gets `aria-pressed="true"`. Fix the lookup, and make the picked button a filled accent chip. When the period is a hand-picked range (From/To, or a day clicked on the strip), no button is picked; the From/To boxes get an accent border instead.
  5. **Favicon:** `<link rel="icon">` to `logo-web.png`.
  6. **Loading text:** "Reflex is looking up your data · 4 s" for a search (the ID and the career/period word go; the bar shows the stage). The period change keeps "Loading Last 30 days · 3 s".
  - **Files:** `stats_polygun.py` (find route), `static/index.html`, `static/main.js`, `static/source.js`. Blast radius: one new read-only route; the name is checked and quoted on the server. Until Batuhan restarts the server, a name search says "Unknown API path."; ID search keeps working. Rollback: `git checkout` of the four files, then restart.
  - **Check:** a name search (`Mubatu`, then the same name in other case) opens that player and the box shows its ID; an unknown name says so; a name that several players share behaves as decided; `x'y` and names with spaces do not break the query; ID search is unchanged; the picked chip is clearly marked for every preset, and the From/To boxes are marked for a hand-picked range and for a strip day; the favicon shows in the tab.
  - **Result (against the new server on port 3801, 2026-09-18):** `curl` on `/api/find`: `Mubatu` and `mubatu` give `D6B0E21AF503CBDA`, `BÖRÜ 07` gives `D4D4D020199FC96E`, `x'y` and `zz' or 1=1` answer "No player named …" (the quote cannot change the query), an empty name and 11 characters answer 400. In the page: `mubatu` opened Mubatu in 4.8 s and the box showed the ID; a name shared by 6 accounts opened the closest match with the note; an unknown name kept the old player with its message; 12 characters gave the warning; a lower-case 16-character ID opened BÖRÜ 07. The loading line reads "Reflex is looking up your data · 0 s". Before the fix, All time was on and no preset had `aria-pressed` (reproduced); after it the pressed chip is filled accent and follows Last 7 days, Last 100 matches and back; From/To and a strip-day click leave no chip pressed and mark the date boxes and their labels in accent. The PERIOD title has no label. The input is left-aligned and not upper-cased. `logo-web.png` is the favicon (200, `image/png` on port 3800). No console errors.
- **Round ten (2026-09-18), DONE, approved in the popup (period change also Turkish; log shows the address).** Batuhan's two notes. The live server was restarted at 16:14, after round nine's Python change, so name search is live. This round changes Python again, so it needs one more restart.
  1. **Turkish loading texts:** the search line becomes "Reflex verileri getiriyor · 4 s" and the in-line chip "Şu anda sıradasınız". These spans get `lang="tr"`, because the page is `lang="en"` and a screen reader would otherwise read them with English sounds. The period change line depends on the question below. Server messages and the rest of the page stay English.
  2. **Search log in the server console:** one line per API call, printed by `stream_job` when the call ends: local Mac time, the teammate's Wi-Fi address (if chosen), what was asked (`find "Mubatu"`, `career D6B0E21AF503CBDA`, `period D6B0E21AF503CBDA 2026-09-12..2026-09-18`), then `OK`, `FAILED` with the server's message, or `STOPPED` when the page closed first, and the seconds. A name search shows 3 lines (find, career, period), an ID search 2, and a period change 1. Nothing is written to disk; the lines stay only in the terminal. Raw request lines and static files stay quiet.
     - **This reverses a privacy rule** (success criterion 5, 2026-09-15: "no logging of IDs or results"): from now on anyone who can see the Mac's terminal sees which players were looked up, and by which address.
  - **Files:** `static/main.js` (texts), `stats_polygun.py` (log). Rollback: `git checkout` of both, then restart.
  - **Check:** the page shows both Turkish texts (the chip behind a blocking search); on port 3801 the console prints the right lines for a name search, an ID search, a period change, an unknown name and a page closed mid-search.
  - **Built:** `ticker(element)` owns the one Turkish text for search and period change; the progress bar's accessible name is "Yükleniyor". `stream_job(job, what)` prints the line; the unused `import sys` went with the old "search failed" print.
  - **Result (port 3801, 2026-09-18):** `curl` calls printed, for example, `16:22:54  127.0.0.1  find "Mubatu"  OK 1.1 s`, `career D6B0E21AF503CBDA  OK 4.5 s`, `period D6B0E21AF503CBDA 2026-04-03..2026-04-09  OK 5.4 s`, `find "nobody-xq"  FAILED 1.0 s  No player named nobody-xq.`, `career 0000000000000000  FAILED 0.6 s  No player found for 0000000000000000.`, and a `curl --max-time 1` on a heavy period gave `STOPPED 8.2 s  the page closed before the answer` (the server notices at its next progress line and skips the rest of the queries). In the page, behind a blocking search: "Reflex verileri getiriyor · 1 s" and the chip "Şu anda sıradasınız", both `lang="tr"`; the name search printed 3 lines (find waited 15 s in line, so its seconds include the wait) and a period change printed 1 with the Turkish text in the period bar. Teammates show their Wi-Fi address; local tests show 127.0.0.1. No console errors.
- **Round eleven (2026-09-18), DONE, approved in the popup.** Batuhan's note: a fifth top tile with the player's VTD, "like $100".
  - **Source (checked in TE, 2026-09-18):** user property `vtd` on `ta.v_user_4` (propId 504; the event property 533 has the remark "Value to date"). It is the player's purchase total in US dollars: each purchase event carries `vtd_addition` in dollars (for example +4.93 for a 219.99 local-currency `price`), and the team's churn notes use it the same way ("Purchaser = vtd > 0, Whale+ = vtd > 100"). Test accounts: Mubatu 0, `3065F15E98D3E8BD` 0, BÖRÜ 07 589 (its latest event says 589 too). Caveat: BÖRÜ 07's `webshop_purchase` rows carry `vtd` up to 609, so the user value can trail the web shop; the tile shows the user value, as the team's TE dashboards do.
  - **Server:** `player_row` also selects `vtd` (one more column in the query that already runs, so no extra TE time); `all_time` returns it as `vtd`.
  - **Page:** a fifth scoreboard tile, "VTD": whole dollars (`$589`, `$1,234`), `–` when TE has no value; sub line "Value to date, USD". Five columns from 960 px up; the tile numbers size themselves to the tile width (CSS container units), so long numbers such as `26,600` league points still fit at 1024 px; on phones two columns, with the VTD tile across the last row.
  - **Files:** `stats_polygun.py`, `static/index.html`, `static/sections-matches.js`, `static/main.js`. Needs a server restart for the value; until then the tile shows `–`.
  - **Check:** Mubatu `$0`, BÖRÜ 07 `$589`; no number overflows its tile at 960, 1024, 1280 and 1440 px, and at 375 px.
  - **Result (port 3801, 2026-09-18):** Mubatu `$0`, BÖRÜ 07 `$589` (LP 20,548), no extra TE time (career 1.5 s and 11.1 s, as before). Fit check with `34,278`, `26,600` and `$12,345` put in the tiles: nothing spills at 960 px (numbers 24 px, the widest 83 of 85 px), 1024 px (24 px), 1280 px (35.7 px), 1440 px (42.9 px) or 375 px (34 px, VTD across the last row, no horizontal scroll). At 960 to 1024 px the numbers are 24 px, down from 44 px, because five tiles share the row. No console errors.
- **Dropped connections (2026-09-18, after round eleven):** Batuhan's console showed a `ConnectionResetError` traceback from `192.168.31.188` inside Python's own `handle_one_request` (the device opened a connection and reset it before sending a request; browsers do this with spare connections). Harmless, but noisy next to the round-ten search log. `Handler.handle` now ignores `ConnectionError`. Checked on port 3801: the unchanged server printed the traceback for one reset connection; the fixed one printed nothing for two; the page and a name search still work and log.
- **Short PlayFab IDs (2026-09-18):** Batuhan: "some accounts have 15-character PlayFab IDs". TE (`ta.v_user_4`, `#account_id`) shows IDs are hex numbers without leading zeros: 16 characters 5,131,784 accounts, 15: 321,349, 14: 19,902, 13: 1,180, 12: 83, 11: 5 (plus three odd non-hex ids of 32 to 39 characters). So the page and the server accept 11 to 16 hex characters, not only 15; names are at most 10, so the two never overlap. 384 of the 16-character ids are not upper-case hex in TE, and the upper-cased search misses them (known gap). Checked on port 3801: a 15-character ID typed in lower case and a 14-character ID open their players (default names like "Player-B5E", which also explains the shared 10-character default names), a 16-character ID still works, 13 letters get the warning. No console errors.

## Version translator rules
The server (in the prototype: `buildReport` in `core.js`) turns old and new events into one shape.
- **What counts as a match:** any mode except `TutorialMap`, `Tutorial*` and `TrialMap`, with `end_reason` `Success-objective` or `Success-timeout`. `Disconnect` and `EarlyExit` rows are marks on the league point chart, never matches, even when the row says Victory or Defeat.
- **League points:** `battle_end.league_point` is logged before rewards. The after value is the next `battle_end` row's value; after the last match it is the profile `league_point`. For the last match of a period, it is the first `battle_end` row after the period (or the profile `league_point` when there is none).
- **Human player counts:** from `battle_start` (joined by `match_id`), falling back to `battle_end`.
- **Deathmatch:** the score is hidden because both sides always log the same score.
- **Trial or rented characters:** `equipped_character.lvl = 0`; show "trial".
- **Header:** OS, device and country from the latest `login`/`battle_end` event (`#os`, `#device_model`, `#country_code`), never from the profile.
- **Upgrades:** only `upgrade` rows give levels. On `boost`, `equip_trial`, `rent`, `buy`, `unlock` rows show a level only when it is above 0. `equip` levels are ignored.
- **Unknown names:** modes, maps, sources and items without a label show a readable version of the raw id.
- **Missing data:** a chart with no data says so instead of breaking.

## Fixed queries
Every query filters `"#user_id" = <id>`. All-time queries use `"$part_date" between <created_time − 2 days> and <last_login_time + 2 days>` (from `ta.v_user_4`). Period queries use the period's days with 1 extra day on each side, then keep rows whose UTC time is inside the period. Queries 2 and 3 are new; the rest are in `prototype/build_preview_data.py`.

**All time, once per search (`/api/player/<id>`).** The page uses the career day counts to pick the default period and to decide whether the period's match queries run.
0. **player:** `ta.v_user_4` by `"#account_id"` → `#user_id`, `user_name`, `league_point`, date bounds. No row means "No player found".
1. **meta:** first and last seen (UTC), latest `#os`, `#device_model`, `#country_code`, game versions played.
2. **career:** real matches from `battle_end` in one scan, `group by grouping sets ((day), (game_mode), (map), (power bucket))`: count, wins, losses, kills, deaths, first and highest `league_point`, last game version. Draws = count − wins − losses. It feeds the strip, the summary tiles, by mode, by map and results by power gap. Cast power to `double` before dividing.
3. **weapon totals:** `match_end_weapons` unnested over real matches, grouped by weapon: kills, matches used, seconds, gun damage.
4. **resources:** `resource_earn`/`resource_spend` unnested `resources (item_id, item_name, item_type, quantity, final_amount)`, grouped by event, source, item type and item. Also the latest `final_amount` and its UTC day for soft and hard currency (`balances`, the Career balance tile).

**Period, on search and on every period change (`/api/player/<id>/period`).** Queries 5, 6 and 10 are skipped when the page sends `matches=0` (more than 300 matches in the period).
5. **battles:** `battle_end` rows in UTC order, left-joined to `battle_start` (start player counts) and `battle_search` success (`elapsed_time`) by `match_id`, plus the first `battle_end` row after the period.
6. **weapons:** `match_end_weapons` unnested as `(id, name, category, lvl, power, kill_count, use_seconds, accuracy, boost_type, total_damage)`, only entries with kills or use.
7. **sessions:** `ta_app_end` end time (UTC) and `#duration`.
8. **currency per day:** soft and hard currency earned, spent, and last `final_amount` per UTC day.
9. **inventory:** `inventory` rows (UTC time, action, item, category, rarity, level before and after).
10. **failed searches:** `battle_search` with `action = 'fail'`; a fail with `User clicked cancel button` is a cancel, not a failure.

## TE MCP call notes (verified 2026-09-15)
- **Endpoint:** the `te-mcp-analysis` URL; auth is a single `mcp-token` header. Send `Accept: application/json, text/event-stream`.
- **Handshake:** JSON-RPC `initialize` → `notifications/initialized` → `tools/call` with `name: "query_adhoc"`. Answers are plain JSON; no session id is needed.
- **Arguments:** `projectId: 4`, `modelType: "sql"`, `qp` = JSON string `{"eventView":{"requiredEvents":["login"]},"events":{"sql":"..."}}`, `requestId: "mcp_" + 32 lowercase hex`, `limit` up to 20000, `timeoutMinutes`.
- **The SQL must end with `limit N`**, or the call fails with `SQL_LIMIT_REQUIRED`.
- **Concurrency:** more than about 2 queries at once fail with "User concurrency limit exceeded". Run at most 2 at a time and retry with a short backoff. The server lock (one search at a time) keeps the whole page inside that limit.
- **Timeouts:** a long date range returned HTTP 504. Keep the date bounds, and call `cancel_query` with the same `requestId` when a query fails or times out. TE's gateway is flaky under load: on 2026-09-21 the same query failed and then succeeded minutes apart, so `run_sql` retries a 5xx or a dropped connection 3 times with a 3 s and 5 s backoff. The heaviest query for a long-lived account is `resources`: `78B1873A148C6D3D` (NXGHTMARE7, 268 days, 6,820 matches) unnests 90,814 resource rows and has timed out three tries in a row during a TE load spike.
- **Row cap:** results stop at 20,000 rows. A very active player's weapon rows can hit that; aggregate in SQL or split by month if it happens. `D4D4D020199FC96E` (3,137 matches, 5.5 months) returned 9,846 weapon rows, about half the cap.
- **Speed:** one player took 4–18 s for the fixed queries. `D4D4D020199FC96E` took 17.2 s (17.9 s end to end, 2 queries at a time): player 0.6, meta 2.4, battles 7.4, weapons 5.6, sessions 1.6, resources 5.1, currency days 5.8, inventory 2.2, failed searches 1.7. Its data is 1.6 MB.
- **Speed, strip + period (same player, 2026-09-15):** career 5.2 s (180 rows), weapon totals 5.8 s (55 rows), battles for the last 7 days 2.1 s (242 rows), weapons for the last 7 days 1.4 s (676 rows). Estimate, not measured end to end: about 14 s for the first open and about 5 s per period change. The second round trip of the API adds milliseconds, not seconds.
- **Preview data refresh (2026-09-15):** the builder ran the three players in 27.5 s (Mubatu 6.3 s, MubatuNew 4.4 s, BÖRÜ 07 16.1 s). Only MubatuNew had new matches (11 → 14, league points 405 → 462). Rows with equal sort keys can come back in a different order between runs.

## Success criteria (status 2026-09-15 night)
1. From a second device on the same Wi-Fi, `http://<mac-address>:3800` loads the page. **Pending Batuhan** (the page was opened at `http://192.168.31.95:3801` from the Mac itself; pre-build test 2 reached the phone on port 3800).
2. Searching `D6B0E21AF503CBDA` (old builds) shows 69 matches, 44–22–3, KD 2.48, league points 1,144, soft currency earned 303,285. **Done** (tiles checked in the page; resources rows identical to the preview data).
3. Searching `3065F15E98D3E8BD` (v1.5010) matches the preview artifact. **Done with drift:** the server answers with one more match than the artifact's data (played after the refresh); every older row is identical.
4. An invalid ID is rejected before any TE query. An unknown ID shows "No player found". **Done.**
5. The server keeps nothing: no disk writes, no cache, no logging of IDs or results. The token never reaches the browser. **Changed in round ten (2026-09-18, Batuhan's call): the console now prints one line per API call with the teammate's address, the searched name or ID and the outcome; still nothing on disk.** Before that: **Done** by construction and checked: console shows only the start line, every response carries `Cache-Control: no-store`, the token lives only in the server process.
6. The Slack bot still starts and works as before. **Not run.** `app.py` and its dependencies are untouched (the diff adds new files and appends to README, `.env.example`, `.gitignore`).
7. Searching `D4D4D020199FC96E` opens on its last 7 days of play (220 matches). Picking All time shows the 300+ note and sends `matches=0`, so no battles, weapons or failed-search query runs. Changing the period sends one period request. **Done.** The Last 100 matches fallback was exercised in the preview with the limit lowered to 200, not with a real 300-in-7-days player.
8. Held players: search two IDs, two chips; clicking the first shows its report at once, on the period it was on, with no request; typing an ID again sends one new request and replaces the chip in place; a refresh gives an empty page with no chips and no request. **Done.**
9. Loading: from Enter to report, the status line ticks and every control is disabled. Stopping the script shows the "not reachable" message and keeps the previous player on screen. **Done.**
10. Two searches at the same time: the second waits, both succeed, and the server console never shows "User concurrency limit exceeded". **Done with two parallel requests from the Mac**, not from two devices.

## Build steps
4. **Page first, in the artifact. DONE 2026-09-15 evening (artifact version 12).** Move `prototype/` to `static/` (page files) and `preview/` (`preview-source.js`, `build_preview_data.py`, `logo.png`).
   - `main.js`: `SP.source.allTime` and `SP.source.period` return promises; `show()` splits into `search(id)` (fetch, replace the held copy, render) and `switchTo(id)` (render from memory); a `Map` of held players, each `{ allTime, career, options, period, periods }` where `periods` caches period answers by `from..to`; the Searched row; the loading and error states; the default period rule; scroll to top on a player switch. Drop `SAMPLES`, the hash and `SP.source.has`.
   - `index.html`: `<meta charset="utf-8">` and `<meta name="viewport" content="width=device-width, initial-scale=1">` first (the artifact adds both on its own, but Python `http.server` sends no charset, so a local test on 2026-09-15 showed `Â·` instead of `·`, and without the viewport meta a phone renders the page at 980 px; the JS files follow the page's charset); one `<script src="source.js">` in place of the three data scripts and `preview-source.js`; the Searched row markup (`#searched`, hidden while empty); the `#badge` pill, filled from `SP.source.badge`; the `aria-busy` style.
   - `preview/preview-source.js`: same interface, async. It loads `data-<id>.js` by inserting a script tag on first use, so the preview shows a real loading state, and lists its three IDs as `SP.source.samples`; `main.js` pre-searches those at start and shows the first. A search for any other ID says the preview holds only these three.
   - Publish as version 12: `static/index.html` with the artifact `url` and a `files` map of the changed static files, `"source.js": "preview/preview-source.js"` and `"preview-source.js": null`. The data files stay published untouched.
   Check: all three accounts look the same as version 11; chips switch with no reload and keep their periods; the loading line shows while `D4D4D020199FC96E` loads; the "not reachable" and "No player found" states can be forced from the console; a refresh clears the chips.
5. **Server. DONE 2026-09-15 night.** (`reflex/Stats Polygun/stats_polygun.py`, `ThreadingHTTPServer` from `http.server`, bound to `0.0.0.0:3800`, no new dependency). Reads `TE_MCP_URL`, `TE_MCP_TOKEN` and `STATS_POLYGUN_PORT` through `load_dotenv()` like `app.py`. Serves the API section above. Inside the lock, TE queries run 2 at a time, retry once with a short backoff, and `cancel_query` runs on failure. A query that returns exactly as many rows as its limit (20,000) was cut off: answer 502, never a partial report. Most queries sort oldest first, so a cut drops the newest rows, which are the matches the charts show; the fix for such a player is to aggregate in SQL or split by month. Privacy in the same step: `log_message` silenced (no IDs or results on the console), `Cache-Control: no-store` on every response, the token only in the server process, nothing written to disk.
   Check: `curl` totals for both test accounts match the preview data; a period request for `D4D4D020199FC96E` runs 6 queries, 3 with `matches=0`; with the row limit set to 100 for a test run, `D4D4D020199FC96E` answers 502 "cut off"; two `curl`s at once are served one after the other; the console shows no IDs; response headers carry `no-store`.
6. **Wire and test on the LAN. DONE from the Mac; the phone check is Batuhan's.** `static/source.js` is the fetch version of the source (same interface as the preview one). Start the script and run success criteria 1–10 from a phone or a second laptop. Served from the Mac, `BÖRÜ 07`, `·`, `–` and `→` must show correctly, and `D4D4D020199FC96E` must stay readable on Last 300 matches.
7. **Docs. DONE (reshaped 2026-09-16 on Batuhan's note: Stats Polygun is Reflex's seventh feature, not a separate thing).** In `README.md` (Turkish, like the rest): feature 7 in the intro list, a line in the Mimari paragraph, and "4. Stats Polygun'u başlat" under Kurulum: keys, start command, a test ID, the address, one search at a time, the Mac must be awake. `TE_MCP_URL`, `TE_MCP_TOKEN`, `STATS_POLYGUN_PORT` in `.env.example` (names only). `Stats Polygun/preview/data-*.js` in `.gitignore`.
   Check: a fresh start from the README works.
8. **UX revision. DONE 2026-09-16, rounds two and three the same day (artifact version 16).** (see the section above) `index.html`: tokens `--zone-period` (light and dark), the grid frame, the compact sticky top bar, the rail template (players list, the two link groups), the Period zone wrapper, the sticky `.period-bar`, the phone layout. `main.js`: render the rail from the held players and the current period (replaces `renderChips`), mark the current section with an IntersectionObserver, keep everything else. Then republish the artifact (version 14) and check on the LAN server.
   Check: at 1280 px the rail stays put while the page scrolls and the marked link follows the section on screen; the period bar stays visible while the League points chart scrolls; the Period zone is visibly tinted and the Career zone is not; at 375 px there is one column, no horizontal scroll, and the rail links still jump; chips, loading, errors and card memory behave exactly as before (success criteria 8 and 9 re-run).
   Result (2026-09-16, against the real server on port 3801): at 1280 px the top bar is 64 px and sticky, the rail sticks under it, the period bar sticks 8 px under the top bar, anchor jumps land below the bar, the marked link follows (Totals at the top, then League points, Day by day, By map, Power & matchmaking as clicked), dark theme checked, no console errors. Phone layout checked once at 375 px (one column, rail rows above the name, no horizontal scroll, bar sticky at the top) before the pane's viewport emulation went flaky; the phone check on a real phone is Batuhan's. Two things found on the way: (1) `index.html` has no doctype (the artifact host adds one), so the Mac's server rendered it in quirks mode (a 15 px form margin, other UA quirks); `stats_polygun.py` now serves `/` as the file with `<!doctype html><html lang="en">` in front. (2) chips could wrap to two lines in a narrow bar; `.chip-button` is `white-space: nowrap` and on phones the preset row scrolls sideways instead of wrapping.

## Evidence behind the rules
- **Pre-build test 1 (TE from Python): passed.** One lookup took 1.2 s.
- **Pre-build test 2 (Wi-Fi reach): passed.** `http://192.168.31.95:3800` opened on Batuhan's phone.
- **Pre-build test 3 (event freshness): done** through a fresh v1.5010 account (`3065F15E98D3E8BD`) and an audit of real players.
- **Real-player audit, v1.5010 (samples from 2026-09-13/14; only v1.5010 has real traffic, 45–97k players a day):**
  - Disconnect rows keep `nth_round` the same 98% of the time and early exits 73%. The league point penalty is median −20, down to −40.
  - League points per result: win median +30, loss median −4, draw median +28.
  - New modes `Heist` and `Push` (score agrees with result).
  - `battle_start` exists for 99.7% of matches. End counts drop leavers in 13%.
  - Weapon kills add up to `kill_count` in about 96% of matches. Damage is 0 for Unique specials, grenades and abilities. Accuracy reaches 500.
  - `country` is empty on 96–97% of profiles on every version; OS and device fill in later for 99.9% of new accounts.
  - Nothing the report uses is missing on v1.5010.
- **Matches per player (players active in the 7 days before 2026-09-15, `total_matches_v2`, which includes tutorial matches):** 289,728 players. Median 13, 90% at 91 or fewer, 99% at 748 or fewer. More than 100: 25,678 (8.9%); more than 300: 7,767 (2.7%); more than 1,000: 2,044; more than 6,000: 147; more than 20,000: 9; the most: 34,278. This is why the window became a period: a fixed "last 100" hides nothing for 91% of players, and loading every match cannot work for the heaviest ones.
- **Preview findings:**
  - The test phone switched time zone mid-session (UTC+8 to UTC+3), which is why sorting must use UTC.
  - Power moved from a 120–290 scale (February builds) to about 1,300–1,500, which is why the gap is a percent.
  - The profile `league_point` is the value after the last match.

## Blast radius
- **Scope:** one new folder and one new process on the Mac. It only reads TE, with the shared MCP token.
- **Impact:** player data is visible to anyone on the Wi-Fi. Each search runs up to 11 TE queries, and each period change up to 6. All activity shows under the TE account that owns the token. If that token changes, the page stops working. The server runs one search at a time, so a second teammate's search or period change waits behind the first (about 15 s at most for a heavy player), and anyone else using the TE account can still make a query fail. In the browser, each held player takes well under 1 MB and is freed on refresh.
- **Rollback:** stop the script (Ctrl+C) and delete `reflex/Stats Polygun/`. Nothing else changes.

## Open questions
- **TE keys:** `reflex/.env` still has no `TE_MCP_URL` / `TE_MCP_TOKEN`; the script refuses to start until Batuhan pastes them.
- **Artifact check:** open version 13 once and confirm the three chips load (the preview inserts `data-<id>.js` script tags at run time; this session could not open the artifact).
- **Stable address:** the Mac's Wi-Fi address can change (it did: `192.168.31.95` on 2026-09-15, `192.168.31.116` on 2026-09-18). Try `http://<mac-name>.local:3800` (Bonjour) from a teammate's device, or ask for a fixed address on the router.
- **Mac awake:** the page is up only while the Mac is awake and the script runs. Check that the existing wake and caffeinate setup covers office hours; otherwise the page is down whenever the Mac sleeps.
- **Git:** commit and push to `BatuVertigo/reflex` only when Batuhan says so.

## Match search (built as Stats Polygun 2, 2026-09-21 to 09-23; merged 2026-10-14)

### Task

Add a match report to Stats Polygun: paste a `match_id` from
`#community-feedback_polygun-arena`, get everything TE holds about that match on one page.
It lives in a duplicated server (`stats_polygun_2.py` + `static2/`) so the live page and the
live server on port 3800 cannot break.

### Success criteria

- `python3 stats_polygun_2.py` serves on port 3900 and never touches `static/` or port 3800.
- Every match ID shape seen in the channel resolves: `F-<uuid>`, `F-<uuid>_<hex>`,
  `F-SquadLocalMatch<PlayFabID><digits>`, `Unknown_<PlayFabID>_<n>_<digits>_<hex>`.
- No date input: the page finds the match from the ID alone.
- The 2026-09-21 "No weapon model in hand" report
  (`F-79b86f58-52d2-ff58-ab54-8df04d9d0000`) shows its two `spawn_error` rows, their reasons,
  ping and region, without anyone opening TE.
- The old player search (name / PlayFab ID) still works on the same page.

### What the data allows (checked against TE, 2026-09-21)

`match_id` is a column on `battle_end`, `battle_start`, `battle_search`, `player_left`,
`match_reconnect`. It is **not** on `error`, `reconnect_start/attempt/failed/success`,
`ta_app_crash`, `ta_app_bg_start`, `ta_app_end` — those are matched by
`#user_id` + a time window around the match instead, which is why the trouble timeline
covers a few minutes on each side of the match rather than the match alone.

TE only logs real players. `player_count`, `team_player_count` and `enemy_team_player_count` all count
**real players**, not slots, so the number of bots in a match cannot be worked out from TE at all. The page says
so instead of guessing: the tiles show how many real players logged the match and how they split across the two
sides, with the note "bots leave no events". An all-bot enemy team shows up as `0` real players on that side and
`0` enemy team power.

A locator query filtered by `match_id` alone, with no `$part_date` bound, answers in seconds
(probed on live TE). So the ID alone is enough; the partition days it returns then bound
every later query.

### Steps

1. `cp -R static static2`, `cp stats_polygun.py stats_polygun_2.py`. — verify: both trees exist.
2. Server: `STATIC = static2`, `PORT = STATS_POLYGUN_2_PORT or 3900`, `MATCH_ID` pattern,
   `match_detail()`, `/api/match/<id>`. — verify: `python3 -c "import ast; ast.parse(...)"` and a live call.
3. Page: `source.js` gains `match()`; `index.html` gains the match zone, template and rail group;
   `main.js` routes a match-shaped search; new `sections-match.js` renders it.
   — verify: load the page, paste the ID above, see the six panels.
4. Read the report against the Slack message it came from. — verify: the numbers agree.

### Queries (10, run 2 at a time like the rest of the app)

| Round | Name | Scope |
| --- | --- | --- |
| A | `match` | locator: partition days + first/last UTC time, `match_id` only |
| B | `ends` | `battle_end` rows — one per real player |
| B | `starts` | `battle_start` rows |
| B | `searches` | `battle_search` rows carrying this `match_id` |
| B | `leaves` | `player_left` rows |
| B | `weapons` | `match_end_weapons` unnested per player |
| B | `gear` | `match_end_armors` + `match_end_gadgets` unnested per player |
| C | `names` | `ta.v_user_4` for the user IDs rounds A–B found |
| C | `timeline` | errors, leaves, reconnects, crashes, backgrounds, app ends for those users in the window |
| C | `related` | other `match_id`s with the same prefix, and matches those players played ±15 min |

### Files touched

- new `stats_polygun_2.py`, new `static2/` (copy of `static/`), new `static2/sections-match.js`
- edited inside `static2/` only: `index.html`, `main.js`, `source.js`
- `stats_polygun.py`, `static/`, `preview/` are not touched.

### Blast radius

Tier T1. Nothing in the live path changes: a different file, a different folder, a different
port. Rollback is `rm stats_polygun_2.py PLAN-match.md && rm -rf static2`. The one shared
resource is the TE account, and the new server takes the same one-job-at-a-time lock, so two
servers running together can still put 2 queries on TE at once — the same ceiling as today,
because each server runs its own lock. If that ever shows up as TE concurrency errors, run
one server at a time.

### Tested (2026-09-21)

All four ID shapes from the channel resolve, checked against the Slack messages they came from:

| Match ID | What the page shows |
| --- | --- |
| `F-79b86f58-…-8df04d9d0000` | the two `spawn_error` rows (`spawn_rejected`, then `acceptance_timeout`), `RequestSpawn`, ping 235→299 (max 389), region `eu` — the whole 2026-09-21 "No weapon model in hand" report |
| `F-9bdbc71d-…-b58083f60000` | its derived sibling `…_654b76e8` in Related matches, which is the "2 Mummy in Push" report's second ID |
| `F-SquadLocalMatch1BB0B6EE…` | the 3-player squad Push on Memphis, `Success-timeout` at 62 s, 0–16, enemy side all bots |
| `Unknown_A77C19B2A0751900_…` | resolves, with four neighbouring matches including the `_a23c466a` derived ID |

Also checked: a PlayFab ID in the players table opens that player's own report and the rail swaps to the
player's sections; searching a match ID again swaps back; no horizontal page scroll at 1280 px or 375 px;
no console errors.

**Speed:** a match TE has not seen recently takes 15–120 s (the locator reads every partition). TE caches it,
so the second look is 3–12 s. The loading bar counts the ten queries.

**A single query can fail without losing the report.** TE threw two different transient failures on 2026-09-21:
HTTP 504 on `related`, and `Error reading from hdfs://…` on `weapons` after 209 s. Both are the warehouse having a
bad moment, not a wrong query, so two things changed:

- `run_sql` now retries a dropped warehouse read twice (`TRANSIENT_REASONS`). A plain timeout is deliberately **not**
  retried: the query already had its ten minutes. Being busy still gets five tries, as before.
- `run_all` takes an `optional` set. `ends` (the players) must work; `starts`, `searches`, `leaves`, `weapons`,
  `gear`, `timeline` and `related` each come back as `null` when they fail, and that panel alone says
  "TE gave up on this one query… search the ID again to retry it". The player search is untouched: it passes no
  `optional`, so it still fails as a whole.
- The error text a person sees is now one sentence ("Query failed: Error reading from the warehouse."), not a Java
  trace with an hdfs path in it.

The ID that failed, `Unknown_9980B88B5DE8E014_3505_134343222321230867_425fa68a`, went through in 7.6 s on retry.

### Round two (2026-09-22)

Four changes, all on the page; no server or query changes.

- **One rail for everything.** `held` now keys on kind and ID (`player:…` / `match:…`) and holds matches beside
  players, in search order, under a "Searches" heading. Each row carries an icon for its kind, and a match row shows
  its mode and map with the ID cut in the middle (`F-SquadLocal…481322546`), because the tail is what tells two
  derived IDs apart. `switchTo` dispatches on `entry.kind`; a rail click on a match renders from memory with no TE
  round trip. Typing an ID still asks the server again and replaces the held copy, for matches exactly as for players.
- **Scroll memory.** `switchTo` saves `window.scrollY` on whatever is on screen before it swaps, and puts the new
  entry's saved position back afterwards. `renderPeriod` restores the *old* scroll during a player render, so the
  restore runs after it and has the last word. A typed search always starts at the top; only a rail click returns to
  a saved position.
- **"Loadout"** instead of "Loadout & weapons", in the panel heading and the rail link.
- **Mode and map are two facts, each with the game's own icon.** The heading was one sentence
  ("Deathmatch on Parking lot"); it is now a MODE block and a MAP block side by side. The `<h1>` keeps the sentence
  as `sr-only`, so screen readers and the document outline are unchanged.

#### Icons

Copied from PolygonArena into `static2/icons/` (13 PNGs, 628 KB), keeping the game's own file names so a new icon
dropped in later matches the source:

- modes: `Assets/_PolygonArena/UI/ui_main_menu/ui_sprites_adressables/ui_game_mode_icon/` (200x200)
- maps: `Assets/_PolygonArena/UI/ui_main_menu/ui_sprites_adressables/ui_render_map_small/` (256x128)

TE's names and the art's names do not line up, so `sections-match.js` holds two tables built from the values TE
actually logs (checked 2026-09-20):

| TE `game_mode` | icon | TE `map` | icon |
| --- | --- | --- | --- |
| `DeathMatch` | `ffa` | `bank_heist` | `bank_heist` |
| `TeamDeathMatch` | `tdm` | `construction` | `construction_site` |
| `TutorialTeamDeatchMatchAI` | `tdm` | `farm_house` | `farm_house` |
| `ControlPoint` | `control_point` | `memphis` | `memphis` |
| `Heist` | `heist` | `parking_lot` | `parking_lot` |
| `Push` | `push` | `the_garden` | `the_garden` |
| `TrialMap` | `trial` | `item_trial` | `trial` |
| `TutorialMap` | none | `tutorial` | none |

A mode or map with no icon shows the name alone; the `<img>` stays hidden rather than showing a broken picture.
`TutorialTeamDeatchMatchAI` is spelled that way in the game, not a typo here.

#### Heading design (2026-09-22, second pass)

The first pass put the two facts in a plain row with 46 px icons, so the huge condensed type dwarfed the art and
the two halves ran together. Now the heading borrows the scoreboard's own tile language, right below it: two panes
sharing one hairline, `--surface` on `--hairline`, one 10 px radius around both.

- Icons doubled: modes 72x72, map renders 144x72 (the art's own 2:1), with an inset hairline so a bright render
  does not bleed into the surface. Both are 72 px tall, so the two panes line up.
- Each pane is its own `container-type: inline-size`, and the name is `clamp(22px, 9.5cqi, 44px)`, so it sizes
  itself to its pane: "Team Deathmatch", the longest mode, fits on one line at full width, and everything shrinks
  together on a narrow one.
- The panes stack when the *heading* drops under 700 px, not the window (`@container` on `#match-top`). The rail
  takes 290 px, so a 980 px window leaves the heading 649 px, and stacked full-width panes read better there than
  two cramped columns.
- A stale `.zone-match .player-name { font-size: clamp(32px, 6vw, 64px) }` from the first pass was overriding the
  new size at equal specificity; it belonged to the old one-sentence title and is gone.

#### Checked

Rail carried a match, a player and a second match together; scrolled a match to 1240 and a player to 800, went
away and back through the rail, and both came back to their own position; icons resolve for `Push`/`memphis` and
`DeathMatch`/`parking_lot`; no horizontal scroll at 1280 px or 375 px; no console errors.

### Accuracy, and the column that never had data (2026-09-22)

**Accuracy is the game's own number; Stats Polygun does no maths on it.** The page reads
`match_end_weapons.accuracy` and appends a `%`. The client fills it in
`ThinkingDataService.GetMatchWeaponStats` (PolygonArena,
`Assets/_GlobalFile/Scripts/Services/Runtime/ServiceInstances/ThinkingData/ThinkingDataService.cs:945`):

```csharp
var accuracy = 0;
if (weapon.Value.TotalShoot > 0)
    accuracy = (int)((float)weapon.Value.TotalHitCount / weapon.Value.TotalShoot * 100);
```

Hits divided by shots, times 100, truncated to a whole number. The two counters come from
`PlayerProfileSettings.cs`: `TotalShoot += obj.ShootData.Directions.Length` (line 991), so a shotgun blast counts
once per pellet direction, and `TotalHitCount++` (line 1037), one per registered hit.

Two things this explains, both measured over 1,123,158 weapon rows on 2026-09-20 (guns and melee only):

- **0% is common, 252,484 rows (22%).** A weapon with kills or time but no shots recorded — melee and ability
  slots — divides nothing and stays at zero.
- **Above 100% happens, 61 rows (0.005%), up to 200%.** More hits than shots, which one shot can produce.

The median is 4% and the mean 8%, so these are the game's numbers as the game counts them, not a hit rate a
player would recognise.

**So the column is gone** (Batuhan's call, 2026-09-22). A figure that reads as a hit rate, is not one, and is
nobody's to fix here is worse than no figure: it invites a wrong conclusion in a bug report. The `accuracy` field
came out of the payload and `weapon.w_acc` out of the SQL with it. `WEAPON_COLUMNS` still names `w_acc` — that
list is the struct's field order for `unnest`, so dropping the name there would shift `w_boost` and `w_dmg`.

**"Map choice" is gone from Matchmaking.** `map_selection` is empty on every row TE holds: 0 of 1,123,137
`battle_end` rows on 2026-09-20. The column was showing a dash for everyone, so it came out of both the search
table and the At-match-start table, along with the field in the payload and the two `coalesce(map_selection, '')`
reads in the SQL.

### Players panel: bars, and a column that was never there (2026-09-22)

A match where one side brought 55,063 league points against 3,500, and 2.5x the power, read as four ordinary
numbers in a table. Two changes, both on the page; `inventoryElo` was already in the payload, so no server work.

**`Power (team v enemy)` was never the player's power.** It is `team_power_avg` and `enemy_team_power_avg`, the
side averages, so every teammate carried the identical pair and nobody's own power was on the page at all. It only
looked per-player because the reported match was a 1v1. Measured on a real four-player TeamDeathMatch
(`F-fc1bd04e-3bee-f21e-a3ef-f8cbfeed0000`, 2026-09-20):

| player | `inventory_elo` (own) | `team_power_avg` (what the column showed) |
| --- | --- | --- |
| 5EEC46D4… | 7,418 | 6,076 |
| 25ED1207… | 4,733 | 6,076 |
| AA900D65… | 4,391 | 4,109 |
| 574372A0… | 3,826 | 4,109 |

So the table now has its own **Power** column from `inventory_elo`, with **Team power (v enemy)** kept beside it as
context, and the lede says which is which.

**Bars under Power and League points** (Batuhan's pick over a separate chart panel or a worded summary): a 4 px
track under the number, filled to that value's share of the biggest in this match. One table, no new panel, and
the 3,500-against-55,063 case reads as a stub against a full bar. A non-zero value keeps at least 2% of bar, so
"tiny" never renders as "none".

Checked on the four-player match (power bars 100 / 63.8 / 59.2 / 51.6%, league 85.3 / 100 / 67.5 / 59.4%, all
correct against the raw numbers) and on the reported 1v1 (power 44.4 / 100%, league 6.4 / 100%).

### Side by side (2026-09-23)

Per-row bars compare players; they never compared the two sides, which is the question a matchmaking report is
actually asking. New panel between the totals and the Players table, with its own rail link.

Each figure is **one bar split between the two sides**, coloured by how the match ended (blue won, red lost, the
same colours as the result chips). Values sit outside the bar at each end, so a 6% segment is still readable, and
the ratio is spelled out on the right (`B 15.7×`). Four rows: team power, league points (the side's average),
kills (total), score. A lede sentence names every gap over 15%, grouped by side:

> Side B had 2.3× the team power, 15.7× the league points, 2.5× the kills and 2.4× the score.

**When there are not two sides, the panel says so instead of inventing them.** Sides come from
`sideLetters`, which groups on result plus score pair:

- one group, which is what an all-bot enemy team looks like, gives "Only one side logged a match end".
- a free-for-all has no teams at all, so its groups are results, not sides. Two players are still a fair duel and
  get the comparison; six players with one winner would weigh one player against five and call them a side, so
  anything but two players falls back to the Players table.
- a free-for-all also logs the same score for everyone, so the score row is dropped there rather than printing
  the same number twice.

Checked on three real matches: the four-player TeamDeathMatch (`F-fc1bd04e-…`, team power 6,076 v 4,109 → A 1.5×,
league average 2,954 v 2,024, kills 20 v 18), the two-player free-for-all (`F-79b86f58-…`, three rows, no score
row, and the useful read "Side A had 1.3× the team power and 1.4× the league points; Side B had 3.0× the kills" —
the stronger account lost), and the all-bot squad Push (`F-SquadLocalMatch1BB0B6EE…`, one side, no bars). Mobile
stacks the label and the ratio onto their own rows; no horizontal scroll at 375 px, no console errors.

### Open questions

- None blocking. Answered 2026-09-21: `static2/` copy, all four extra blocks in, one search box
  that auto-detects a match ID.

### Round three (2026-10-14, after the merge)

- Players lede shortened to Batuhan's text. The "Team power (v enemy)" column is gone; the figure is said once in
  the lede ("side A 7,777 v 5,832"), left out for a free-for-all with more than two players.
- Boosters moved from the start table into Loadout as rows: Item = "name ×amount", Kind = Booster.
- Matchmaking and What went wrong panels replaced by one **Timeline** panel (`#match-timeline`): one shared line,
  one dot per search / start / end / timeline event, dots stacked into rows only where they would overlap, the
  match shaded, five time labels. Colour: accent = search/start/end, red = error/crash/reconnect failed/left,
  hollow = reconnect/app. Hover, tap or keyboard focus shows every field the old tables had, through the shared
  `SP.bindTips` tooltip. The old power-gap sentence was dropped (Side by side and the Players lede cover it).
- Checked on `F-79b86f58-…`: 13 dots, the two spawn_error dots show reason, ping 235 ms (max 250), region eu;
  no horizontal scroll at 375 px; no console errors.

### Round four (2026-10-14)

- `DeathMatch` shows as "Free For All" everywhere (`SP.MODE_NAMES` in `core.js`, so the player page too).
- The team power sentence left the Players lede. Side by side now also draws a match where only one side logged a
  match end: side B is built from side A's own rows (`enemyPower`, `enemyScore`, opposite result), labelled
  "bots only" or "N real players, no match end logged"; its league points and kills are unknown, so those rows are
  dropped. A zero side reads "Side A had all the team power" instead of a ratio.
- Timeline dots: a click pins the details open (`.tooltip.tip-pinned` takes the pointer, text selectable); a click
  elsewhere, Escape or the same dot closes it.
- Checked: Free For All title on `F-79b86f58-…`; pin and close on a real click; two-side `F-fc1bd04e-…` unchanged;
  the one-side view by rendering `F-fc1bd04e-…` with side B removed in the browser (no real one-side ID at hand).

### Round five (2026-10-14)

- Free For All side by side: players are named, not lettered (head, ratio chip, summary sentence, End reason tile).
- Related matches drop `TrialMap` rows in the page (no server restart needed).
- Found while checking `F-d0a63c1d-…`: the game clears its weapon stats only when it sends `battle_end`
  (`PlayerProfileSettings.GetWeaponAnalyticStatsDictionary`), and item trials send `battle_start` but no
  `battle_end`. So weapons used in trials before a match show up in that match's `match_end_weapons`
  (Player-E6A: 10 trials, then 17 weapons and ~71 weapon kills against 2 real kills). Game bug, not a page bug.
- Loadout: a gadget that is also in `match_end_weapons` (abilities, grenades, medkits) is one Gadget row with the
  weapon's kills, time and damage plus used/filled; it no longer shows twice.
- Timeline: `match_reconnect` / `_pawn` read "Match reconnect started/finished" and "Pawn reconnect …"; a dot whose
  `match_id` is a different match is faded (`.tl-elsewhere`, legend "Another match").

### Round six (2026-10-14)

- Free For All side by side is its own design for any player count: four small bar charts (Kills, K/D, Power,
  League points), one bar per player, sorted by kills, blue Victory / red Defeat. Placement is never logged and more
  than one player can get Victory (`F-2be3fd56-…`: 2 of 4), so kills is the order.
- Free For All tile "Real per side" became "Most kills" (number + leader names).
- Checked: `F-2be3fd56-…` (4 players), `F-79b86f58-…` (2 players), team match `F-fc1bd04e-…` unchanged; 375 px
  stacks the charts in one column with no sideways scroll; no console errors.
