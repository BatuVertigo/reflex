#!/bin/bash
# Runs one Claude routine headless and records the run for the ops dashboard, then commits and pushes the files
# that routine owns (if they changed). launchd starts this on the routine's schedule; by hand:
#
#   bash launchd/run-routine.sh release-summary
#
# Needs: `claude` on PATH, logged in under CLAUDE_CONFIG_DIR; a git remote the Mac mini may push to.
# CLAUDE_BIN overrides the claude executable (tests use `true`-like stand-ins).
set -uo pipefail

name="${1:?routine name}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${REFLEX_LOG_DIR:-$HOME/Library/Logs/Reflex}"
CLAUDE="${CLAUDE_BIN:-claude}"

# owns: the files in this repo the routine may change. also_repo/also_owns: a second repo it writes to.
also_repo=""; also_owns=()
case "$name" in
  bug-watcher)     prompt="Bug Watcher/bug_watcher_prompt.md";         model="opus";   owns=() ;;
  release-summary) prompt="Release Summary/release_summary_prompt.md"; model="opus";   owns=("Release Summary/pa_release_summary.md" "Release Summary/cs_release_summary.md") ;;
  skill-catalog)   prompt="Skill Catalog/skill_catalog_prompt.md";     model="sonnet"; owns=("Skill Catalog/skill_catalog_state.json")
                   also_repo="$HOME/GitHub/VertigoAI"; also_owns=("docs/SKILL_CATALOG.md") ;;
  *) echo "unknown routine: $name"; exit 1 ;;
esac

mkdir -p "$LOGS/routines/$name"
started="$(date +%Y-%m-%dT%H:%M:%S%z)"
run_file="$LOGS/routines/$name/$(date +%Y%m%d-%H%M%S).json"
claude_out="$(mktemp)"

cd "$REPO"
"$CLAUDE" -p --output-format json --model "$model" --permission-mode bypassPermissions --no-session-persistence \
  "Read the file and follow all the instructions exactly: $REPO/$prompt" > "$claude_out" 2>"$claude_out.err"
exit_code=$?

# Commit and push only the files the routine owns, in each repo it writes to. "skipped" = nothing changed.
commit_owned() {
  local repo="$1"; shift
  [ $# -gt 0 ] || return 0
  if git -C "$repo" diff --quiet -- "$@"; then return 0; fi
  if git -C "$repo" add -- "$@" && git -C "$repo" commit -q -m "$name: $(date +%Y-%m-%d\ %H:%M)" -- "$@" && git -C "$repo" push -q; then
    echo ok
  else
    echo failed
  fi
}
push="skipped"
if [ $exit_code -eq 0 ]; then
  result="$(commit_owned "$REPO" "${owns[@]}")"
  [ -n "$also_repo" ] && result="$result $(commit_owned "$also_repo" "${also_owns[@]}")"
  result="$(echo $result)"
  [ -n "$result" ] && push="$result"
fi

# One JSON per run: what the dashboard reads. The claude envelope is kept whole; stderr only when claude failed.
python3 - "$run_file" "$name" "$started" "$exit_code" "$push" "$claude_out" <<'EOF'
import json, sys, time
run_file, name, started, exit_code, push, claude_out = sys.argv[1:]
try:
    claude = json.load(open(claude_out, encoding="utf-8"))
except Exception:
    claude = None
stderr = open(claude_out + ".err", encoding="utf-8", errors="replace").read()[-4000:] if exit_code != "0" else ""
json.dump({"routine": name, "started": started, "ended": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": int(exit_code),
           "push": push, "stderr": stderr, "claude": claude}, open(run_file, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
EOF
rm -f "$claude_out" "$claude_out.err"
echo "$(date +%H:%M:%S)  $name  exit=$exit_code  push=$push  $run_file"
exit $exit_code
