#!/usr/bin/env bash
# Build the Arch package on a non-Arch host (e.g. Fedora) using a throwaway
# Arch container. Needs podman (default on Fedora) or docker, and a built .deb.
#
#   ./build-in-container.sh [path/to/udcap-control_<ver>_amd64.deb]
#
# Defaults to the latest Tauri deb build. Outputs *.pkg.tar.zst next to this
# script. (You don't need this to publish to the AUR — there, users build it
# themselves; this is only for testing or shipping a prebuilt package.)
set -euo pipefail
cd "$(dirname "$0")"

DEB="${1:-$(ls -t ../../src-tauri/target/release/bundle/deb/udcap-control_*_amd64.deb 2>/dev/null | head -1)}"
[ -n "${DEB:-}" ] && [ -f "$DEB" ] || {
	echo "No .deb found — run 'pnpm tauri build' first, or pass the path."
	exit 1
}

ENGINE="$(command -v podman || command -v docker)" || {
	echo "Need podman or docker."
	exit 1
}

PKGVER="$(grep -oP '^pkgver=\K.*' PKGBUILD)"
WORK="$(mktemp -d)"
cp PKGBUILD "$WORK/"
cp "$DEB" "$WORK/udcap-control_${PKGVER}_amd64.deb" # makepkg reuses an existing source file

"$ENGINE" run --rm -v "$WORK:/pkg:Z" archlinux bash -c '
	pacman -Syu --noconfirm --needed base-devel >/dev/null 2>&1
	useradd -m builder && chown -R builder /pkg
	su builder -c "cd /pkg && makepkg -f --skipchecksums --nodeps"
	chown 0:0 /pkg/*.pkg.tar.zst
'

cp "$WORK"/*.pkg.tar.zst .
echo "Built: $(ls -1 *.pkg.tar.zst | tail -1)"
rm -rf "$WORK"
