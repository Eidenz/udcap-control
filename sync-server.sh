#!/usr/bin/env bash
# Build the UDCAP server from the core repo and copy it into this app so the
# packaged app is self-contained. Adjust CORE if your checkout lives elsewhere.
set -euo pipefail
CORE="${CORE:-$(cd "$(dirname "$0")/../UdCap-Community-HandDriver-Core" && pwd)}"
cmake --build "$CORE/build" --target udcap-server -j"$(nproc)"
cp "$CORE/build/udcap-server" "$(dirname "$0")/src-tauri/binaries/udcap-server"
echo "Synced udcap-server -> src-tauri/binaries/"
