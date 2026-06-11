# UDCAP Control

![UDCAP Control](screenshot.png)

A Tauri 2 + Svelte 5 control panel for UDCAP (Udexreal) VR gloves on Linux — for
both **Monado** and **SteamVR**. It supervises `udcap-server`, shows live glove
status, runs guided calibration, tunes per-finger curl/splay and the per-hand
alignment offsets, remaps the controller inputs, and installs the SteamVR driver —
all over a shared-memory contract (`udcap_shm.h`).

## Run (dev)

```bash
pnpm install
./sync-server.sh        # build + bundle the udcap-server binary (once)
./sync-steamvr.sh       # build + bundle the SteamVR driver (once, for SteamVR mode)
pnpm tauri dev
```

## Monado & SteamVR

The same backend (`udcap-server` + the shared memory) drives both runtimes, only
the *consumer* differs. Pick one with the **Runtime mode** toggle on the dashboard;
it swaps the Space-tab alignment offsets to that runtime's set (their pose
conventions differ, so they tune separately).

- **Monado** — the native `drv_udcap` driver (built into your Monado).
- **SteamVR** — a bundled OpenVR driver the app installs with one click (dashboard
  in SteamVR mode → **Install**; Reinstall/Remove live in Settings). It registers
  the gloves as Index Knuckles, and **auto-updates** itself when you update the app.

## Screens

- **Status** — runtime-mode toggle, SteamVR driver install (first run), per-glove
  battery / FPS / firmware, live buttons + trigger/grip + joystick, VR-ready
  indicator, permissions setup.
- **Controls** — live controller readout + per-hand **vibration test**; a visual
  **hand-schema button map** (remap A/B/System/Stick and force trigger/grip from any
  glove input); and analog **trigger/grip** config — which finger drives each axis,
  with dual-range min/max sliders.
- **Calibrate** — guided fist → together → spread (both hands), via the GUI button
  or the glove **power button**, with audio cues.
- **Fingers** — per-finger **curl-range tuning** (live reading + draggable handles),
  global **curl strength**, and **finger splay**.
- **Space** — per-hand position/rotation alignment offsets (**per runtime mode**),
  tracker presets, tracker-serial mapping; live.
- **Settings** — server override, device permissions, **SteamVR driver** management,
  about + credits.

Frameless custom titlebar; dark Material-You design.

## Architecture

```
udcap-control (Tauri app)
  ├─ Rust: spawn/supervise udcap-server, mmap shm (seqlock reads), commands,
  │        one-click SteamVR-driver install (+ auto-update)
  └─ Svelte 5 (custom MD3): polls backend ~10Hz, renders + writes offsets/maps/commands
        │ shared memory (/dev/shm/udcap_hands)
        ▼
   udcap-server  →  reads gloves, publishes state, calibration + haptics + reconnection
        │ (same shm — two consumers, pick one at runtime)
        ├─ drv_udcap (Monado)     →  OpenXR Index controllers
        └─ driver_udcap (SteamVR) →  OpenVR Index/Knuckles controllers (+ skeletal fingers)
```

The `udcap-server` binary and the SteamVR `driver_udcap` are built from the
[UdCap-Community-HandDriver-Core](https://github.com/Eidenz/udcap-server) repo and
bundled into the app (system libs only) via `sync-server.sh` / `sync-steamvr.sh`.

## Packaging

`pnpm tauri build` produces **deb / rpm / AppImage**. Arch is covered by a
PKGBUILD in [`packaging/arch/`](packaging/arch/) (the AUR route) — see its README.

## Credits

UDCAP glove decoding by the **OldestNova** team (Community Hand Driver Core, MIT);
**Valve** OpenVR/SteamVR + the hand-skeleton sample; **Monado** (OpenXR runtime).
