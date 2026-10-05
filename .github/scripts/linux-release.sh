#!/usr/bin/env bash
# Build UDCAP Control's Linux packages (.deb, .rpm, .AppImage) the way releases
# are made: on Debian 12, so they run there and on anything newer, bundled
# udcap-server and SteamVR driver included. CI runs it in a `debian:12`
# container. It overwrites the bundled server, driver and voice cues with the
# release ones, so to try it locally, run it on a fresh clone (it builds what's
# committed, like CI):
#
#   git clone . /tmp/udcap-release && cd /tmp/udcap-release
#   podman run --rm -v "$PWD":/src:Z -w /src debian:12 \
#     bash -c '.github/scripts/linux-release.sh deps && .github/scripts/linux-release.sh build'
#
#   deps   system packages, Rust, Node + pnpm (as root, in the container)
#   build  udcap-server + the SteamVR driver, checks, then the packages into
#          dist/ with their SHA256SUMS
set -euo pipefail
cd "$(dirname "$0")/../.."

NODE_VERSION=22.20.0
PNPM_VERSION=10
SERVER_REPO=https://github.com/Eidenz/udcap-server

deps() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl wget file git pkg-config xz-utils xdg-utils \
    cmake libudev-dev \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev
  if ! command -v rustup >/dev/null && [ ! -x "$HOME/.cargo/bin/rustup" ]; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  fi
  if ! node --version 2>/dev/null | grep -q "^v${NODE_VERSION%%.*}\."; then
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1
  fi
  npm install -g "pnpm@${PNPM_VERSION}"
  curl -fsSL -o /usr/local/bin/appimagetool \
    https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x /usr/local/bin/appimagetool
}

# The server and the SteamVR driver, built from the udcap-server commit in
# .github/udcap-server.ref (the sync scripts record the one you built locally).
server() {
  local ref core ours theirs
  ref=$(cat .github/udcap-server.ref)
  core=${TMPDIR:-/tmp}/udcap-server
  rm -rf "$core"
  git init -q "$core"
  git -C "$core" fetch -q --depth 1 "$SERVER_REPO" "$ref"
  git -C "$core" checkout -q FETCH_HEAD
  echo "udcap-server at $ref"

  # The app, the server and the driver share one memory layout.
  ours=$(sed -n 's/^pub const SHM_VERSION: u32 = \([0-9]*\);$/\1/p' src-tauri/src/shm.rs)
  theirs=$(sed -n 's/^#define UDCAP_SHM_VERSION \([0-9]*\)u$/\1/p' "$core/shm/udcap_shm.h")
  if [ -z "$ours" ] || [ "$ours" != "$theirs" ]; then
    echo "Shared-memory version mismatch: app v${ours:-?}, udcap-server v${theirs:-?}" >&2
    exit 1
  fi

  CORE=$core ./sync-server.sh
  CORE=$core ./sync-steamvr.sh
}

# Tauri's AppImage needs a few fixes, so unpack it and pack it again:
# - It carries the build system's libwayland-*, and a newer Mesa can't set up
#   EGL next to them: WebKit's web process aborts, and the window stays empty
#   (invisible, being frameless). Every desktop has its own copy, so drop them.
# - Its .DirIcon is an absolute link into the build directory, so it points
#   nowhere on anyone else's machine and the AppImage shows no icon. Point it
#   at the biggest of the app's own icons instead (the 256x256 one).
# - Its Pango comes from this system but HarfBuzz is left to the host's, and
#   an older one (Ubuntu 22.04's) lacks what this Pango calls: the app dies at
#   launch. Bring this system's HarfBuzz along (about 1 MB).
# Unpacking makes every folder owner-only (and AppRun.wrapped comes as 0770):
# mounts that enforce permissions, like firejail's, then refuse to run it for
# anyone but root. Open them up before packing again.
fix_appimage() {
  local img work root icon
  img=$(realpath "$1")
  work=$(mktemp -d)
  root="$work/squashfs-root"
  (cd "$work" && "$img" --appimage-extract >/dev/null)
  rm -f "$root"/usr/lib/libwayland-*.so*
  cp -L /usr/lib/x86_64-linux-gnu/libharfbuzz.so.0 "$root/usr/lib/"
  # shellcheck disable=SC2012 # by size: the biggest file is the biggest icon
  icon=$(cd "$root" && ls -S usr/share/icons/hicolor/*/apps/*.png 2>/dev/null | head -n1)
  if [ -z "$icon" ]; then
    echo "No app icon in the AppImage for .DirIcon" >&2
    exit 1
  fi
  ln -sfn "$icon" "$root/.DirIcon"
  chmod -R go-w,a+rX "$root"
  ARCH=x86_64 appimagetool --no-appstream "$root" "$img"
  rm -rf "$work"
}

# Highest glibc symbol version a binary asks for, i.e. the oldest glibc it runs on.
glibc_floor() {
  objdump -T "$1" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1
}

build() {
  # shellcheck disable=SC1091
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
  export APPIMAGE_EXTRACT_AND_RUN=1 # no FUSE in a container

  local version
  version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' src-tauri/tauri.conf.json)
  # v0.7 for 0.7.0, v0.7.1 for 0.7.1.
  local tag=${GITHUB_REF_NAME:-}
  tag=${tag#v}
  if [ "${GITHUB_REF_TYPE:-}" = tag ] && [ "$tag" != "$version" ] && [ "$tag.0" != "$version" ]; then
    echo "Tag ${GITHUB_REF_NAME} doesn't match the app version ${version} (tauri.conf.json)" >&2
    exit 1
  fi

  server
  # Releases ship the voice cues in packaging/sounds/, not your local ones.
  mkdir -p static/sounds
  cp packaging/sounds/*.mp3 static/sounds/
  pnpm install --frozen-lockfile
  pnpm check
  pnpm tauri build
  (cd src-tauri && cargo test --release --locked)

  local bin
  for bin in src-tauri/target/release/udcap-control src-tauri/binaries/udcap-server \
    src-tauri/steamvr-driver/udcap/bin/linux64/driver_udcap.so; do
    echo "$(glibc_floor "$bin")  $bin"
  done

  rm -rf dist
  mkdir -p dist
  local bundle=src-tauri/target/release/bundle
  fix_appimage "$bundle"/appimage/*.AppImage
  cp "$bundle"/deb/*.deb "$bundle"/rpm/*.rpm "$bundle"/appimage/*.AppImage dist/
  (cd dist && sha256sum -- * >SHA256SUMS)
  ls -l dist
}

case "${1:-}" in
  deps) deps ;;
  build) build ;;
  *)
    echo "usage: $0 deps|build" >&2
    exit 2
    ;;
esac
