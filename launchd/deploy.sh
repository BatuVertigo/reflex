#!/bin/bash
# Deploys what is pushed to main onto the Mac mini and reloads the agents you name. Run from Batuhan's Mac on the
# office network (needs SSH access to the mini). Prompts and the Release Summary tables need no reload: routines read
# them at run time and stats.py reads the md files on every request, so a plain pull is enough for those.
#
#   bash launchd/deploy.sh                 # pull only
#   bash launchd/deploy.sh stats ops       # pull, then reload these agents
#   bash launchd/deploy.sh app --force     # reload app.py even while a job is running
set -euo pipefail

HOST="${REFLEX_MINI:-vertigoproduct@192.168.30.124}"
force=0
agents=()
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    *) agents+=("$arg") ;;
  esac
done

ssh "$HOST" bash -s -- "$force" "${agents[@]+"${agents[@]}"}" <<'REMOTE'
set -euo pipefail
force="$1"; shift
cd ~/GitHub/reflex
before="$(git rev-parse --short HEAD)"
GIT_TERMINAL_PROMPT=0 git pull -q --ff-only origin main
after="$(git rev-parse --short HEAD)"
echo "mini: $before -> $after"
if [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- requirements.txt; then
  .venv/bin/pip install -q -r requirements.txt && echo "pip: requirements installed"
fi
for agent in "$@"; do
  if [ "$agent" = app ] && [ "$force" != 1 ]; then
    # app.py may be in the middle of a Task Move or Bug Details; the dashboard knows.
    running="$(curl -s -m 3 http://127.0.0.1:3900/api/status | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["running"]))' 2>/dev/null || echo "?")"
    if [ "$running" != 0 ]; then
      echo "app: $running active job(s) or dashboard unreachable - not reloaded (add --force to override)"
      continue
    fi
  fi
  bash launchd/install.sh "$agent" | grep -E "^(loaded|removed)"
done
# stats.py opens its TE connection before it listens; give each port up to 30 s.
for port in 3800 3900; do
  code=000
  for _ in $(seq 1 15); do
    code="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/" || true)"
    [ "$code" = 200 ] && break
    sleep 2
  done
  printf "port %s: HTTP %s\n" "$port" "$code"
done
launchctl print "gui/$(id -u)/com.vertigo.reflex-app" | grep -m1 "state =" | sed 's/^[[:space:]]*/app: /'
REMOTE
