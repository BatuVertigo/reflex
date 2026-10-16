# Ops dashboard (3900): layout + search detail

**Task:** Reorder the Ops page, merge Services and Projects into two service cards, add section icons, show the full
Turkish date, and show what was searched on Stats PA / Stats CS requests.

## Success criteria
- Order: Active requests → Services (2 cards) → Routines → Recent requests → Logs.
- `app.py` card: Reflex logo, launchd state (pid, last exit, last log write) + tiles for Bug Details, Task Move, Version Check.
- `stats.py` card: PA + CS logos, same launchd rows + tiles for Stats PA, Stats CS. One 24 h / 7 days / 30 days toggle for both.
- No `ops.py` card (ops.log stays in the Logs picker).
- Each section title has a small inline SVG icon: Active requests = pulse, Services = server, Routines = clock,
  Recent requests = history, Logs = terminal.
- Top right shows `16 Ekim 2026 14:03:22` instead of `2026-10-16 14:03:22`.
- Recent requests (and Active requests) Detail column for Stats rows shows the searched thing, e.g.
  `"Bob" · 1A2B3C4D5E6F · 2026-10-01..2026-10-10` (name, PlayFab ID, period dates, or match ID).

## Steps (1-5 done 16 Eki 2026, 6 waits for go)
1. `reflex_jobs.py`: `Jobs.start(..., searched="")` stores a `searched` field. Verify: new job in JSON has it.
2. `Stats/stats.py` `record_jobs`: pass `searched` = the text after the kind in `what` (`find "Bob"` → `"Bob"`,
   `career ID` → `ID`, `period ID from..to` → `ID from..to`, `match ID` → `ID`).
3. `Ops/ops.py` `requests_from`: collect the stages' `searched` words, deduped, into `request["searched"]`.
4. `Ops/index.html`: new layout, icons, date format, Detail column shows `searched`.
5. Verify: run ops.py + stats.py locally on a scratch `REFLEX_LOG_DIR`, run one PA search, check page in browser
   (light/dark, phone width).
   Done: dedup assert passed; desktop + 375 px checked; also fixed tables widening the page on a phone.
6. Deploy (only on your go): commit, push, `bash launchd/deploy.sh stats ops`.

## Files
`reflex_jobs.py`, `Stats/stats.py`, `Ops/ops.py`, `Ops/index.html` (+ docstrings that say "never an ID").

## Blast radius (privacy change)
- **Scope:** PlayFab IDs, player names and match IDs get written to `~/Library/Logs/Reflex/jobs-stats.json` on the mini
  (last 5000 jobs) and shown on 3900 (LAN, no password). `stats.log` keeps masking IDs as today.
- **Impact:** Reverses the current rule "jobs never hold an ID". Anyone on the office LAN can see who searched which player.
  The Stats page itself is LAN-only with no password too, so the audience is the same.
- **Rollback:** revert the commit + deploy; to erase stored IDs, delete the `searched` fields in `jobs-stats.json`.
- Old jobs have no `searched` → their Detail stays empty.
