#!/usr/bin/env bash
# Note which udcap-server commit the bundled binaries were built from, so the
# release build (linux-release.sh) builds that same commit. Run by the sync
# scripts; takes the core checkout's path.
set -euo pipefail
CORE="$1"
REF="$(dirname "$0")/../udcap-server.ref"
git -C "$CORE" rev-parse HEAD >"$REF"
if [ -n "$(git -C "$CORE" status --porcelain --untracked-files=no)" ]; then
  echo "Note: $CORE has uncommitted changes. Releases only get what's committed and pushed to GitHub."
fi
