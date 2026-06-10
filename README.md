# UDCAP Control

A Tauri 2 + Svelte 5 control panel for UDCAP (Udexreal) VR gloves on Linux/Monado.
It supervises `udcap-server`, shows live glove status, runs guided calibration,
and tunes the per-hand Space Orientation offsets — all over the shared-memory
contract (`udcap_shm.h`, v4).

## Run (dev)

```bash
pnpm install
pnpm tauri dev
```

The app talks to `udcap-server` via `/dev/shm/udcap_hands`. Press **Start server**
in the app to launch/supervise it (path configurable; defaults to the build at
`/home/eidenz/PROJECTS/UdCap-Community-HandDriver-Core/build/udcap-server`). Set
your tracker serials in the **Space** tab so pose attaches correctly.

Without gloves/hardware the app still runs and shows "Server offline" / empty
glove cards — useful for UI work.

## Screens (v1)

- **Status** — per-glove battery / FPS / firmware, live finger-curl bars, buttons,
  trigger/grip, joystick; VR-ready indicator.
- **Calibrate** — guided fist → together → spread, both hands, via the command channel.
- **Space** — per-hand position/rotation offsets with steppers + tracker presets,
  applied live; tracker-serial mapping.

## Architecture

```
udcap-control (Tauri)
  ├─ Rust: spawn/supervise udcap-server, mmap shm (seqlock reads), commands
  └─ Svelte 5 (custom MD3): polls backend ~10Hz, renders + writes offsets/commands
        │ shared memory (/dev/shm/udcap_hands)
        ▼
   udcap-server  →  reads gloves, publishes state, runs calibration on command
        │
   drv_udcap (Monado)  →  reads same shm → OpenXR Index controllers
```
