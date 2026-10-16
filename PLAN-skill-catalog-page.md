# Plan: Skill Catalog page on Stats (port 3800)

**Task:** Show the skill catalog at `http://productmacmini.local:3800/skill-catalog/` and stop the Skill Catalog routine from
editing the Slack canvas. The "Kullanım örnekleri" part at the top of the canvas stays on the canvas.

## Success criteria

- `GET /skill-catalog/` returns 200 and shows every section and every skill row in `docs/SKILL_CATALOG.md`.
- `/skill-catalog` (no slash) redirects to `/skill-catalog/`, like `/releases/pa`.
- The page shows the "Son güncelleme" time from the md.
- The routine prompt no longer reads or writes the canvas. It no longer uses `slack_read_canvas` or `slack_update_canvas`.
- The Release and Stats pages still work.

## Options considered

| Option | Trade-off |
|---|---|
| **A. Read `~/GitHub/VertigoAI/docs/SKILL_CATALOG.md` on every request (recommended)** | Same as the release pages, which read their md on each request. No copy and no new routine step. The page shows the latest file the routine pulled or wrote. |
| B. Copy the md into the reflex repo on every routine run | Two copies of the same file, plus one more file the routine must commit. |
| C. Build a static HTML file in the routine | Claude writes HTML on every run. More tokens, and a design change needs a routine change. |

## Steps

1. `Stats/stats.py`: add `skill_catalog_page()` next to `release_page()`. Read the md and render it with the `markdown`
   package that is already installed. Add the route and the redirect. Get the path from `VERTIGOAI_DIR`, with the
   default `~/GitHub/VertigoAI`. If the file is missing, show a short message instead of a traceback.
   *Check:* local `curl` gives 200, and the page has the same row count as the md.
2. `Stats/skill_catalog.html`: a new template with the same look as `release.html` (Archivo, Inter, Plex Mono, the
   same color tokens, light and dark). It has a search box, section chips with skill counts, and one table per section.
   *Check:* look at the page in the browser pane, in light, dark and phone width.
3. `Skill Catalog/skill_catalog_prompt.md`: remove "Görev 2 — Slack canvasını aynala" and the canvas lines in the
   constants, closing report and guardrails. The report gives the page URL instead.
   *Check:* `grep -n canvas` finds nothing that tells the routine to touch the canvas.
4. Update the `stats.py` docstring and its "Stats is up" line. Add the new route to the README if the README lists routes.
5. Commit and push (ask first), then run `bash launchd/deploy.sh stats` on the mini.
   *Check:* `curl http://productmacmini.local:3800/skill-catalog/` gives 200.

## Files

`Stats/stats.py`, `Stats/skill_catalog.html` (new), `Skill Catalog/skill_catalog_prompt.md`, and maybe `Stats/index.html`
and `README.md`.

## Blast radius

- Scope: one new route and template, one prompt change, and one stats agent restart.
- Impact: the stats agent restarts for about 2 seconds. If `stats.py` breaks, the Stats and Release pages go down too.
- Rollback: `git revert <commit>` and then `bash launchd/deploy.sh stats`.

## Decisions (Batuhan, 2026-10-16)

1. Canvas: delete the old `# Skill Catalog` part once and put a one-line link to the page in its place. The part
   above it ("🎯 Skills", "Kullanım örnekleri") stays as it is. Do this with the Slack connector on this Mac, because
   the AITester user gets `canvas_not_found`.
2. Page: a search box, section chips with counts, and one table per section.
3. `/` returns 404. `/stats` stays the game picker, but without the release links. The release and skill catalog pages
   are reached only by their direct address for now. A shared hub page comes later.
   (The Slack shortcut already hands out `<STATS_URL>/stats`, so the 404 on `/` does not break it.)
