# Arch packaging

Tauri 2's bundler only targets **deb / rpm / appimage** — there's no native
`pacman` target — so Arch is covered with a **PKGBUILD** that repackages the
`.deb` Tauri already builds (the standard "-bin" AUR pattern).

## Releasing

1. Build the app as usual (`pnpm tauri build`) — it produces
   `src-tauri/target/release/bundle/deb/udcap-control_<ver>_amd64.deb`.
2. Upload that `.deb` to a GitHub release tagged `v<ver>`.
3. In [`PKGBUILD`](./PKGBUILD): set `url` to your repo, bump `pkgver`, and either
   keep `sha256sums=('SKIP')` or pin the real hash (`updpkgsums`).
4. Generate the AUR metadata and publish:
   ```bash
   makepkg --printsrcinfo > .SRCINFO
   # commit PKGBUILD + .SRCINFO to the AUR repo (aur.archlinux.org)
   ```

Arch users then install with `yay -S udcap-control-bin` (or `makepkg -si`).

## Building the package yourself (optional)

You don't need this to publish to the AUR — there, each user's machine builds it.
It's only for testing the recipe or shipping a prebuilt `.pkg.tar.zst`.

**On Arch:** `makepkg -si` (with a built deb named per the PKGBUILD's `source`).

**On Fedora / any non-Arch host:** use the throwaway Arch container — no real Arch
install needed, just `podman` (default on Fedora) or `docker`:

```bash
pnpm tauri build                 # produces the .deb
./build-in-container.sh          # -> udcap-control-bin-<ver>.pkg.tar.zst here
```

> The package installs the same `/usr` layout as the deb, including the bundled
> `udcap-server` and the SteamVR driver, so the in-app installer works the same
> on Arch.
