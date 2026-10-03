#!/usr/bin/env bash
# Build the UDCAP server from the core repo and copy it into this app so the
# packaged app is self-contained. Adjust CORE if your checkout lives elsewhere.
# Release builds (CI) build the core commit this records in
# .github/udcap-server.ref, so commit that file along with the app.
set -euo pipefail
CORE="${CORE:-$(cd "$(dirname "$0")/../UdCap-Community-HandDriver-Core" && pwd)}"
[ -d "$CORE/build" ] || cmake -S "$CORE" -B "$CORE/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$CORE/build" --target udcap-server -j"$(nproc)"
mkdir -p "$(dirname "$0")/src-tauri/binaries"
cp "$CORE/build/udcap-server" "$(dirname "$0")/src-tauri/binaries/udcap-server"
echo "Synced udcap-server -> src-tauri/binaries/"
"$(dirname "$0")/.github/scripts/record-server-ref.sh" "$CORE"
