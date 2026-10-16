#!/bin/bash
# Loads (or reloads) Reflex's launchd agents for the logged-in user on the Mac mini. Safe to run again: each agent
# is unloaded first, then loaded. `install.sh --uninstall` removes them all.
#
#   bash launchd/install.sh                 # all six agents
#   bash launchd/install.sh stats ops       # only these
#   bash launchd/install.sh --uninstall
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"
LOGS="$HOME/Library/Logs/Reflex"
ALL=(app stats ops bug-watcher release-summary skill-catalog)

uninstall=0
names=()
for arg in "$@"; do
  case "$arg" in
    --uninstall) uninstall=1 ;;
    *) names+=("$arg") ;;
  esac
done
[ ${#names[@]} -eq 0 ] && names=("${ALL[@]}")

mkdir -p "$AGENTS" "$LOGS/routines"

for name in "${names[@]}"; do
  label="com.vertigo.reflex-$name"
  source="$HERE/$label.plist"
  target="$AGENTS/$label.plist"
  [ -f "$source" ] || { echo "no such agent: $name"; exit 1; }
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  if [ $uninstall -eq 1 ]; then
    rm -f "$target"
    echo "removed $label"
    continue
  fi
  cp "$source" "$target"
  launchctl bootstrap "$DOMAIN" "$target"
  echo "loaded  $label"
done

[ $uninstall -eq 1 ] || launchctl print "$DOMAIN" | grep -o 'com\.vertigo\.reflex-[a-z-]*' | sort -u | sed 's/^/  /'
