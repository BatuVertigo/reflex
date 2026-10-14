# Stats CS — plan

## Task

Stats Polygun for Critical Strike: the same page (player search by name / PlayFab ID, match search by match_id),
reading Critical Strike's ThinkingData project instead of Polygun Arena's. Built 2026-10-14 while Batuhan was away
("Try to implement Stats Cs now for Critical Strike. I'll go so you are on your own.").

## Decisions made alone (Batuhan to confirm)

- **A copy, not a shared server.** `Stats CS/stats_cs.py` + `Stats CS/static/` are a copy of Stats Polygun, changed
  for Critical Strike. Reason: Stats Polygun is live on port 3800 for teammates, and Batuhan was away; a shared
  server would have meant changing the live file. The schemas also differ (see below). Merging the two into one
  server with a per-game config is possible later.
- **Port 3810** (`STATS_CS_PORT`). Stats Polygun keeps 3800.
- Polygun's mode/map icons are not copied (they are Polygun art). Critical Strike shows no icons yet.
- No Slack shortcut, no README entry, no launchd: Batuhan decides.
- Nothing committed.

## Critical Strike data (checked against TE project 7, 2026-10-14)

- Tables `ta.v_event_7`, `ta.v_user_7`. Same core events as Polygun: login, battle_search/start/end, player_left,
  match_reconnect, error, resource_earn/spend, inventory, ta_app_*. No reconnect_start/attempt/failed/success, no
  match_reconnect_pawn.
- `match_end_weapons`: row(id, name, category, lvl, power, kill_count, use_seconds, equipped_charm, equipped_skin,
  accuracy). **No damage, no boost.**
- `match_end_gadgets`: row(id, name, category, lvl, power, fill_count, use_count). No boost.
- No `match_end_armors`, no `boosters`, no `mm_league_point` / `mm_trophy_point`, no `is_custom_match`,
  `is_private_lobby`, `is_squad_mm`, `isprivatematch`, `auto_aim`, `bot_difficulties`, `reconnect_started`,
  `game_state`, `ping_max`, `phase`. Those read as empty.
- Resources are in **`resources2`** (row: item_id, item_name, item_type, quantity, final_amount); `resources` is
  always null (one heavy player, 2026-04..10). Currencies: SoftCurrency, HardCurrency, LuckyDraw.
- Modes: TeamDeathMatch, Defuse, KillConfirmed, ControlPoint, **DeathMatch and ArmsRace are free-for-all**
  (team_player_count 1), TrialMode (item trial), TutorialTeamDeatchMatchAI. Maps: afghanistan, antalya, assault,
  chernobly, favela, india, italy, korea, lake, manor, oasis, poolday, station, tokyo, toledo, trial.
- Match IDs: `F-<uuid>` and `Bot_<PlayFabID>_<digits>` (bot matches).
- Player names are up to 23 characters (Polygun: 10).
- Critical Strike is ~10× Polygun's volume (about 1M battle_end rows a day). A query without a player or match
  filter that unnests weapons does not finish.

## Steps

1. Copy server and page. — verify: files exist, Stats Polygun untouched.
2. Server: project 7, tables, port, missing columns as null, `resources2`, mode filter, weapon/gadget columns.
   — verify: `/api/find`, `/api/player`, `/api/player/<id>/period`, `/api/match` answer on 3810 for real players.
3. Page: names, title, modes, free-for-all modes, name length, item names. — verify: load each view in the
   browser, no console errors.

## Changes from Stats Polygun

- Server (`stats_cs.py`): project 7 and its tables; port 3810; names up to 23 characters; `resources2`; match filter
  without `TrialMode` / `Tutorial%`; weapon and gadget columns as listed above; columns Critical Strike lacks read as
  null; search time rounded (Critical Strike logs decimals); TE's `'<null>'` name text read as no name.
- Page (`static/`): title and wordmark "Stats CS", Batuhan's soldier logo (`logo-web.png`, 160 px, 2026-10-14), gold theme
  (`--accent` #9a6b00 light / #e8b53c dark, rarity ramp in gold), no mode/map icons; mode names; `SP.FREE_FOR_ALL` =
  DeathMatch + ArmsRace (Free For All design, Most kills tile); league floors 0/100/500/1000/2000/3000/4000/5000/10000;
  gun categories; Loadout drops the Damage and Boost columns; equip summary counts weapons, gadgets, characters,
  armor; search box checks a PlayFab ID first, then an F- / Bot_ match ID, then a name.
- Tutorial Team Deathmatch vs AI counts as a match (own mode, "Tutorial vs AI"; Batuhan, 2026-10-14): new accounts
  like Mubatu2 (`850E9AE1FFD000CE`) played only those and showed 0 matches. The Tutorial map and item trials stay out.
- **Level** (Batuhan, 2026-10-14: in Critical Strike the level matters more than the league). The top card shows the
  profile's `player_level` with "+N since match 1 · league points X"; a new Level chart (step line, a dot per level-up,
  summary line) sits in the period before League points. `player_level` is on every battle_end (one player: 1,772 of
  1,772 rows since April).
- **League points and level are logged after the match in Critical Strike, before it in Polygun** (checked 2026-10-14:
  Critical Strike row-to-previous change agrees with the result — wins 393 up / 12 down, losses 247 down / 0 up — while
  Polygun agrees with row-to-next instead). So Stats CS reads a match's start from the row before it (`battle_before`
  replaces Polygun's `battle_after`) and a day's end from its own last row. Polygun is right as it is.
- Two fixes made here first: a **draw** (same result and score for everyone) splits the sides
  by their team power pair instead of showing one side (ported to Stats Polygun 2026-10-14); an equal pair shows no "A 1.0×" chip (ported too).

## Tested (2026-10-14, port 3810, real data)

- Player `OMERASAFq` / `E7511372E219B066`: find 1.8 s, career 16.7 s (1,667 matches, six modes, 66 weapons),
  last 7 days 7.9 s (78 matches, every period panel renders).
- Matches: Kill Confirmed with bots `F-49ae67ce-…` (2 real players), Team Deathmatch draw `F-a06c8283-…` (13 players,
  sides 6 v 7), Arms Race `F-d568339c-…` (5 players, Free For All design), Free For All `F-7efdceb3-…` (6 players),
  bot match `Bot_676C9F958AEE1778_…` (1 player). No console errors.
- Not tested: phone layout, a player over the 20,000-row cap, two searches at once against Stats Polygun on the
  same TE account (each server has its own one-job lock, so TE can see 4 queries at once).

## How to run

From `reflex/`: `.venv/bin/python "Stats/Stats CS/stats_cs.py"`, then `http://<Mac IP>:3810`. Stop it with
`lsof -ti tcp:3810 -sTCP:LISTEN | xargs kill`.

## Open questions

- Keep a separate copy, or merge both games into one server with a per-game config?
- A Slack shortcut / README entry like Stats Polygun's?
- Critical Strike art for modes and maps (no CriticalStrike checkout on this Mac).
- Both servers share one TE account and each allows 2 queries; if TE answers "concurrency", run one at a time or
  share the lock.
