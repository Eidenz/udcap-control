#!/usr/bin/env bash
# Build the UDCAP SteamVR driver from the core repo and copy it into this app so
# the packaged app can install it without the core checkout. Adjust CORE if your
# checkout lives elsewhere.
set -euo pipefail
CORE="${CORE:-$(cd "$(dirname "$0")/../UdCap-Community-HandDriver-Core" && pwd)}"
SVR="$CORE/steamvr"
[ -d "$SVR/build" ] || cmake -S "$SVR" -B "$SVR/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$SVR/build" -j"$(nproc)"
DST="$(dirname "$0")/src-tauri/steamvr-driver/udcap"
mkdir -p "$DST/bin/linux64"
cp "$SVR/udcap/driver.vrdrivermanifest" "$DST/driver.vrdrivermanifest"
cp "$SVR/udcap/bin/linux64/driver_udcap.so" "$DST/bin/linux64/driver_udcap.so"
echo "Synced driver_udcap.so -> src-tauri/steamvr-driver/udcap/"
